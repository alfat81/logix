import { db } from '@/lib/db'
import type { DocumentDealTarget } from '@/lib/documents'
import { PERMIT_FIELDS, type PermitRow } from '@/lib/permits-db'

// ─── DF-16: доступ к строке разрешительного (роуты трёх кабинетов) ───
// Видимость = принадлежность сделке (паттерн документов, Е): чужая
// строка — 404, факт существования не раскрываем (Г4/И1). Клиент и
// брокер получают наружную проекцию (без staffNote/lastRemindedAt).

export async function permitForStaff(permitId: string): Promise<PermitRow | null> {
  return db.permitRequirement.findUnique({ where: { id: permitId }, select: PERMIT_FIELDS })
}

export async function permitForClient(
  permitId: string,
  customerId: string
): Promise<PermitRow | null> {
  const row = await db.permitRequirement.findFirst({
    where: {
      id: permitId,
      OR: [
        { order: { customerId } },
        { lead: { customerId } },
      ],
    },
    select: PERMIT_FIELDS,
  })
  return row
}

export async function permitForBroker(
  permitId: string,
  brokerId: string
): Promise<PermitRow | null> {
  return db.permitRequirement.findFirst({
    where: {
      id: permitId,
      OR: [
        { order: { brokers: { some: { brokerId } } } },
        // Строка на лиде без заявки — брокер связи лида; лид с заявкой
        // скрыт от брокера целиком (Д: «сделка живёт заявкой») — его
        // строки доступны через заявку (перенос В4).
        { lead: { order: null, brokers: { some: { brokerId } } } },
      ],
    },
    select: PERMIT_FIELDS,
  })
}

// Цель сделки, на которую брокер добавляет строки: для лида с заявкой —
// заявка (та же семантика, что syncEstimatePermits).
export async function resolveLeadDealTarget(leadId: string): Promise<DocumentDealTarget | null> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { order: { select: { id: true } } } })
  if (!lead) return null
  return lead.order ? { orderId: lead.order.id } : { leadId }
}

// Брокер подключён к сделке (любая из двух связей — LeadBroker до
// конвертации, OrderBroker после)?
export async function brokerConnectedToLead(leadId: string, brokerId: string): Promise<boolean> {
  const [leadLink, orderLink] = await Promise.all([
    db.leadBroker.findFirst({ where: { leadId, brokerId }, select: { id: true } }),
    db.orderBroker.findFirst({
      where: { brokerId, order: { leadId } },
      select: { id: true },
    }),
  ])
  return Boolean(leadLink ?? orderLink)
}

export async function brokerConnectedToOrder(orderId: string, brokerId: string): Promise<boolean> {
  const link = await db.orderBroker.findFirst({ where: { orderId, brokerId }, select: { id: true } })
  return Boolean(link)
}
