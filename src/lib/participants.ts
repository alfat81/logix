import type { Prisma } from '@prisma/client'
import { parseEmployeeRoles } from './employees'

// ─── DF-02 «Участники сделки»: единая точка «кто в сделке» ──────────
// Проблема (карточка DF-02 ROADMAP-DEALFLOW): состав участников
// определялся тремя способами (customerId, OrderBroker/LeadBroker,
// contractorId этапа), и каждый роут собирал его сам.
//
// participantsOf() — единственная функция сборки участников сделки:
//   • staff — ответственный менеджер (Lead/Order.assignee); при его
//     отсутствии (или деактивации) — все активные мастера (кастодины
//     системы: «некому адресовать — адресуй мастерам»);
//   • client — компания-заказчик и её активные пользователи кабинета
//     (DF-02A): деактивация компании закрывает доступ целиком, поэтому
//     у неактивной компании users пуст — сами реквизиты остаются
//     (участник сделки есть, адресатов нет);
//   • brokers — подключённые брокеры (OrderBroker/LeadBroker) и их
//     активные пользователи; не подключённый брокер участником не является;
//   • contractors — исполнители этапов заявки, СПРАВОЧНО для сотрудников:
//     письма подрядчикам не отправляются (замороженный кабинет D31),
//     в адресаты они не попадают никогда.
//
// Только активные адресаты (isActive): деактивированный сотрудник/
// пользователь не получает ничего (проверка — unit-тесты DF-02).
//
// Все функции принимают tx: Prisma.TransactionClient — вызываются и с
// db, и внутри $transaction (паттерн emitEvent/company-users).
//
// Потребители (DF-03 «Очередь уведомлений») собирают адресатов
// ИСКЛЮЧИТЕЛЬНО отсюда — инвариант карточки: «ни один роут не
// собирает участников вручную в новом коде».

// Человек-участник: сотрудник либо пользователь кабинета (DF-02A).
// email — контакт для уведомлений, может отсутствовать (поле nullable).
export type ParticipantPerson = {
  id: string
  name: string
  email: string | null
}

// Компания-участник (клиент или брокер): реквизиты + активные
// пользователи кабинета. name — Customer.name / Broker.companyName.
export type ParticipantCompany = {
  id: string
  name: string
  email: string | null
  users: ParticipantPerson[]
}

// Подрядчик-исполнитель этапа — справочно (не адресат, D31).
export type ParticipantContractor = {
  id: string
  name: string
}

export type DealParticipants = {
  staff: ParticipantPerson[]
  client: ParticipantCompany | null
  brokers: ParticipantCompany[]
  contractors: ParticipantContractor[]
}

// Адресат уведомления по компании-клиенту (recipientsOfCustomer):
// userId = id пользователя (человек, DF-02A); null = общий адрес
// компании (фолбэк Customer.email, единственная точка замены после
// пересмотра P1-07).
export type Recipient = {
  userId: string | null
  email: string
}

function toPerson(u: { id: string; name: string; email: string | null }): ParticipantPerson {
  return { id: u.id, name: u.name, email: u.email }
}

function sortByName(list: ParticipantPerson[]): ParticipantPerson[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

// Активные мастера справочника (fallback ответственного). Роли —
// JSON-строка, разбор безопасный (parseEmployeeRoles, lib/employees):
// команда маленькая, выборка всех активных сотрудников дешёвая.
async function activeMasters(tx: Prisma.TransactionClient): Promise<ParticipantPerson[]> {
  const employees = await tx.employee.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, roles: true },
  })
  return sortByName(
    employees
      .filter((e) => parseEmployeeRoles(e.roles).includes('master'))
      .map((e) => toPerson(e))
  )
}

// Ответственный сотрудник сделки: активный assignee или мастера.
// Деактивированный ответственный НЕ попадает в адресаты (isActive) —
// срабатывает fallback на мастеров.
async function staffOf(
  tx: Prisma.TransactionClient,
  assigneeId: string | null
): Promise<ParticipantPerson[]> {
  if (assigneeId) {
    const assignee = await tx.employee.findUnique({
      where: { id: assigneeId },
      select: { id: true, name: true, email: true, isActive: true },
    })
    if (assignee && assignee.isActive) {
      return [toPerson(assignee)]
    }
  }
  return activeMasters(tx)
}

// Активные пользователи компании (DF-02A). Компания-участник остаётся
// в составе участников всегда (справочно), но адресаты появляются
// только у активной компании: деактивация компании = доступ закрыт
// целиком (семантика деактивации И1/Д, DF-02A).
async function customerUsersOf(
  tx: Prisma.TransactionClient,
  customer: { id: string; isActive: boolean }
): Promise<ParticipantPerson[]> {
  if (!customer.isActive) return []
  const users = await tx.customerUser.findMany({
    where: { customerId: customer.id, isActive: true },
    select: { id: true, name: true, email: true },
  })
  return sortByName(users.map(toPerson))
}

async function brokerUsersOf(
  tx: Prisma.TransactionClient,
  broker: { id: string; isActive: boolean }
): Promise<ParticipantPerson[]> {
  if (!broker.isActive) return []
  const users = await tx.brokerUser.findMany({
    where: { brokerId: broker.id, isActive: true },
    select: { id: true, name: true, email: true },
  })
  return sortByName(users.map(toPerson))
}

// Участники заявки (Order): ответственный, клиент, брокеры, подрядчики
// этапов. contractorId этапа в staff/brokers не попадает никогда —
// справочный список отдельно (unit-тест DF-02).
export async function participantsOfOrder(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<DealParticipants> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      assignedToId: true,
      customer: {
        select: { id: true, name: true, email: true, isActive: true },
      },
      brokers: {
        select: {
          broker: {
            select: { id: true, companyName: true, email: true, isActive: true },
          },
        },
      },
      stages: {
        select: { contractor: { select: { id: true, companyName: true } } },
      },
    },
  })
  if (!order) {
    throw new Error(`participantsOfOrder: заявка ${orderId} не найдена`)
  }

  const client: ParticipantCompany | null = order.customer
    ? {
        id: order.customer.id,
        name: order.customer.name,
        email: order.customer.email,
        users: await customerUsersOf(tx, order.customer),
      }
    : null

  const brokers: ParticipantCompany[] = []
  for (const link of order.brokers) {
    brokers.push({
      id: link.broker.id,
      name: link.broker.companyName,
      email: link.broker.email,
      users: await brokerUsersOf(tx, link.broker),
    })
  }

  const seen = new Set<string>()
  const contractors: ParticipantContractor[] = []
  for (const stage of order.stages) {
    const c = stage.contractor
    if (c && !seen.has(c.id)) {
      seen.add(c.id)
      contractors.push({ id: c.id, name: c.companyName })
    }
  }

  return {
    staff: await staffOf(tx, order.assignedToId),
    client,
    brokers,
    contractors,
  }
}

// Участники запроса (Lead): до конвертации клиент может отсутствовать
// (customerId nullable — лид «с улицы»), брокеры — LeadBroker.
export async function participantsOfLead(
  tx: Prisma.TransactionClient,
  leadId: string
): Promise<DealParticipants> {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      assignedToId: true,
      customer: {
        select: { id: true, name: true, email: true, isActive: true },
      },
      brokers: {
        select: {
          broker: {
            select: { id: true, companyName: true, email: true, isActive: true },
          },
        },
      },
    },
  })
  if (!lead) {
    throw new Error(`participantsOfLead: запрос ${leadId} не найден`)
  }

  const client: ParticipantCompany | null = lead.customer
    ? {
        id: lead.customer.id,
        name: lead.customer.name,
        email: lead.customer.email,
        users: await customerUsersOf(tx, lead.customer),
      }
    : null

  const brokers: ParticipantCompany[] = []
  for (const link of lead.brokers) {
    brokers.push({
      id: link.broker.id,
      name: link.broker.companyName,
      email: link.broker.email,
      users: await brokerUsersOf(tx, link.broker),
    })
  }

  return {
    staff: await staffOf(tx, lead.assignedToId),
    client,
    brokers,
    contractors: [], // у лида этапов нет — исполнители появляются в заявке
  }
}

// Единая точка входа: ref.orderId либо ref.leadId (ровно один).
export async function participantsOf(
  tx: Prisma.TransactionClient,
  ref: { orderId?: string; leadId?: string }
): Promise<DealParticipants> {
  if (Boolean(ref.orderId) === Boolean(ref.leadId)) {
    throw new Error('participantsOf: укажите ровно один из orderId | leadId')
  }
  return ref.orderId ? participantsOfOrder(tx, ref.orderId) : participantsOfLead(tx, ref.leadId as string)
}

// ─── Получатели клиента (единственная точка изменения, DF-03) ────────
// Сейчас: активные пользователи компании с email (адресат-человек,
// DF-02A); если ни у одного активного пользователя email нет — фолбэк
// на общий адрес компании (Customer.email). После пересмотра P1-07
// здесь же появится «основной контакт» — менять больше ничего не
// потребуется (карточка DF-02). Неактивная компания адресатов не имеет.
export async function recipientsOfCustomer(
  tx: Prisma.TransactionClient,
  customerId: string
): Promise<Recipient[]> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { email: true, isActive: true },
  })
  if (!customer || !customer.isActive) return []

  const users = await tx.customerUser.findMany({
    where: { customerId, isActive: true },
    select: { id: true, email: true },
  })
  const personRecipients = users
    .filter((u): u is { id: string; email: string } => Boolean(u.email))
    .map((u) => ({ userId: u.id, email: u.email }))
  if (personRecipients.length > 0) return personRecipients

  return customer.email ? [{ userId: null, email: customer.email }] : []
}
