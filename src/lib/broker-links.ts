import { db } from '@/lib/db'
// DF-01 (G3, IC-14): общий хвост отключения брокера (Д) — снять связь
// и записать событие detach. Выделен из двух DELETE-роутов
// (leads/orders [id]/brokers/[brokerId]): операция одна, различие —
// в модели связи и коде события; инвариант «отключение = событие»
// живёт в одном месте. lib/brokers.ts — клиент-безопасный справочник,
// поэтому серверная часть — здесь.
import { emitEvent } from '@/lib/events'
import { employeeActor } from '@/lib/activity'

// Снимок связи для 404 и имени брокера в событии/ответе.
export type BrokerLinkSnapshot = {
  id: string
  broker: { id: string; companyName: string }
}

// Кто отключает: сотрудник из сессии (id+name) — актёр собирается здесь,
// роутам импорт activity не нужен.
type Employee = { id: string; name: string }

async function leadBrokerSnapshot(leadId: string, brokerId: string): Promise<BrokerLinkSnapshot | null> {
  return db.leadBroker.findUnique({
    where: { leadId_brokerId: { leadId, brokerId } },
    include: { broker: { select: { id: true, companyName: true } } },
  })
}

async function orderBrokerSnapshot(orderId: string, brokerId: string): Promise<BrokerLinkSnapshot | null> {
  return db.orderBroker.findUnique({
    where: { orderId_brokerId: { orderId, brokerId } },
    include: { broker: { select: { id: true, companyName: true } } },
  })
}

// Снять связь «брокер консультирует запрос» и записать
// lead_broker_detached. null — связи нет (роут отвечает 404).
// Оценка таможенных платежей уходит каскадом вместе со связью
// («консультация прекращена»); на won-лидах/при заявке роут
// отвечает 409 ДО вызова (политика лида — не здесь).
export async function detachBrokerFromLead(
  leadId: string,
  brokerId: string,
  employee: Employee,
): Promise<BrokerLinkSnapshot | null> {
  const link = await leadBrokerSnapshot(leadId, brokerId)
  if (!link) return null
  await db.leadBroker.delete({ where: { id: link.id } })
  await emitEvent(db, {
    target: { leadId },
    actor: employeeActor(employee),
    type: 'lead_broker_detached',
    description: `Отключён брокер: ${link.broker.companyName}`,
  })
  return link
}

// Снять видимость заявки у брокера и записать order_broker_detached.
// null — связи нет (роут отвечает 404). Связь LeadBroker-источник не
// трогается (лид — зафиксированная история расчёта), оценка живёт на
// связи лида и остаётся видна менеджеру. orderNumber — для ответа
// («отключён от заявки №N»), выбирается здесь, чтобы роут не тянул db.
export async function detachBrokerFromOrder(
  orderId: string,
  brokerId: string,
  employee: Employee,
): Promise<{ snapshot: BrokerLinkSnapshot; orderNumber: string } | null> {
  const link = await orderBrokerSnapshot(orderId, brokerId)
  if (!link) return null
  await db.orderBroker.delete({ where: { id: link.id } })
  await emitEvent(db, {
    target: { orderId },
    actor: employeeActor(employee),
    type: 'order_broker_detached',
    description: `Отключён брокер: ${link.broker.companyName}`,
  })
  const order = await db.order.findUnique({ where: { id: orderId }, select: { number: true } })
  return { snapshot: link, orderNumber: order?.number ?? '' }
}
