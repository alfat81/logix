import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from './db'
import { verifyPassword } from './password'
import { hashSessionToken } from './portal-auth'
import {
  CompanyUserError,
  createCustomerUser,
  updateCustomerUser,
  setCustomerUserActive,
  getPrimaryCustomerUser,
  createBrokerUser,
  updateBrokerUser,
  setBrokerUserActive,
  getPrimaryBrokerUser,
  authenticateCustomerLogin,
  authenticateBrokerLogin,
} from './company-users'
import { createClientSession, getCurrentClient, CLIENT_SESSION_COOKIE } from './client-auth'
import { createBrokerSession, getCurrentBroker, BROKER_SESSION_COOKIE } from './broker-auth'
import {
  GET as accessGet,
  POST as accessPost,
  PATCH as accessPatch,
} from '@/app/api/admin/customers/[id]/access/route'
import {
  POST as brokerUsersPost,
  PATCH as brokerUsersPatch,
} from '@/app/api/admin/brokers/[id]/users/route'

// ─── DF-02A: пользователи компании — единая точка (company-users) ────
// Интеграционный уровень (как events.test.ts): против реального
// PostgreSQL. Проверяются правила выдачи доступа И1, суженные до
// человека: хеширование пароля, привязка «пароль → телефон», маркеры
// уникальности (внутри компании / между компаниями / глобально у
// брокера), разрыв сессий при смене пароля и деактивации, запрет
// деактивации основного пользователя (перенос старого входа компании).

// Уникальный маркер прогона: телефоны/имена только свои (чужие
// данные из живой базы и прошлых прогонов не задеваем).
const RUN = Date.now() % 1e8
// +7 + '90' + 8 цифр — валидный нормализованный телефон, уникальный
// в пределах прогона.
function phone(offset: number): string {
  return '+790' + String((RUN + offset) % 1e8).padStart(8, '0')
}

let customerA = '' // компания с доступом (основной пользователь)
let customerB = '' // вторая компания — перекрёстные проверки
let customerC = '' // компания без пользователей (getPrimary → null)
let brokerA = ''
let brokerB = ''

async function expectError(p: Promise<unknown>, status: number): Promise<Error> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(CompanyUserError)
    expect((e as CompanyUserError).status).toBe(status)
    return e as Error
  }
  throw new Error(`ожидали CompanyUserError ${status}, ошибки не было`)
}

beforeAll(async () => {
  const a = await db.customer.create({ data: { name: 'DF02A-A ' + RUN, phone: phone(1) } })
  const b = await db.customer.create({ data: { name: 'DF02A-B ' + RUN, phone: phone(2) } })
  const c = await db.customer.create({ data: { name: 'DF02A-C ' + RUN, phone: phone(3) } })
  customerA = a.id
  customerB = b.id
  customerC = c.id
  const ba = await db.broker.create({ data: { companyName: 'DF02A-BA ' + RUN, phone: phone(4), password: 'scrypt:fixture-df02a' } })
  const bb = await db.broker.create({ data: { companyName: 'DF02A-BB ' + RUN, phone: phone(5), password: 'scrypt:fixture-df02a' } })
  brokerA = ba.id
  brokerB = bb.id
})

afterAll(async () => {
  // Каскад: пользователи и сессии уходят вместе с компаниями.
  await db.customer.deleteMany({ where: { id: { in: [customerA, customerB, customerC] } } })
  await db.broker.deleteMany({ where: { id: { in: [brokerA, brokerB] } } })
})

describe('createCustomerUser — правила выдачи доступа (И1, суженные до человека)', () => {
  it('хеширует пароль, нормализует телефон, ставит дефолты', async () => {
    // Сырой формат как из UI: 8 (90ХХХХХХХХ) — 11 цифр, нормализуется
    // в '+7' + '90' + 8 цифр = phone(10).
    const rawPhone = '8 (90' + String((RUN + 10) % 1e8).padStart(8, '0') + ')'
    const u = await createCustomerUser(db, customerA, {
      name: '  Иванов Иван  ',
      phone: rawPhone,
      password: 'secret-1',
    })
    expect(u.name).toBe('Иванов Иван')
    expect(u.phone).toBe(phone(10))
    expect(u.isActive).toBe(true)
    expect(u.isPrimary).toBe(false)
    expect(u.password).toBeTruthy()
    expect(verifyPassword('secret-1', u.password!)).toBe(true)
  })

  it('контакт без входа: пароль не задан — password null', async () => {
    const u = await createCustomerUser(db, customerA, { name: 'Петров Пётр', phone: phone(11) })
    expect(u.password).toBeNull()
  })

  it('пароль без телефона не выдаётся (вход идёт по телефону)', async () => {
    await expectError(
      createCustomerUser(db, customerA, { name: 'Без телефона', password: 'secret-2' }),
      400
    )
  })

  it('мусорный телефон — ошибка, а не молчаливый null', async () => {
    await expectError(
      createCustomerUser(db, customerA, { name: 'Мусор', phone: '12345', password: 'long-pass-1' }),
      400
    )
  })

  it('мусорный email — ошибка', async () => {
    await expectError(
      createCustomerUser(db, customerA, { name: 'Мусор', email: 'не-почта' }),
      400
    )
  })

  it('дубль телефона внутри компании — 409', async () => {
    await expectError(
      createCustomerUser(db, customerA, { name: 'Дубль', phone: phone(11) }),
      409
    )
  })

  it('тот же телефон у пользователя другой компании — 409 (второй вход не сработал бы)', async () => {
    await expectError(
      createCustomerUser(db, customerB, { name: 'Чужой', phone: phone(11) }),
      409
    )
  })

  it('второй основной пользователь компании — 409', async () => {
    await createCustomerUser(db, customerA, { name: 'Основной A', phone: phone(12), isPrimary: true })
    await expectError(
      createCustomerUser(db, customerA, { name: 'Основой дубль', phone: phone(13), isPrimary: true }),
      409
    )
  })
})

describe('updateCustomerUser — семантика правки', () => {
  it('«не передано» оставляет значения, null очищает, телефон нормализуется', async () => {
    const u = await createCustomerUser(db, customerB, { name: 'Сидоров', phone: phone(21), email: 'a@b.ru' })
    const same = await updateCustomerUser(db, u.id, { name: 'Сидоров С.' })
    expect(same.phone).toBe(phone(21))
    expect(same.email).toBe('a@b.ru')
    const renamed = await updateCustomerUser(db, u.id, { phone: '8 (911) 222-33-44' })
    expect(renamed.phone).toBe('+79112223344')
    const cleared = await updateCustomerUser(db, u.id, { email: null })
    expect(cleared.email).toBeNull()
    expect(cleared.phone).toBe('+79112223344')
  })

  it('смена пароля рвёт сессии ЭТОГО пользователя, коллеги не задеты', async () => {
    const u1 = await createCustomerUser(db, customerB, { name: 'Парольный', phone: phone(31), password: 'old-pass' })
    const u2 = await createCustomerUser(db, customerB, { name: 'Коллега', phone: phone(32), password: 'col-pass' })
    const future = new Date(Date.now() + 86400_000)
    await db.clientSession.create({ data: { customerId: customerB, userId: u1.id, token: 'tok-u1-' + RUN, expiresAt: future } })
    await db.clientSession.create({ data: { customerId: customerB, userId: u2.id, token: 'tok-u2-' + RUN, expiresAt: future } })
    await db.clientSession.create({ data: { customerId: customerB, token: 'tok-null-' + RUN, expiresAt: future } })

    await updateCustomerUser(db, u1.id, { password: 'new-pass' })

    const u1Sessions = await db.clientSession.count({ where: { userId: u1.id } })
    const u2Sessions = await db.clientSession.count({ where: { userId: u2.id } })
    const nullSessions = await db.clientSession.count({ where: { token: 'tok-null-' + RUN } })
    expect(u1Sessions).toBe(0)
    expect(u2Sessions).toBe(1)
    expect(nullSessions).toBe(1)

    const updated = await db.customerUser.findUniqueOrThrow({ where: { id: u1.id } })
    expect(verifyPassword('new-pass', updated.password!)).toBe(true)
    expect(verifyPassword('old-pass', updated.password!)).toBe(false)
  })

  it('пароль на пользователе без телефона (правка «на пусто») — 400', async () => {
    const u = await createCustomerUser(db, customerB, { name: 'С паролем', phone: phone(41), password: 'long-pass-1' })
    await expectError(updateCustomerUser(db, u.id, { phone: null }), 400)
  })

  it('несуществующий пользователь — 404', async () => {
    await expectError(updateCustomerUser(db, 'no-such-user', { name: 'X' }), 404)
  })
})

describe('setCustomerUserActive — деактивация с закрытием сессий', () => {
  it('деактивация рвёт только свои сессии; повторная активация возвращает', async () => {
    const u = await createCustomerUser(db, customerB, { name: 'Деактивируемый', phone: phone(51), password: 'long-pass-2' })
    const future = new Date(Date.now() + 86400_000)
    await db.clientSession.create({ data: { customerId: customerB, userId: u.id, token: 'tok-dea-' + RUN, expiresAt: future } })

    const off = await setCustomerUserActive(db, u.id, false)
    expect(off.isActive).toBe(false)
    expect(await db.clientSession.count({ where: { userId: u.id } })).toBe(0)

    const on = await setCustomerUserActive(db, u.id, true)
    expect(on.isActive).toBe(true)
  })

  it('основной пользователь деактивации не подлежит (409)', async () => {
    const primary = await getPrimaryCustomerUser(db, customerA)
    expect(primary).not.toBeNull()
    await expectError(setCustomerUserActive(db, primary!.id, false), 409)
  })

  it('getPrimaryCustomerUser: null у компании без пользователей', async () => {
    expect(await getPrimaryCustomerUser(db, customerC)).toBeNull()
  })
})

describe('брокерская ветка — та же семантика, глобальная уникальность', () => {
  it('создание, хеширование, основной пользователь', async () => {
    const u = await createBrokerUser(db, brokerA, {
      name: 'Брокер Основной',
      phone: phone(61),
      password: 'broker-pass',
      isPrimary: true,
    })
    expect(u.isPrimary).toBe(true)
    expect(verifyPassword('broker-pass', u.password!)).toBe(true)
    const primary = await getPrimaryBrokerUser(db, brokerA)
    expect(primary?.id).toBe(u.id)
  })

  it('глобальный дубль телефона (другой брокер) — 409', async () => {
    await expectError(
      createBrokerUser(db, brokerB, { name: 'Занято', phone: phone(61) }),
      409
    )
  })

  it('тот же телефон у пользователя клиента — не конфликт (разные таблицы)', async () => {
    const u = await createCustomerUser(db, customerC, { name: 'Совпадение', phone: phone(61) })
    expect(u.phone).toBe(phone(61))
  })

  it('смена пароля рвёт сессии пользователя, деактивация — тоже; primary не деактивируется', async () => {
    const u = await createBrokerUser(db, brokerB, { name: 'Брокер Б', phone: phone(62), password: 'broker-pass-1' })
    const future = new Date(Date.now() + 86400_000)
    await db.brokerSession.create({ data: { brokerId: brokerB, userId: u.id, token: 'tok-bb-' + RUN, expiresAt: future } })

    await updateBrokerUser(db, u.id, { password: 'broker-pass-2' })
    expect(await db.brokerSession.count({ where: { userId: u.id } })).toBe(0)

    await db.brokerSession.create({ data: { brokerId: brokerB, userId: u.id, token: 'tok-bb2-' + RUN, expiresAt: future } })
    const off = await setBrokerUserActive(db, u.id, false)
    expect(off.isActive).toBe(false)
    expect(await db.brokerSession.count({ where: { userId: u.id } })).toBe(0)

    const primary = await getPrimaryBrokerUser(db, brokerA)
    expect(primary).not.toBeNull()
    await expectError(setBrokerUserActive(db, primary!.id, false), 409)
  })
})

// ─── Блок 3: вход и сессии — учётка человек, скоуп компания ──────────
// Guard перебора отключён (DISABLE_RATE_LIMIT — как в CI): лимиты
// login-guard проверяются его собственным контуром/e2e, здесь важен
// порядок «сверка → 401/403» и то, что сессия получает ОБА идентификатора.
describe('вход (authenticate*) и сессии пользователя', () => {
  let custOk = '' // компания активна, primary с паролем
  let custCompanyOff = '' // компания деактивирована
  let brokerOk = ''
  let brokerCompanyOff = ''
  let plainReq: NextRequest

  beforeAll(async () => {
    process.env.DISABLE_RATE_LIMIT = 'true'
    plainReq = new NextRequest('http://localhost/api/auth/client/login', { method: 'POST' })

    const a = await db.customer.create({ data: { name: 'DF02A-LOGIN-A ' + RUN, phone: phone(71) } })
    custOk = a.id
    await createCustomerUser(db, custOk, {
      name: 'Основной вход',
      phone: phone(72),
      password: 'login-pass',
      isPrimary: true,
    })
    const b = await db.customer.create({
      data: { name: 'DF02A-LOGIN-B ' + RUN, phone: phone(73), isActive: false },
    })
    custCompanyOff = b.id
    await createCustomerUser(db, custCompanyOff, {
      name: 'Вход закрытой',
      phone: phone(74),
      password: 'closed-pass-1',
      isPrimary: true,
    })
    const ba = await db.broker.create({
      data: { companyName: 'DF02A-BA-LOGIN ' + RUN, phone: phone(75), password: 'scrypt:fixture-df02a' },
    })
    brokerOk = ba.id
    await createBrokerUser(db, brokerOk, {
      name: 'Брокер вход',
      phone: phone(76),
      password: 'broker-login-pass',
      isPrimary: true,
    })
    const bb = await db.broker.create({
      data: { companyName: 'DF02A-BB-LOGIN ' + RUN, phone: phone(77), password: 'scrypt:fixture-df02a', isActive: false },
    })
    brokerCompanyOff = bb.id
    await createBrokerUser(db, brokerCompanyOff, {
      name: 'Брокер закрытый',
      phone: phone(78),
      password: 'closed-pass-2',
      isPrimary: true,
    })
  })

  afterAll(async () => {
    delete process.env.DISABLE_RATE_LIMIT
    await db.customer.deleteMany({ where: { id: { in: [custOk, custCompanyOff] } } })
    await db.broker.deleteMany({ where: { id: { in: [brokerOk, brokerCompanyOff] } } })
  })

  it('верный телефон/пароль основного пользователя — ok, компания приложена', async () => {
    const r = await authenticateCustomerLogin(plainReq, phone(72), 'login-pass')
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.user.customerId).toBe(custOk)
      expect(r.user.customer.name).toContain('DF02A-LOGIN-A')
    }
  })

  it('неверный пароль и неизвестный телефон — invalid (одна формулировка, 401)', async () => {
    expect((await authenticateCustomerLogin(plainReq, phone(72), 'wrong')).kind).toBe('invalid')
    expect((await authenticateCustomerLogin(plainReq, phone(999), 'login-pass')).kind).toBe('invalid')
  })

  it('деактивирован человек — closed (403 после сверки пароля)', async () => {
    const u = await createCustomerUser(db, custOk, {
      name: 'Выключенный',
      phone: phone(79),
      password: 'off-pass',
    })
    await setCustomerUserActive(db, u.id, false)
    const r = await authenticateCustomerLogin(plainReq, phone(79), 'off-pass')
    expect(r.kind).toBe('closed')
    expect((r as { message: string }).message).toContain('Доступ в кабинет закрыт')
  })

  it('деактивирована компания — closed даже при верном пароле', async () => {
    const r = await authenticateCustomerLogin(plainReq, phone(74), 'closed-pass-1')
    expect(r.kind).toBe('closed')
  })

  it('брокер: ok / invalid / закрытая компания — зеркально', async () => {
    const ok = await authenticateBrokerLogin(plainReq, phone(76), 'broker-login-pass')
    expect(ok.kind).toBe('ok')
    expect((await authenticateBrokerLogin(plainReq, phone(76), 'nope')).kind).toBe('invalid')
    const off = await authenticateBrokerLogin(plainReq, phone(78), 'closed-pass-2')
    expect(off.kind).toBe('closed')
    expect((off as { message: string }).message).toContain('Доступ в портал закрыт')
  })

  it('сессия получает ОБА идентификатора, getCurrentClient отдаёт человека и компанию', async () => {
    const r = await authenticateCustomerLogin(plainReq, phone(72), 'login-pass')
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    const token = await createClientSession(r.user.id)
    const row = await db.clientSession.findUnique({ where: { token: hashSessionToken(token) } })
    expect(row).not.toBeNull()
    expect(row!.userId).toBe(r.user.id)
    expect(row!.customerId).toBe(custOk)

    const req = new NextRequest('http://localhost/api/client/anything', {
      headers: { cookie: `${CLIENT_SESSION_COOKIE}=${token}` },
    })
    const current = await getCurrentClient(req)
    expect(current).not.toBeNull()
    expect(current!.id).toBe(custOk) // скоупинг прежний — компания
    expect(current!.userId).toBe(r.user.id)
    expect(current!.userName).toBe('Основной вход')
    expect(current!.name).toContain('DF02A-LOGIN-A') // шапка — компания
  })

  it('сессия брокера зеркально; сессия без пользователя = не найдена', async () => {
    const r = await authenticateBrokerLogin(plainReq, phone(76), 'broker-login-pass')
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    const token = await createBrokerSession(r.user.id)
    const req = new NextRequest('http://localhost/api/broker/anything', {
      headers: { cookie: `${BROKER_SESSION_COOKIE}=${token}` },
    })
    const current = await getCurrentBroker(req)
    expect(current).not.toBeNull()
    expect(current!.id).toBe(brokerOk)
    expect(current!.userId).toBe(r.user.id)
    expect(current!.userName).toBe('Брокер вход')

    // Легаси/деплой-окно: сессия с userId null не пускает (вход заново)
    await db.clientSession.create({
      data: { customerId: custOk, token: 'tok-nulluser-' + RUN, expiresAt: new Date(Date.now() + 86400_000) },
    })
    const legacyReq = new NextRequest('http://localhost/api/client/anything', {
      headers: { cookie: `logix_client_session=tok-nulluser-${RUN}` },
    })
    expect(await getCurrentClient(legacyReq)).toBeNull()
  })
})

// ─── Блок 5: роуты списка людей — access и brokers/[id]/users ────────
// Диалог доступа стал списком людей: создание (первый = primary с
// зеркалом пароля в старое поле), правка/деактивация, зеркала только
// для primary (страховка отката на v0.6.1). Телефон-логин и хеши
// наружу не отдаются.
describe('роуты списка людей (Блок 5): access и brokers/[id]/users', () => {
  let empReq: NextRequest
  let cust5 = ''
  let brok5 = ''

  beforeAll(async () => {
    process.env.DISABLE_RATE_LIMIT = 'true'
    const emp = await db.employee.create({
      data: {
        name: 'Менеджер Б5 ' + RUN,
        phone: phone(80),
        password: 'scrypt:fixture-b5',
        roles: '["master"]',
      },
    })
    const token = 'tok-emp-b5-' + RUN
    await db.employeeSession.create({
      data: { employeeId: emp.id, token: hashSessionToken(token), expiresAt: new Date(Date.now() + 86400_000) },
    })
    empReq = new NextRequest('http://localhost/api/admin/anything', {
      headers: { cookie: `logix_employee_session=${token}` },
    })
    const c = await db.customer.create({ data: { name: 'DF02A-B5 ' + RUN, phone: phone(81) } })
    cust5 = c.id
    const b = await db.broker.create({ data: { companyName: 'DF02A-B5-BR ' + RUN, phone: phone(82), password: 'scrypt:fixture-df02a' } })
    brok5 = b.id
  })

  afterAll(async () => {
    await db.customer.deleteMany({ where: { id: cust5 } })
    await db.broker.deleteMany({ where: { id: brok5 } })
    await db.employee.deleteMany({ where: { name: 'Менеджер Б5 ' + RUN } })
  })

  const p = (id: string) => ({ params: Promise.resolve({ id }) })

  it('access: первый пользователь = primary, зеркало пароля в Customer.password', async () => {
    const res = await accessPost(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Иван Б5', phone: phone(83), password: 'primary-pass-1' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(res.status).toBe(201)
    const { userId } = (await res.json()) as { userId: string }

    const user = await db.customerUser.findUniqueOrThrow({ where: { id: userId } })
    expect(user.isPrimary).toBe(true)

    const company = await db.customer.findUniqueOrThrow({ where: { id: cust5 } })
    expect(verifyPassword('primary-pass-1', company.password!)).toBe(true)

    const list = await accessGet(empReq, p(cust5))
    const body = (await list.json()) as { users: Array<Record<string, unknown>> }
    expect(body.users).toHaveLength(1)
    expect(body.users[0]).toMatchObject({ isPrimary: true, hasPassword: true, isActive: true })
    // хеш не покидает сервер
    expect('password' in body.users[0]).toBe(false)
  })

  it('access: второй пользователь — не primary, зеркало не перетирает старый пароль', async () => {
    const res = await accessPost(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Мария Б5', phone: phone(84), password: 'second-pass-1' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(res.status).toBe(201)
    const { userId } = (await res.json()) as { userId: string }
    const user = await db.customerUser.findUniqueOrThrow({ where: { id: userId } })
    expect(user.isPrimary).toBe(false)

    const company = await db.customer.findUniqueOrThrow({ where: { id: cust5 } })
    // в зеркале по-прежнему пароль PRIMARY, а не второго человека
    expect(verifyPassword('primary-pass-1', company.password!)).toBe(true)
    expect(verifyPassword('second-pass-1', company.password!)).toBe(false)
  })

  it('access: дубли телефона 409, короткий пароль 400, пароль без телефона 400', async () => {
    const dup = await accessPost(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Дубль', phone: phone(83), password: 'long-pass-9' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(dup.status).toBe(409)

    const short = await accessPost(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Короткий', phone: phone(85), password: 'коротко' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(short.status).toBe(400)

    const noPhone = await accessPost(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Без телефона', password: 'long-pass-9' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(noPhone.status).toBe(400)
  })

  it('access: смена пароля primary обновляет зеркало; деактивация primary 409, второй — сессии рвутся', async () => {
    const users = await db.customerUser.findMany({ where: { customerId: cust5 } })
    const primary = users.find((u) => u.isPrimary)!
    const second = users.find((u) => !u.isPrimary)!

    const changed = await accessPatch(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        body: JSON.stringify({ userId: primary.id, password: 'primary-pass-2' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(changed.status).toBe(200)
    const company = await db.customer.findUniqueOrThrow({ where: { id: cust5 } })
    expect(verifyPassword('primary-pass-2', company.password!)).toBe(true)

    const offPrimary = await accessPatch(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        body: JSON.stringify({ userId: primary.id, isActive: false }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(offPrimary.status).toBe(409)

    const future = new Date(Date.now() + 86400_000)
    await db.clientSession.create({
      data: { customerId: cust5, userId: second.id, token: 'tok-b5-' + RUN, expiresAt: future },
    })
    const offSecond = await accessPatch(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        body: JSON.stringify({ userId: second.id, isActive: false }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(cust5)
    )
    expect(offSecond.status).toBe(200)
    expect(await db.clientSession.count({ where: { userId: second.id } })).toBe(0)
  })

  it('brokers users: isFirst=primary с зеркалом, второй не primary, смена пароля primary зеркалит, primary 409', async () => {
    // Фикстура создана напрямую в БД — пользователей нет: первый POST
    // становится primary (страховка isFirst) и зеркалит пароль в
    // Broker.password (то же делает справочник POST Блока 3).
    const first = await brokerUsersPost(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Первичный Б5', phone: phone(87), password: 'primary-br-pass' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(brok5)
    )
    expect(first.status).toBe(201)
    const { userId: primaryId } = (await first.json()) as { userId: string }
    const primaryRow = await db.brokerUser.findUniqueOrThrow({ where: { id: primaryId } })
    expect(primaryRow.isPrimary).toBe(true)
    const company0 = await db.broker.findUniqueOrThrow({ where: { id: brok5 } })
    expect(verifyPassword('primary-br-pass', company0.password)).toBe(true)
    const primary = { id: primaryId, isPrimary: true }

    const res = await brokerUsersPost(
      new NextRequest('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({ name: 'Второй Б5', phone: phone(86), password: 'second-pass-2' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(brok5)
    )
    expect(res.status).toBe(201)
    const { userId } = (await res.json()) as { userId: string }
    const created = await db.brokerUser.findUniqueOrThrow({ where: { id: userId } })
    expect(created.isPrimary).toBe(false)

    const changed = await brokerUsersPatch(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        body: JSON.stringify({ userId: primary.id, password: 'primary-br-pass' }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(brok5)
    )
    expect(changed.status).toBe(200)
    const company = await db.broker.findUniqueOrThrow({ where: { id: brok5 } })
    expect(verifyPassword('primary-br-pass', company.password)).toBe(true)

    const offPrimary = await brokerUsersPatch(
      new NextRequest('http://localhost/x', {
        method: 'PATCH',
        body: JSON.stringify({ userId: primary.id, isActive: false }),
        headers: { 'Content-Type': 'application/json', cookie: `logix_employee_session=tok-emp-b5-${RUN}` },
      }),
      p(brok5)
    )
    expect(offPrimary.status).toBe(409)
  })
})
