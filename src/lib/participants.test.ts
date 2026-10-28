import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from './db'
import { hashPassword } from './password'
import { createOrderWithStages } from './orders'
import {
  participantsOf,
  participantsOfOrder,
  participantsOfLead,
  recipientsOfCustomer,
  type DealParticipants,
} from './participants'

// ─── DF-02: участники сделки — единая точка (participantsOf) ─────────
// Интеграционный уровень (как company-users.test.ts): против реального
// PostgreSQL. Критерий приёмки карточки — participantsOf покрыт ≥ 8
// кейсами; ключевые правила:
//   • staff = активный ответственный, иначе — активные мастера;
//   • деактивированные (сотрудник/пользователь/компания) адресатами не
//     бывают (isActive);
//   • исполнители этапов (подрядчики) — справочно, в адресаты не
//     попадают никогда (D31);
//   • recipientsOfCustomer — люди с email, фолбэк на адрес компании.

// Уникальный маркер прогона: телефоны/имена только свои (чужие данные
// из живой базы и прошлых прогонов не задеваем).
const RUN = Date.now() % 1e8
function phone(offset: number): string {
  return '+790' + String((RUN + offset) % 1e8).padStart(8, '0')
}
const MARK = 'DF02B-' + RUN

// Собранные id — чистка в afterAll (порядок: связи → справочники).
const ids = {
  employeeIds: [] as string[],
  customerIds: [] as string[],
  brokerIds: [] as string[],
  contractorIds: [] as string[],
  orderIds: [] as string[],
  leadIds: [] as string[],
  contractIds: [] as string[],
}

let masterTest: { id: string; name: string; email: string | null }
let assignee: { id: string; email: string | null }
let customerA: { id: string; email: string | null }
let customerNoEmailUsers: { id: string; email: string | null }
let customerEmpty = ''
let customerInactive = ''
let brokerA = ''
let brokerInactive = ''
let contractorC1 = ''
let contractorC2 = ''
let orderWithAssignee = ''
let orderNoAssignee = ''
let orderDeactivatedAssignee = ''
let orderInactiveBroker = ''
let leadWithoutCustomer = ''
let leadWithCustomer = ''

async function mkEmployee(name: string, offset: number, roles: string[], isActive = true, email?: string) {
  const e = await db.employee.create({
    data: {
      name,
      phone: phone(offset),
      email: email ?? null,
      password: hashPassword('fixture-df02b-' + offset),
      roles: JSON.stringify(roles),
      isActive,
    },
    select: { id: true, name: true, email: true },
  })
  ids.employeeIds.push(e.id)
  return e
}

beforeAll(async () => {
  const legal = await db.legalEntity.findFirst()
  if (!legal) throw new Error('нет юрлица из сида')

  masterTest = await mkEmployee('Мастер DF02B ' + RUN, 1, ['master'], true, 'master' + RUN + '@test.ru')
  assignee = await mkEmployee('Менеджер DF02B ' + RUN, 2, ['manager'], true, 'assignee' + RUN + '@test.ru')
  await mkEmployee('Деактив DF02B ' + RUN, 3, ['manager'], false)

  customerA = await db.customer.create({
    data: {
      name: 'Клиент A ' + MARK,
      email: 'company-a' + RUN + '@test.ru',
      users: {
        create: [
          { name: 'Пользователь 1', email: 'user1' + RUN + '@test.ru' },
          { name: 'Пользователь 2' }, // активный, без email
          { name: 'Пользователь 3', email: 'user3' + RUN + '@test.ru', isActive: false },
        ],
      },
    },
    select: { id: true, email: true },
  })
  ids.customerIds.push(customerA.id)

  customerNoEmailUsers = await db.customer.create({
    data: {
      name: 'Клиент B ' + MARK,
      email: 'company-b' + RUN + '@test.ru',
      users: { create: [{ name: 'Без Email', isActive: true }] },
    },
    select: { id: true, email: true },
  })
  ids.customerIds.push(customerNoEmailUsers.id)

  customerEmpty = (
    await db.customer.create({ data: { name: 'Клиент C ' + MARK }, select: { id: true } })
  ).id
  ids.customerIds.push(customerEmpty)

  customerInactive = (
    await db.customer.create({
      data: {
        name: 'Клиент D ' + MARK,
        email: 'company-d' + RUN + '@test.ru',
        isActive: false,
        users: { create: [{ name: 'Активный у неактивной', email: 'd' + RUN + '@test.ru' }] },
      },
      select: { id: true },
    })
  ).id
  ids.customerIds.push(customerInactive)

  brokerA = (
    await db.broker.create({
      data: {
        companyName: 'Брокер A ' + MARK,
        phone: phone(11),
        email: 'broker-a' + RUN + '@test.ru',
        password: hashPassword('fixture-df02b-b1'),
        users: {
          create: [
            { name: 'Брокер 1', email: 'bu1' + RUN + '@test.ru' },
            { name: 'Брокер 2', email: 'bu2' + RUN + '@test.ru', isActive: false },
          ],
        },
      },
      select: { id: true },
    })
  ).id
  ids.brokerIds.push(brokerA)

  brokerInactive = (
    await db.broker.create({
      data: {
        companyName: 'Брокер X ' + MARK,
        phone: phone(12),
        email: 'broker-x' + RUN + '@test.ru',
        password: hashPassword('fixture-df02b-b2'),
        isActive: false,
        users: { create: [{ name: 'Брокер X юзер', email: 'bux' + RUN + '@test.ru' }] },
      },
      select: { id: true },
    })
  ).id
  ids.brokerIds.push(brokerInactive)

  contractorC1 = (
    await db.contractor.create({
      data: {
        companyName: 'Подрядчик 1 ' + MARK,
        phone: phone(13),
        password: hashPassword('fixture-df02b-c1'),
      },
      select: { id: true },
    })
  ).id
  contractorC2 = (
    await db.contractor.create({
      data: {
        companyName: 'Подрядчик 2 ' + MARK,
        phone: phone(14),
        password: hashPassword('fixture-df02b-c2'),
      },
      select: { id: true },
    })
  ).id
  ids.contractorIds.push(contractorC1, contractorC2)

  // Заявка с активным ответственным + брокер + подрядчики на этапах.
  const o1 = await createOrderWithStages(
    { customerId: customerA.id, legalEntityId: legal.id, assignedToId: assignee.id },
    db
  )
  if ('error' in o1) throw new Error(o1.error)
  orderWithAssignee = o1.id
  ids.orderIds.push(o1.id)
  ids.contractIds.push(
    (await db.order.findUnique({ where: { id: o1.id }, select: { contractId: true } }))!.contractId
  )
  await db.orderBroker.create({ data: { orderId: o1.id, brokerId: brokerA } })
  await db.orderBroker.create({ data: { orderId: o1.id, brokerId: brokerInactive } })
  const stages1 = await db.orderStageInstance.findMany({
    where: { orderId: o1.id },
    orderBy: { sequence: 'asc' },
    select: { id: true },
  })
  // Подрядчик 1 на двух этапах (проверка дедупликации справочника),
  // подрядчик 2 — на третьем; исполнители НЕ попадают в адресаты.
  await db.orderStageInstance.update({ where: { id: stages1[0].id }, data: { contractorId: contractorC1 } })
  await db.orderStageInstance.update({ where: { id: stages1[1].id }, data: { contractorId: contractorC1 } })
  await db.orderStageInstance.update({ where: { id: stages1[2].id }, data: { contractorId: contractorC2 } })

  // Заявка без ответственного — fallback на активных мастеров.
  const o2 = await createOrderWithStages({ customerId: customerA.id, legalEntityId: legal.id }, db)
  if ('error' in o2) throw new Error(o2.error)
  orderNoAssignee = o2.id
  ids.orderIds.push(o2.id)
  ids.contractIds.push(
    (await db.order.findUnique({ where: { id: o2.id }, select: { contractId: true } }))!.contractId
  )

  // Заявка с ДЕАКТИВИРОВАННЫМ ответственным — он не адресат, мастера.
  const o3 = await createOrderWithStages(
    { customerId: customerA.id, legalEntityId: legal.id, assignedToId: ids.employeeIds[2] },
    db
  )
  if ('error' in o3) throw new Error(o3.error)
  orderDeactivatedAssignee = o3.id
  ids.orderIds.push(o3.id)
  ids.contractIds.push(
    (await db.order.findUnique({ where: { id: o3.id }, select: { contractId: true } }))!.contractId
  )

  // Заявка с неактивной компанией-клиентом.
  const o4 = await createOrderWithStages(
    { customerId: customerInactive, legalEntityId: legal.id },
    db
  )
  if ('error' in o4) throw new Error(o4.error)
  orderInactiveBroker = o4.id
  ids.orderIds.push(o4.id)
  ids.contractIds.push(
    (await db.order.findUnique({ where: { id: o4.id }, select: { contractId: true } }))!.contractId
  )

  // Лид без клиента («с улицы») и лид с клиентом.
  const l1 = await db.lead.create({
    data: { assignedToId: assignee.id, rawContact: { name: 'Уличный ' + MARK } },
    select: { id: true },
  })
  leadWithoutCustomer = l1.id
  ids.leadIds.push(l1.id)
  await db.leadBroker.create({ data: { leadId: l1.id, brokerId: brokerA } })

  const l2 = await db.lead.create({
    data: { customerId: customerA.id },
    select: { id: true },
  })
  leadWithCustomer = l2.id
  ids.leadIds.push(l2.id)
})

afterAll(async () => {
  await db.orderBroker.deleteMany({ where: { orderId: { in: ids.orderIds } } })
  await db.orderStageInstance.deleteMany({ where: { orderId: { in: ids.orderIds } } })
  await db.order.deleteMany({ where: { id: { in: ids.orderIds } } })
  await db.leadBroker.deleteMany({ where: { leadId: { in: ids.leadIds } } })
  await db.lead.deleteMany({ where: { id: { in: ids.leadIds } } })
  await db.contract.deleteMany({ where: { id: { in: ids.contractIds } } })
  await db.customerUser.deleteMany({ where: { customerId: { in: ids.customerIds } } })
  await db.customer.deleteMany({ where: { id: { in: ids.customerIds } } })
  await db.brokerUser.deleteMany({ where: { brokerId: { in: ids.brokerIds } } })
  await db.broker.deleteMany({ where: { id: { in: ids.brokerIds } } })
  await db.employee.deleteMany({ where: { id: { in: ids.employeeIds } } })
  await db.contractor.deleteMany({ where: { id: { in: ids.contractorIds } } })
})

describe('participantsOf — заявка (Order)', () => {
  it('1. активный ответственный — единственный staff, email прилагается', async () => {
    const p: DealParticipants = await participantsOf(db, { orderId: orderWithAssignee })
    expect(p.staff).toHaveLength(1)
    expect(p.staff[0]).toMatchObject({ id: assignee.id, email: assignee.email })
  })

  it('2. без ответственного — активные мастера (тестовый мастер среди них)', async () => {
    const p = await participantsOf(db, { orderId: orderNoAssignee })
    expect(p.staff.length).toBeGreaterThan(0)
    expect(p.staff.some((s) => s.id === masterTest.id)).toBe(true)
    expect(p.staff.every((s) => s.id !== assignee.id)).toBe(true)
  })

  it('3. деактивированный ответственный не попадает — fallback на мастеров', async () => {
    const p = await participantsOfOrder(db, orderDeactivatedAssignee)
    expect(p.staff.some((s) => s.id === ids.employeeIds[2])).toBe(false)
    expect(p.staff.some((s) => s.id === masterTest.id)).toBe(true)
  })

  it('4. клиент: активные пользователи попадают, без email тоже (участник), деактивированный — нет', async () => {
    const p = await participantsOf(db, { orderId: orderWithAssignee })
    expect(p.client?.id).toBe(customerA.id)
    expect(p.client?.email).toBe(customerA.email)
    const userIds = p.client!.users.map((u) => u.id)
    expect(userIds).toHaveLength(2) // активные 1 и 2; 3 деактивирован
    expect(p.client!.users.find((u) => u.email === null)).toBeDefined()
  })

  it('5. брокеры: подключённый с активными пользователями, не подключённый отсутствует', async () => {
    const p = await participantsOfOrder(db, orderWithAssignee)
    expect(p.brokers.map((b) => b.id)).toContain(brokerA)
    expect(p.brokers.map((b) => b.id)).toContain(brokerInactive)
    const a = p.brokers.find((b) => b.id === brokerA)!
    expect(a.users).toHaveLength(1) // только активный Брокер 1
    expect(a.users[0].email).toBe('bu1' + RUN + '@test.ru')
  })

  it('6. исполнители этапов — справочно: дедуп, и НЕ в staff/brokers', async () => {
    const p = await participantsOf(db, { orderId: orderWithAssignee })
    expect(p.contractors.map((c) => c.id).sort()).toEqual([contractorC1, contractorC2].sort())
    expect(p.contractors).toHaveLength(2) // C1 на двух этапах — одна запись
    const staffAndBrokerIds = [
      ...p.staff.map((s) => s.id),
      ...p.brokers.flatMap((b) => [b.id, ...b.users.map((u) => u.id)]),
    ]
    expect(staffAndBrokerIds).not.toContain(contractorC1)
    expect(staffAndBrokerIds).not.toContain(contractorC2)
  })

  it('7. неактивная компания: участник есть (реквизиты), адресатов нет', async () => {
    const p = await participantsOfOrder(db, orderInactiveBroker)
    expect(p.client?.id).toBe(customerInactive)
    expect(p.client?.users).toHaveLength(0)
  })

  it('8. ровно один ref: без id и с двумя — ошибка программиста', async () => {
    await expect(participantsOf(db, {})).rejects.toThrow(/ровно один/)
    await expect(participantsOf(db, { orderId: 'x', leadId: 'y' })).rejects.toThrow(/ровно один/)
  })
})

describe('participantsOf — запрос (Lead)', () => {
  it('9. лид без клиента: client null, брокер из LeadBroker, staff = ответственный', async () => {
    const p = await participantsOfLead(db, leadWithoutCustomer)
    expect(p.client).toBeNull()
    expect(p.brokers.map((b) => b.id)).toEqual([brokerA])
    expect(p.staff).toHaveLength(1)
    expect(p.staff[0].id).toBe(assignee.id)
    expect(p.contractors).toEqual([]) // у лида этапов нет
  })

  it('10. лид с клиентом и без ответственного — клиент с пользователями, мастера в staff', async () => {
    const p = await participantsOf(db, { leadId: leadWithCustomer })
    expect(p.client?.id).toBe(customerA.id)
    expect(p.client?.users.length).toBeGreaterThan(0)
    expect(p.staff.some((s) => s.id === masterTest.id)).toBe(true)
  })
})

describe('recipientsOfCustomer — единственная точка изменения получателей', () => {
  it('11. люди с email (активные), пользователь без email и деактивированный отфильтрованы', async () => {
    const r = await recipientsOfCustomer(db, customerA.id)
    expect(r).toEqual([{ userId: expect.any(String), email: 'user1' + RUN + '@test.ru' }])
  })

  it('12. ни у одного пользователя нет email — фолбэк на адрес компании', async () => {
    const r = await recipientsOfCustomer(db, customerNoEmailUsers.id)
    expect(r).toEqual([{ userId: null, email: customerNoEmailUsers.email }])
  })

  it('13. неактивная компания и компания без адресов — пусто', async () => {
    expect(await recipientsOfCustomer(db, customerInactive)).toEqual([])
    expect(await recipientsOfCustomer(db, customerEmpty)).toEqual([])
    expect(await recipientsOfCustomer(db, 'nonexistent-customer-' + RUN)).toEqual([])
  })
})
