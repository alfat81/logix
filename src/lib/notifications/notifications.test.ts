import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../db'
import { emitEvent } from '../events'
import { employeeActor } from '../activity'
import { clearSettingsCache, getSetting, setSetting } from '../settings'
import { dueWindow, nowInZone, windowKeyOf } from './windows'
import { dispatchPendingBatch } from './dispatch'
import { processRegularDigests } from './digest'

// ─── DF-03: очередь уведомлений и письма трёх режимов (D33) ──────────
// Интеграционный уровень: против реального PostgreSQL (паттерн
// events.test.ts / participants.test.ts). Проверяются карточка DF-03
// («Проверки») и матрица §8:
//   • режим выбирается по фазе заявки (immediate_phases) —
//     согласование уходит сразу, перевозка копится в окна;
//   • динамика этапа: done → клиенту, problem → красный
//     ответственному + клиенту нейтрально (аудит №16);
//   • дедупликация одиночных писем 10-минутным окном;
//   • антишторм красных (red_max_per_hour → в ближайшее окно);
//   • дайджест собирает ровно накопленное, пустой не отправляется,
//     лимит в сутки работает, смена окон меняет поведение без выката;
//   • allowlist в непроизводственном окружении;
//   • internal-заметка и «молчаливые» типы писем не порождают;
//   • деактивированный получатель письма не получает;
//   • письмо брокеру без цен (шаблон числа не добавляет).
//
// Диспетчер в тестах — только через dispatchPendingBatch/processRegularDigests:
// автоматический scheduleDispatch выключен env VITEST (dispatch.ts).

const RUN = Date.now() % 1e8
function phone(offset: number): string {
  return '+793' + String((RUN + offset) % 1e8).padStart(8, '0')
}
const MARK = 'DF03T-' + RUN // «T» — отличие от e2e-маркера «DF03 » (общая БД)
const DOMAIN = 'test.example'
const staffEmail = `staff-${RUN}@${DOMAIN}`
const clientEmail = `client-${RUN}@${DOMAIN}`
const client2Email = `client2-${RUN}@${DOMAIN}`
const brokerEmail = `broker-${RUN}@${DOMAIN}`

const ids = {
  employees: [] as string[],
  customers: [] as string[],
  brokers: [] as string[],
  orders: [] as string[],
  leads: [] as string[],
  contracts: [] as string[],
  legalEntities: [] as string[],
}

let assigneeId = ''
let clientUserId = ''
let client2UserId = ''
let brokerUserId = ''
let customerCompanyId = ''
let orderCalc = '' // заявка в расчёте (согласование → immediate)
let orderRun = '' // заявка «в работе» (перевозка → regular)
let brokerId = ''
let stageRun = ''

// Снимок настроек — восстановление в afterAll (настройки глобальные).
let prevWindows: string[]
let prevRedMax: number
let prevMaxRegular: number
let prevRedTypes: string[]
let prevStaffMode: string

beforeAll(async () => {
  // Зачистка застрявших pending от прерванных прогонов и e2e (адреса
  // @test.example — только тестовые фикстуры): глобальный скан дайджеста
  // собирает ВСЕ pending regular, чужие строки ломают арифметику теста.
  await db.notification.deleteMany({ where: { toAddress: { contains: '@test.example' }, status: 'pending' } })

  prevWindows = await getSetting('notifications.client_digest_times')
  prevRedMax = await getSetting('notifications.red_max_per_hour')
  prevMaxRegular = await getSetting('notifications.max_regular_per_day')
  prevRedTypes = await getSetting('notifications.red_event_types')
  prevStaffMode = await getSetting('notifications.staff_mode')

  const assignee = await db.employee.create({
    data: { name: 'Менеджер DF-03 ' + RUN, phone: phone(1), password: 'scrypt:df03-fixture', email: staffEmail, roles: JSON.stringify(['manager']), isActive: true },
    select: { id: true },
  })
  assigneeId = assignee.id
  ids.employees.push(assigneeId)

  const company = await db.customer.create({
    data: {
      name: 'Клиент DF-03 ' + RUN,
      phone: phone(2),
      users: {
        create: [
          { name: 'Иван Клиент', email: clientEmail, phone: phone(3), password: 'scrypt:df03-fixture', isPrimary: true },
          { name: 'Мария Клиент', email: client2Email, phone: phone(4), password: 'scrypt:df03-fixture' },
        ],
      },
    },
    select: { id: true },
  })
  customerCompanyId = company.id
  ids.customers.push(company.id)
  const users = await db.customerUser.findMany({ where: { customerId: company.id } })
  clientUserId = users.find((u) => u.email === clientEmail)!.id
  client2UserId = users.find((u) => u.email === client2Email)!.id

  const broker = await db.broker.create({
    data: {
      companyName: 'Брокер DF-03 ' + RUN,
      phone: phone(5),
      users: { create: { name: 'Брокер Человек', email: brokerEmail, password: 'scrypt:df03-fixture', isPrimary: true } },
    },
    select: { id: true },
  })
  brokerId = broker.id
  ids.brokers.push(brokerId)
  brokerUserId = (await db.brokerUser.findFirst({ where: { brokerId } }))!.id

  const le = await db.legalEntity.create({
    data: { name: 'ЮЛ DF-03 ' + RUN, requisites: {} },
    select: { id: true },
  })
  ids.legalEntities.push(le.id)
  const contract = await db.contract.create({
    data: { legalEntityId: le.id, customerId: customerCompanyId, number: (RUN % 900000) + 100000 },
    select: { id: true },
  })
  ids.contracts.push(contract.id)
  let orderSeq = 0
  const mkOrder = async (status: string) => {
    orderSeq += 1
    const created = await db.order.create({
      data: {
        number: 'DF03-' + RUN + '-' + (status === 'calculating' ? 'A' : 'B'),
        numberInContract: orderSeq,
        contractId: contract.id,
        legalEntityId: le.id,
        customerId: customerCompanyId,
        assignedToId: assigneeId,
        status,
      },
      select: { id: true },
    })
    ids.orders.push(created.id)
    return created.id
  }
  orderCalc = await mkOrder('calculating')
  orderRun = await mkOrder('in_progress')
  await db.orderBroker.create({ data: { orderId: orderRun, brokerId } })
  const stage = await db.orderStageInstance.create({
    data: { orderId: orderRun, stageCode: 'quote', status: 'in_progress', sequence: 1 },
    select: { id: true },
  })
  stageRun = stage.id

  const lead = await db.lead.create({
    data: { customerId: customerCompanyId, assignedToId: assigneeId },
    select: { id: true },
  })
  ids.leads.push(lead.id)
})

afterAll(async () => {
  await setSetting('notifications.client_digest_times', prevWindows, { type: 'system' })
  await setSetting('notifications.red_max_per_hour', prevRedMax, { type: 'system' })
  await setSetting('notifications.max_regular_per_day', prevMaxRegular, { type: 'system' })
  await setSetting('notifications.red_event_types', prevRedTypes, { type: 'system' })
  await setSetting('notifications.staff_mode', prevStaffMode, { type: 'system' })
  clearSettingsCache()

  // Чистка прогона: письма по адресам-маркерам, события по описанию.
  await db.notification.deleteMany({ where: { toAddress: { contains: `@${DOMAIN}` } } })
  await db.activity.deleteMany({ where: { description: { contains: MARK } } })
  await db.order.deleteMany({ where: { id: { in: ids.orders } } })
  await db.lead.deleteMany({ where: { id: { in: ids.leads } } })
  await db.contract.deleteMany({ where: { id: { in: ids.contracts } } })
  await db.legalEntity.deleteMany({ where: { id: { in: ids.legalEntities } } })
  await db.broker.deleteMany({ where: { id: { in: ids.brokers } } })
  await db.customer.deleteMany({ where: { id: { in: ids.customers } } })
  await db.employee.deleteMany({ where: { id: { in: ids.employees } } })
})

describe('DF-03 enqueue: матрица §8 и режимы (D33)', () => {
  it('lead_created → ответственному immediate; письмо-заготовка содержит ссылку и подвал бренда', async () => {
    const lead = ids.leads[0]
    await emitEvent(db, {
      target: { leadId: lead },
      actor: { type: 'client', id: clientUserId, name: 'Клиент DF-03' },
      type: 'lead_created',
      description: MARK + ' запрос создан клиентом',
    })
    const rows = await db.notification.findMany({ where: { recipientKind: 'employee', toAddress: staffEmail } })
    expect(rows.length).toBe(1)
    const row = rows[0]
    expect(row.mode).toBe('immediate')
    expect(row.status).toBe('pending')
    expect(row.recipientId).toBe(assigneeId)
    expect(row.subject).toContain('Запрос создан')
    // dedupKey одиночного письма: type:kind:recipient:target:бакет
    expect(row.dedupKey).toMatch(/^lead_created:employee:/)
    // подпись — из настройки brand.name, не хардкод (IC-10 разрешает
    // литерал только в реестре настроек)
    const brandName = await getSetting('brand.name')
    expect(row.body).toContain(brandName)
    expect(row.body).toContain('ответьте на это письмо')
  })

  it('order_status_changed: расчёт (согласование) → клиенту immediate; в работе → regular без nextAttemptAt', async () => {
    await emitEvent(db, {
      target: { orderId: orderCalc },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'order_status_changed',
      description: MARK + ' статус: Расчёт → Согласование',
    })
    const calcRows = await db.notification.findMany({ where: { recipientKind: 'client', toAddress: { in: [clientEmail, client2Email] }, recipientId: { in: [clientUserId, client2UserId] } } })
    expect(calcRows.length).toBe(2) // оба человека компании
    expect(calcRows.every((r) => r.mode === 'immediate')).toBe(true)

    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'order_status_changed',
      description: MARK + ' статус: → В работе',
    })
    const runRows = await db.notification.findMany({ where: { recipientKind: 'client', mode: 'regular', type: 'order_status_changed', recipientId: { in: [clientUserId, client2UserId] } } })
    expect(runRows.length).toBe(2)
    expect(runRows.every((r) => r.nextAttemptAt === null)).toBe(true)
    expect(runRows.every((r) => r.status === 'pending')).toBe(true)
  })

  it('stage done → клиенту (regular в перевозке); problem → красный ответственному + клиенту нейтрально', async () => {
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'stage_status_changed',
      description: MARK + ' этап завершён',
      stageId: stageRun,
    })
    // этап ещё in_progress — писем нет (§8: только done/problem)
    expect(await db.notification.count({ where: { eventId: { not: null }, type: 'stage_status_changed', recipientId: { in: [assigneeId, clientUserId, client2UserId] } } })).toBe(0)

    await db.orderStageInstance.update({ where: { id: stageRun }, data: { status: 'done' } })
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'stage_status_changed',
      description: MARK + ' этап завершён',
      stageId: stageRun,
    })
    const doneRows = await db.notification.findMany({ where: { type: 'stage_status_changed', mode: 'regular', recipientId: { in: [clientUserId, client2UserId] } } })
    expect(doneRows.length).toBe(2) // оба человека клиента

    await db.orderStageInstance.update({ where: { id: stageRun }, data: { status: 'problem' } })
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'stage_status_changed',
      description: MARK + ' этап в проблеме',
      stageId: stageRun,
    })
    const redRows = await db.notification.findMany({ where: { type: 'stage_status_changed', mode: 'red', recipientId: { in: [assigneeId, clientUserId, client2UserId] } } })
    // ответственный + два человека клиента
    expect(redRows.length).toBe(3)
    const staffRed = redRows.find((r) => r.recipientKind === 'employee')!
    expect(staffRed.toAddress).toBe(staffEmail)
    const clientRed = redRows.find((r) => r.recipientKind === 'client')!
    // нейтральная формулировка (аудит №16): «задержка», без слова «проблема»
    expect(clientRed.subject).toContain('Задержка на этапе')
    expect(clientRed.subject).toMatch(/^Срочно: /)
    expect(clientRed.body).toContain('задержка')
    expect(clientRed.body.toLowerCase()).not.toContain('проблем')
    // ответственному — прямым текстом (он в системе)
    expect(staffRed.subject).toMatch(/^Срочно: /)
  })

  it('дедупликация: два одинаковых события в 10 минутах → одно письмо', async () => {
    for (let i = 0; i < 2; i += 1) {
      await emitEvent(db, {
        target: { orderId: orderRun },
        actor: { type: 'broker', id: brokerUserId, name: 'Брокер DF-03' },
        type: 'document_created',
        description: MARK + ' документ от брокера ' + i,
      })
    }
    const staffDocs = await db.notification.findMany({
      where: { type: 'document_created', recipientKind: 'employee', toAddress: staffEmail },
    })
    expect(staffDocs.length).toBe(1)
  })

  it('internal-заметка и «молчаливые» типы писем не порождают', async () => {
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'note_added',
      description: MARK + ' внутренняя заметка',
    })
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'order_cargo_changed',
      description: MARK + ' груз изменён',
    })
    const acts = await db.activity.findMany({ where: { description: { contains: MARK + ' внутренняя заметка' } } })
    expect(acts.length).toBe(1)
    expect(await db.notification.count({ where: { eventId: acts[0].id } })).toBe(0)
  })

  it('деактивированный получатель письма не получает (isActive)', async () => {
    await db.brokerUser.update({ where: { id: brokerUserId }, data: { isActive: false } })
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'order_broker_attached',
      description: MARK + ' брокер подключён',
      notify: { brokerId },
    })
    expect(await db.notification.count({ where: { toAddress: brokerEmail } })).toBe(0)
    await db.brokerUser.update({ where: { id: brokerUserId }, data: { isActive: true } })
  })

  it('подключение брокера — письмо ИМЕННО ему (notifyHint), сразу', async () => {
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'order_broker_attached',
      description: MARK + ' брокер подключён',
      notify: { brokerId },
    })
    const rows = await db.notification.findMany({ where: { toAddress: brokerEmail, type: 'order_broker_attached' } })
    expect(rows.length).toBe(1)
    expect(rows[0].mode).toBe('immediate')
  })
})

describe('DF-03 антишторм и диспетчер', () => {
  it('сверх red_max_per_hour красные уходят в ближайшее окно', async () => {
    await setSetting('notifications.red_max_per_hour', 1, { type: 'system' })
    // Первое красное — уходит сразу (отправленных ещё нет).
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'stage_status_changed',
      description: MARK + ' проблема 1',
      stageId: stageRun,
    })
    // Имитируем отправку первого красного ответственному; dedupKey
    // уводим в прошлое окно (симуляция «прошло 10 минут») — иначе
    // дедупликация одиночных писем (карточка DF-03) законно поглотит
    // второе событие того же типа.
    const first = await db.notification.findFirst({
      where: { toAddress: staffEmail, mode: 'red', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })
    await db.notification.update({
      where: { id: first!.id },
      data: { status: 'sent', sentAt: new Date(), providerId: 'fake:manual', dedupKey: first!.dedupKey + ':past' },
    })
    // Второе красное в тот же час → откладывается до окна.
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'stage_status_changed',
      description: MARK + ' проблема 2',
      stageId: stageRun,
    })
    const deferred = await db.notification.findFirst({
      where: { toAddress: staffEmail, mode: 'red', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })
    expect(deferred).not.toBeNull()
    expect(deferred!.nextAttemptAt).not.toBeNull()
    expect(deferred!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('dispatch: fake-транспорт отправляет, allowlist отсекает чужие адреса', async () => {
    const prevProvider = process.env.EMAIL_PROVIDER
    const prevAllow = process.env.EMAIL_ALLOWLIST
    process.env.EMAIL_PROVIDER = 'fake'
    process.env.EMAIL_ALLOWLIST = DOMAIN

    try {
      const startedAt = new Date()
      const run = await dispatchPendingBatch()
      expect(run.sent).toBeGreaterThan(0)
      const sent = await db.notification.findMany({ where: { status: 'sent', toAddress: { contains: `@${DOMAIN}` }, sentAt: { gte: startedAt } } })
      expect(sent.length).toBeGreaterThan(0)
      expect(sent.every((r) => (r.providerId ?? '').startsWith('fake:'))).toBe(true)

      // Адрес вне allowlist — skipped not_allowlisted (терминально).
      await emitEvent(db, {
        target: { orderId: orderRun },
        actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
        type: 'lead_created',
        description: MARK + ' вне allowlist',
      })
      await db.notification.updateMany({
        where: { toAddress: { in: [clientEmail, client2Email, staffEmail, brokerEmail] }, status: 'pending' },
        data: { status: 'sent', sentAt: new Date(), providerId: 'fake:test' },
      })
      await db.notification.create({
        data: {
          recipientKind: 'client',
          recipientId: clientUserId,
          toAddress: 'outsider@blocked.test',
          channel: 'email',
          mode: 'immediate',
          eventId: null,
          type: 'lead_created',
          subject: 'вне allowlist',
          body: 'текст',
          status: 'pending',
          nextAttemptAt: new Date(),
          dedupKey: 'df03-allowlist-' + RUN,
        },
      })
      await dispatchPendingBatch()
      const blocked = await db.notification.findUnique({ where: { dedupKey: 'df03-allowlist-' + RUN } })
      expect(blocked!.status).toBe('skipped')
      expect(blocked!.lastError).toBe('not_allowlisted')
    } finally {
      if (prevProvider === undefined) delete process.env.EMAIL_PROVIDER
      else process.env.EMAIL_PROVIDER = prevProvider
      if (prevAllow === undefined) delete process.env.EMAIL_ALLOWLIST
      else process.env.EMAIL_ALLOWLIST = prevAllow
    }
  })
})

describe('DF-03 дайджест', () => {
  it('окно: собирает ровно накопленное одним письмом; пустой дайджест не отправляется; лимит в сутки', async () => {
    // Окно = текущее московское время (допуск 15 минут — due сразу).
    const moscow = nowInZone('Europe/Moscow')
    await setSetting('notifications.client_digest_times', [moscow.timeStr], { type: 'system' })
    await setSetting('notifications.max_regular_per_day', 1, { type: 'system' })

    // Накопитель: три события перевозки клиенту (+2 regular из прошлого
    // describe — order_status_changed «В работе»; убираем их из окна,
    // отправив, чтобы дайджест считал только свежие).
    await db.notification.updateMany({
      where: { mode: 'regular', type: { not: 'digest' }, status: 'pending', recipientKind: 'client', recipientId: { in: [clientUserId, client2UserId] } },
      data: { status: 'sent', sentAt: new Date(), providerId: 'fake:pre-digest' },
    })
    for (let i = 1; i <= 3; i += 1) {
      // order_status_changed в перевозке → client regular (§8);
      // ответственного письма нет — менял он сам (responsible-if-not-actor).
      await emitEvent(db, {
        target: { orderId: orderRun },
        actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
        type: 'order_status_changed',
        description: MARK + ' изменение полей ' + i,
      })
    }
    const pendingBefore = await db.notification.count({ where: { mode: 'regular', type: { not: 'digest' }, status: 'pending', recipientId: { in: [clientUserId, client2UserId] } } })
    expect(pendingBefore).toBe(6) // 3 события × 2 человека

    const run = await processRegularDigests()
    expect(run.window).not.toBeNull()
    expect(run.digests).toBe(2) // по одному на каждого человека
    expect(run.included).toBe(6)

    const digests = await db.notification.findMany({ where: { type: 'digest', recipientId: { in: [clientUserId, client2UserId] } } })
    expect(digests.length).toBe(2)
    const one = digests[0]
    expect(one.status).toBe('pending')
    expect(one.windowKey).toBe(windowKeyOf('Europe/Moscow', run.window!))
    expect(one.dedupKey).toMatch(/^digest:client:/)
    expect(one.body).toContain('изменение полей 1')
    expect(one.body).toContain('изменение полей 3')
    expect(one.body).toContain('Статус заявки изменён')
    // группировка по сделке: заявка с номером
    expect(one.body).toContain('— заявка №')

    // Накопленные строки помечены sent с привязкой к дайджесту.
    const acc = await db.notification.findFirst({
      where: { mode: 'regular', type: { not: 'digest' }, providerId: { startsWith: 'digest:' } },
    })
    expect(acc).not.toBeNull()

    // Пустой дайджест не отправляется: повторный проход — ноль.
    const again = await processRegularDigests()
    expect(again.digests).toBe(0)

    // Лимит в сутки: окно уже выработано (max_regular_per_day=1) —
    // новое событие в этот день не создаёт второй дайджест.
    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'order_status_changed',
      description: MARK + ' изменение после лимита',
    })
    const limited = await processRegularDigests()
    expect(limited.digests).toBe(0)  // лимит суток — свои получатели (остатки e2e не в счёт)
    // Чистка своих regular-строк после лимита; ДАЙДЖЕСТЫ не трогаем
    // (у них тоже mode='regular' — фильтр по type).
    await db.notification.deleteMany({
      where: { mode: 'regular', type: { not: 'digest' }, status: 'pending', recipientId: { in: [clientUserId, client2UserId] } },
    })
    expect(await db.notification.count({ where: { type: 'digest', recipientId: { in: [clientUserId, client2UserId] } } })).toBe(2)

    // Диспетчер доставляет дайджесты (fake + allowlist — окружение
    // непроизводственное, NODE_ENV=test).
    const prevProvider = process.env.EMAIL_PROVIDER
    const prevAllow = process.env.EMAIL_ALLOWLIST
    process.env.EMAIL_PROVIDER = 'fake'
    process.env.EMAIL_ALLOWLIST = DOMAIN
    try {
      await dispatchPendingBatch()
      const sentDigests = await db.notification.findMany({ where: { type: 'digest', status: 'sent', recipientId: { in: [clientUserId, client2UserId] } } })
      expect(sentDigests.length).toBe(2)
      expect(sentDigests.every((d) => (d.providerId ?? '').startsWith('fake:'))).toBe(true)
    } finally {
      if (prevProvider === undefined) delete process.env.EMAIL_PROVIDER
      else process.env.EMAIL_PROVIDER = prevProvider
      if (prevAllow === undefined) delete process.env.EMAIL_ALLOWLIST
      else process.env.EMAIL_ALLOWLIST = prevAllow
    }
  })

  it('смена окон в настройках меняет поведение без выката; вне окна дайджест не собирается', async () => {
    const moscow = nowInZone('Europe/Moscow')
    const futureMinutes = (moscow.minutes + 120) % 1440
    const futureTime = `${String(Math.floor(futureMinutes / 60)).padStart(2, '0')}:${String(futureMinutes % 60).padStart(2, '0')}`
    await setSetting('notifications.client_digest_times', [futureTime], { type: 'system' })
    await setSetting('notifications.max_regular_per_day', 2, { type: 'system' })

    await emitEvent(db, {
      target: { orderId: orderRun },
      actor: employeeActor({ id: assigneeId, name: 'Менеджер DF-03' }),
      type: 'order_status_changed',
      description: MARK + ' вне окна',
    })
    const run = await processRegularDigests()
    expect(run.window).toBeNull()
    expect(await db.notification.count({ where: { type: 'digest', recipientId: { in: [clientUserId, client2UserId] } } })).toBe(2) // без изменений
    expect(dueWindow([moscow.timeStr], 'Europe/Moscow')).not.toBeNull()
    expect(dueWindow([futureTime], 'Europe/Moscow')).toBeNull()
  })

  it('письмо брокеру не содержит цен (шаблон числа не добавляет)', async () => {
    const rows = await db.notification.findMany({ where: { recipientKind: 'broker', recipientId: brokerUserId } })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.body).not.toMatch(/\d[\d\s]{2,}\s?(₽|руб|Rub|RUB)/i)
      expect(row.body).not.toContain('₽')
    }
  })
})
