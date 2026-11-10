import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from './db'
import { hashSessionToken } from './portal-auth'
import {
  CompanyUserError,
  PHONE_CODE_MAX_ATTEMPTS,
  PHONE_CODE_TTL_MINUTES,
  createCustomerUser,
  rebindCustomerUser,
  startPhoneChange,
  confirmPhoneChange,
  updateCustomerUser,
} from './company-users'
import { employeeActor } from './activity'
import {
  POST as phoneChangePost,
} from '@/app/api/admin/customers/[id]/access/phone-change/route'
import {
  POST as phoneConfirmPost,
} from '@/app/api/admin/customers/[id]/access/phone-confirm/route'
import {
  POST as rebindPost,
  PATCH as accessPatch,
} from '@/app/api/admin/customers/[id]/access/route'

// ─── Поток A волна 2 (DF-25): операции доступа + AUD-03 ──────────────
// Интеграционный уровень против реального PostgreSQL (по образцу
// company-users.test.ts): BL-8 — двухшаговая смена телефона с кодом
// (хеш, TTL 15 мин, лимит 5, атомарный одноразовый захват), BL-9 —
// перепривязка к другой компании (блокировка строки, гашение сессий,
// событие), AUD-03 — физическая уникальность CustomerUser.phone
// (8 параллельных выдач с одним телефоном → 1×201 + 7×409).

const RUN = Date.now() % 1e8
function phone(offset: number): string {
  return '+791' + String((RUN + offset) % 1e8).padStart(8, '0')
}

let customerA = ''
let customerB = ''
let customerInactive = ''
let empId = ''

async function expectError(p: Promise<unknown>, status: number): Promise<CompanyUserError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(CompanyUserError)
    expect((e as CompanyUserError).status).toBe(status)
    return e as CompanyUserError
  }
  throw new Error(`ожидали CompanyUserError ${status}, ошибки не было`)
}

beforeAll(async () => {
  const a = await db.customer.create({ data: { name: 'DF25-A ' + RUN, phone: phone(1) } })
  const b = await db.customer.create({ data: { name: 'DF25-B ' + RUN, phone: phone(2) } })
  const i = await db.customer.create({
    data: { name: 'DF25-I ' + RUN, phone: phone(3), isActive: false },
  })
  customerA = a.id
  customerB = b.id
  customerInactive = i.id
  const emp = await db.employee.create({
    data: { name: 'DF25 менеджер ' + RUN, phone: phone(4), password: 'df25-pass', roles: '["manager"]' },
  })
  empId = emp.id
})

afterAll(async () => {
  await db.customer.deleteMany({ where: { id: { in: [customerA, customerB, customerInactive] } } })
  await db.employee.deleteMany({ where: { id: empId } })
  // События — глобальные (без цели), каскадом не уходят: чистим по актёру
  await db.activity.deleteMany({ where: { actorId: empId } })
})

const actor = () => employeeActor({ id: empId, name: 'DF25 менеджер' })

// ── BL-8: смена телефона ──────────────────────────────────────────────

describe('BL-8 startPhoneChange — шаг 1', () => {
  it('выдаёт код (ручной режим: код в ответе), пишет pending-заявку', async () => {
    const u = await createCustomerUser(db, customerA, {
      name: 'BL8 пользователь',
      phone: phone(10),
      password: 'bl8-pass-1',
    })
    const res = await startPhoneChange(db, customerA, u.id, '8 (91 ' + String((RUN + 11) % 1e8).padStart(8, '0') + ')')
    expect(res.delivery).toBe('manual_by_manager')
    expect(res.code).toMatch(/^\d{6}$/)
    // TTL — 15 минут (допуск на задержку теста)
    const ttlMin = (res.expiresAt.getTime() - Date.now()) / 60_000
    expect(ttlMin).toBeGreaterThan(PHONE_CODE_TTL_MINUTES - 1)
    expect(ttlMin).toBeLessThanOrEqual(PHONE_CODE_TTL_MINUTES)

    const row = await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })
    expect(row.pendingPhone).toBe(phone(11))
    expect(row.phoneCodeHash).not.toBeNull()
    // В БД — хеш, открытого кода нет
    expect(row.phoneCodeHash).not.toContain(res.code!)
    expect(row.phoneCodeAttempts).toBe(0)
    // Текущий телефон не тронут — вход работает до подтверждения
    expect(row.phone).toBe(phone(10))
  })

  it('тот же номер → 400; мусорный номер → 400', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 б', phone: phone(12) })
    await expectError(startPhoneChange(db, customerA, u.id, phone(12)), 400)
    await expectError(startPhoneChange(db, customerA, u.id, '12345'), 400)
  })

  it('занятый глобально номер → 409 (внутри компании и cross)', async () => {
    const other = await createCustomerUser(db, customerA, { name: 'BL8 в', phone: phone(13) })
    const changer = await createCustomerUser(db, customerA, { name: 'BL8 г', phone: phone(14) })
    // тот же телефон в другой компании → 409 cross
    const inB = await createCustomerUser(db, customerB, { name: 'BL8 д', phone: phone(15) })
    await expectError(startPhoneChange(db, customerA, changer.id, phone(13)), 409)
    await expectError(startPhoneChange(db, customerA, changer.id, phone(15)), 409)
    // чужой пользователь той же компании
    await expectError(startPhoneChange(db, customerA, changer.id, phone(13)), 409)
    expect(other.phone).toBe(phone(13))
    expect(inB.phone).toBe(phone(15))
  })

  it('чужая компания/чужой пользователь → 404 (скоупинг строки URL)', async () => {
    const u = await createCustomerUser(db, customerB, { name: 'BL8 е', phone: phone(16) })
    await expectError(startPhoneChange(db, customerA, u.id, phone(17)), 404)
  })

  it('повторный шаг 1 перезаписывает код (поля одни на пользователя)', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 ж', phone: phone(18) })
    const first = await startPhoneChange(db, customerA, u.id, phone(19))
    const second = await startPhoneChange(db, customerA, u.id, phone(20))
    expect(second.code).not.toBe(first.code)
    const row = await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })
    expect(row.pendingPhone).toBe(phone(20))
    // Старый код больше не принимается
    const stale = await confirmPhoneChange(db, customerA, u.id, first.code!, actor())
    expect(stale.ok).toBe(false)
  })
})

describe('BL-8 confirmPhoneChange — шаг 2 (атомарный одноразовый захват)', () => {
  it('happy path: верный код меняет телефон, pending очищен, событие с режимом доставки', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 з', phone: phone(21), password: 'bl8-pass-2' })
    await db.clientSession.create({
      data: { userId: u.id, customerId: customerA, token: 'tok-bl8-a-' + RUN, expiresAt: new Date(Date.now() + 86_400_000) },
    })
    const start = await startPhoneChange(db, customerA, u.id, phone(22))
    const r = await confirmPhoneChange(db, customerA, u.id, start.code!, actor())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.phone).toBe(phone(22))

    const row = await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })
    expect(row.phone).toBe(phone(22))
    expect(row.pendingPhone).toBeNull()
    expect(row.phoneCodeHash).toBeNull()
    expect(row.phoneCodeAttempts).toBe(0)
    // Сессии НЕ гасятся (смена логина ≠ компрометация устройства)
    expect(await db.clientSession.count({ where: { userId: u.id } })).toBe(1)

    const ev = await db.activity.findFirst({
      where: { type: 'customer_user_phone_changed', actorId: empId },
      orderBy: { createdAt: 'desc' },
    })
    expect(ev).not.toBeNull()
    expect(ev?.description).toContain(phone(21))
    expect(ev?.description).toContain(phone(22))
    expect(ev?.description).toContain('manual_by_manager')
    expect(ev?.audience).toEqual(['staff'])
  })

  it('неверный код → 400, попытка инкрементируется, телефон не меняется', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 и', phone: phone(23) })
    await startPhoneChange(db, customerA, u.id, phone(24))
    const r = await confirmPhoneChange(db, customerA, u.id, '000000', actor())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
    const row = await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })
    expect(row.phone).toBe(phone(23))
    expect(row.phoneCodeAttempts).toBe(1)
  })

  it('истёкший код → 400 (TTL проверяется захватом)', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 к', phone: phone(25) })
    const start = await startPhoneChange(db, customerA, u.id, phone(26))
    await db.customerUser.update({
      where: { id: u.id },
      data: { phoneCodeExpiresAt: new Date(Date.now() - 60_000) },
    })
    const r = await confirmPhoneChange(db, customerA, u.id, start.code!, actor())
    expect(r.ok).toBe(false)
  })

  it('повторное применение того же кода → 400 (одноразовость)', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 л', phone: phone(27) })
    const start = await startPhoneChange(db, customerA, u.id, phone(28))
    const first = await confirmPhoneChange(db, customerA, u.id, start.code!, actor())
    expect(first.ok).toBe(true)
    // Код применён — hash очищен; второй вызов → «заявки нет»
    const again = await confirmPhoneChange(db, customerA, u.id, start.code!, actor())
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.message).toContain('Заявки на смену телефона нет')
  })

  it('параллельные подтверждения одним кодом → ровно одно ok (гонка захвата)', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 м', phone: phone(29) })
    const start = await startPhoneChange(db, customerA, u.id, phone(30))
    // Обе операции — в интерактивных транзакциях (как из роутов):
    // захват атомарен и одним updateMany, победа ровно у одного
    const [a, b] = await Promise.all([
      db.$transaction((tx) => confirmPhoneChange(tx, customerA, u.id, start.code!, actor())),
      db.$transaction((tx) => confirmPhoneChange(tx, customerA, u.id, start.code!, actor())),
    ])
    const winners = [a, b].filter((r) => r.ok)
    expect(winners).toHaveLength(1)
    const row = await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })
    expect(row.phone).toBe(phone(30))
  })

  it('лимит 5 попыток — верный код после исчерпания отклоняется; новый запрос кода сбрасывает счётчик', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 н', phone: phone(31) })
    const start = await startPhoneChange(db, customerA, u.id, phone(32))
    for (let i = 0; i < PHONE_CODE_MAX_ATTEMPTS; i += 1) {
      const r = await confirmPhoneChange(db, customerA, u.id, '111111', actor())
      expect(r.ok).toBe(false)
    }
    expect((await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })).phoneCodeAttempts).toBe(PHONE_CODE_MAX_ATTEMPTS)
    // ВЕРНЫЙ код той же заявки после исчерпания лимита — отказ (нужен
    // новый запрос кода — он перезаписывает заявку и сбрасывает счётчик)
    const blocked = await confirmPhoneChange(db, customerA, u.id, start.code!, actor())
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.message).toContain('Лимит')
    expect((await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })).phone).toBe(phone(31))
    const fresh = await startPhoneChange(db, customerA, u.id, phone(33))
    const ok = await confirmPhoneChange(db, customerA, u.id, fresh.code!, actor())
    expect(ok.ok).toBe(true)
  })

  it('исчерпанный лимит блокирует подтверждение старой заявки до нового кода', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 о', phone: phone(34) })
    const start = await startPhoneChange(db, customerA, u.id, phone(35))
    await db.customerUser.update({
      where: { id: u.id },
      data: { phoneCodeAttempts: PHONE_CODE_MAX_ATTEMPTS },
    })
    const r = await confirmPhoneChange(db, customerA, u.id, start.code!, actor())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('Лимит')
    // телефон не изменился
    expect((await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })).phone).toBe(phone(34))
  })
})

describe('BL-8 контрактный гард PATCH доступа', () => {
  it('PATCH с phone → 400 с подсказкой (третье сужение контракта)', async () => {
    const emp = new NextRequest('http://localhost/x', {
      headers: { cookie: `logix_employee_session=tok-bl8-route-${RUN}` },
    })
    await db.employeeSession.create({
      data: { employeeId: empId, token: hashSessionToken(`tok-bl8-route-${RUN}`), expiresAt: new Date(Date.now() + 86_400_000) },
    })
    const u = await createCustomerUser(db, customerA, { name: 'BL8 п', phone: phone(36) })
    const p = { params: Promise.resolve({ id: customerA }) }
    const res = await accessPatch(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        body: JSON.stringify({ userId: u.id, phone: phone(37) }),
        headers: { 'Content-Type': 'application/json', cookie: emp.headers.get('cookie') ?? '' },
      }),
      p
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Изменить телефон')
    expect((await db.customerUser.findUniqueOrThrow({ where: { id: u.id } })).phone).toBe(phone(36))
  })

  it('роут phone-change/phone-confirm: права write, happy path по HTTP', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL8 р', phone: phone(38), password: 'bl8-pass-3' })
    const p = { params: Promise.resolve({ id: customerA }) }
    const cookie = { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-bl8-route-${RUN}` }
    const res1 = await phoneChangePost(
      new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ userId: u.id, newPhone: phone(39) }), headers: cookie }),
      p
    )
    expect(res1.status).toBe(200)
    const { code, delivery, expiresAt } = await res1.json()
    expect(delivery).toBe('manual_by_manager')
    expect(code).toMatch(/^\d{6}$/)
    expect(expiresAt).toBeTruthy()
    const res2 = await phoneConfirmPost(
      new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ userId: u.id, code }), headers: cookie }),
      p
    )
    expect(res2.status).toBe(200)
    expect((await res2.json()).phone).toBe(phone(39))
  })
})

// ── AUD-03: физическая уникальность телефона ─────────────────────────

describe('AUD-03 — уникальность CustomerUser.phone (индекс + backstop P2002)', () => {
  it('8 параллельных выдач с одним телефоном → 1×201 + 7×409, одна строка (К-12)', async () => {
    const target = phone(40)
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        createCustomerUser(db, customerB, { name: 'AUD03 гонка', phone: target, password: 'race-pass-1' })
          .then((u) => ({ ok: true as const, id: u.id }))
          .catch((e) => ({ ok: false as const, status: (e as CompanyUserError).status }))
      )
    )
    const ok = results.filter((r) => r.ok)
    const conflicts = results.filter((r) => !r.ok)
    expect(ok).toHaveLength(1)
    expect(conflicts).toHaveLength(7)
    for (const c of conflicts) expect(c.status).toBe(409)
    expect(await db.customerUser.count({ where: { phone: target } })).toBe(1)
  })

  it('8 параллельных PATCH разных пользователей на один новый телефон → 1×200 + 7×409', async () => {
    // Восемь пользователей с РАЗНЫМИ текущими телефонами; все восемь
    // одновременно пишут ОДИН новый номер — выигрыш ровно один (гонка
    // findFirst→update закрывается индексом + backstop P2002)
    const racers = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        createCustomerUser(db, customerA, { name: 'AUD03 п' + i, phone: phone(60 + i) })
      )
    )
    const target = phone(70)
    const results = await Promise.all(
      racers.map((u) =>
        updateCustomerUser(db, u.id, { phone: target })
          .then(() => ({ ok: true as const }))
          .catch((e) => ({ ok: false as const, status: (e as CompanyUserError).status }))
      )
    )
    const ok = results.filter((r) => r.ok)
    const conflicts = results.filter((r) => !r.ok)
    expect(ok).toHaveLength(1)
    for (const c of conflicts) expect(c.status).toBe(409)
    expect(await db.customerUser.count({ where: { phone: target } })).toBe(1)
  })
})

// ── BL-9: перепривязка ───────────────────────────────────────────────

describe('BL-9 rebindCustomerUser — перепривязка к другой компании', () => {
  it('happy path: customerId сменён, сессии погашены, событие записано', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL9 а', phone: phone(50), password: 'bl9-pass-1' })
    await db.clientSession.create({
      data: { userId: u.id, customerId: customerA, token: 'tok-bl9-a-' + RUN, expiresAt: new Date(Date.now() + 86_400_000) },
    })
    const updated = await rebindCustomerUser(db, customerA, u.id, customerB, actor())
    expect(updated.customerId).toBe(customerB)
    expect(await db.clientSession.count({ where: { userId: u.id } })).toBe(0)
    const ev = await db.activity.findFirst({
      where: { type: 'customer_user_rebound', actorId: empId },
      orderBy: { createdAt: 'desc' },
    })
    expect(ev).not.toBeNull()
    expect(ev?.description).toContain('DF25-A')
    expect(ev?.description).toContain('DF25-B')
    // В новой компании пользователь в списке доступа
    expect(await db.customerUser.count({ where: { customerId: customerB, id: u.id } })).toBe(1)
  })

  it('primary → 409; целевая = текущая → 409; неактивная целевая → 409; чужой userId → 404', async () => {
    const primary = await createCustomerUser(db, customerA, { name: 'BL9 б', phone: phone(51), isPrimary: true })
    await expectError(rebindCustomerUser(db, customerA, primary.id, customerB, actor()), 409)

    const plain = await createCustomerUser(db, customerA, { name: 'BL9 в', phone: phone(52) })
    await expectError(rebindCustomerUser(db, customerA, plain.id, customerA, actor()), 409)
    await expectError(rebindCustomerUser(db, customerA, plain.id, customerInactive, actor()), 409)
    await expectError(rebindCustomerUser(db, customerA, plain.id, 'df25-missing-' + RUN, actor()), 404)
    // Пользователь другой компании (не в customerA) → 404
    const inB = await createCustomerUser(db, customerB, { name: 'BL9 г', phone: phone(53) })
    await expectError(rebindCustomerUser(db, customerA, inB.id, customerB, actor()), 404)
  })

  it('параллельные перепривязки → одна компания-владелец, ни одной тихой потери (К-13)', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'BL9 д', phone: phone(54) })
    // Обе перепривязки — в интерактивных транзакциях (как из роута):
    // FOR UPDATE держит блокировку до коммита, второй видит смену
    // customerId под блокировкой и получает 409
    const results = await Promise.allSettled([
      db.$transaction((tx) => rebindCustomerUser(tx, customerA, u.id, customerB, actor())),
      db.$transaction((tx) => rebindCustomerUser(tx, customerA, u.id, customerB, actor())),
    ])
    // Ровно один победитель (блокировка строки + перепроверка под ней);
    // второй получает 409 — ни одна операция не теряется молча
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CompanyUserError)
    // Финал консистентен: ровно одна компания-владелец, строка одна,
    // сессии погашены, событие перепривязки записано победителем
    expect(await db.customerUser.count({ where: { id: u.id, customerId: customerB } })).toBe(1)
    expect(await db.customerUser.count({ where: { id: u.id } })).toBe(1)
    expect(await db.clientSession.count({ where: { userId: u.id } })).toBe(0)
    expect(await db.activity.count({ where: { type: 'customer_user_rebound', actorId: empId } })).toBeGreaterThan(0)
  })
})
