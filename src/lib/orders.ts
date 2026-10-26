import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { CargoProfile } from '@/lib/order-constants'

// СЕРВЕРНАЯ логика заявок: нумерация с retry-петлёй P2002, find-or-create
// клиента/договора, защита обязательных этапов. Файл тянет db — его
// импорт из клиентских компонентов запрещён (для UI — lib/order-constants.ts
// с теми же статусами и подписями, без серверных зависимостей).

const MAX_NUMBER_ATTEMPTS = 5

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002'
}

// ─── Клиент: find-or-create по телефону/имени (Дорожка Б3) ─────

// Если передан customerId — берём его. Иначе: по телефону (если указан)
// ищем существующего, не нашли — создаём. Осознанное решение сессии:
// Customer может быть физлицом без юрлица, LegalEntity на клиенте
// опционален и живёт только в паре с договором. Без телефона поиска
// по имени НЕТ — каждое обращение без телефона рождает нового клиента
// (семантика Б3, конвертация В4 её наследует).
// created=true только когда клиент рождён прямо в этом вызове —
// конвертация В4 отдаёт флаг UI, чтобы подсветить «клиент заведён
// из контактов лида».
export async function findOrCreateCustomer(
  input: {
    customerId?: string
    name?: string
    phone?: string | null
    email?: string | null
  },
  client: Prisma.TransactionClient = db
): Promise<{ id: string; created: boolean } | { error: string; status: number }> {
  if (input.customerId) {
    const customer = await client.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) return { error: 'Клиент не найден', status: 404 }
    return { id: customer.id, created: false }
  }

  const name = input.name?.trim()
  if (!name) return { error: 'Укажите клиента или его имя', status: 400 }

  if (input.phone) {
    const byPhone = await client.customer.findFirst({
      where: { phone: input.phone },
      orderBy: { createdAt: 'asc' },
    })
    if (byPhone) return { id: byPhone.id, created: false }
  }

  const created = await client.customer.create({
    data: { name, phone: input.phone ?? null, email: input.email ?? null },
  })
  return { id: created.id, created: true }
}

// ─── Договор: один на пару клиент+юрлицо (роадмап 8.2) ────────

// Для новой пары рамочный договор создаётся прозрачно в момент первой
// заявки — без отдельного блокирующего шага «сначала оформите договор».
// Уникальность пары защищена на уровне БД (@@unique), поэтому гонка
// двух одновременных первых заявок лечится retry-петлёй: P2002 →
// следующий виток заново находит уже созданную пару.
export async function findOrCreateContract(
  customerId: string,
  legalEntityId: string,
  client: Prisma.TransactionClient = db
): Promise<{ id: string; number: number } | { error: string; status: number }> {
  const legalEntity = await client.legalEntity.findUnique({ where: { id: legalEntityId } })
  if (!legalEntity) return { error: 'Юрлицо не найдено', status: 404 }

  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt++) {
    const existing = await client.contract.findUnique({
      where: { customerId_legalEntityId: { customerId, legalEntityId } },
    })
    if (existing) return { id: existing.id, number: existing.number }

    const last = await client.contract.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
    const number = (last?.number ?? 0) + 1
    try {
      const created = await client.contract.create({ data: { customerId, legalEntityId, number } })
      return { id: created.id, number: created.number }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const retryExisting = await client.contract.findUnique({
        where: { customerId_legalEntityId: { customerId, legalEntityId } },
      })
      if (retryExisting) return { id: retryExisting.id, number: retryExisting.number }
    }
  }
  return { error: 'Не удалось создать договор после нескольких попыток', status: 500 }
}

// ─── Заявка: создание с авто-обязательными этапами (Б3+Б4) ────

export type CreateOrderInput = {
  customerId: string
  legalEntityId: string
  incoterm?: string | null
  hsCode?: string | null
  cargoProfile?: CargoProfile
  leadId?: string
  cargoInfo?: Prisma.InputJsonValue | null
  quoteSnapshot?: Prisma.InputJsonValue | null
  route?:
    | {
        originCity?: string | null
        originCountry?: string | null
        destinationCity?: string | null
        destinationCountry?: string | null
        transportType?: string | null
        readyDate?: Date | null
        weightKg?: Prisma.Decimal | number | null
        volumeM3?: Prisma.Decimal | number | null
        placesCount?: number | null
      }
    | null
  assignedToId?: string | null
}

export async function createOrderWithStages(
  input: CreateOrderInput,
  client: Prisma.TransactionClient = db
): Promise<{ id: string; number: string } | { error: string; status: number }> {
  const contract = await findOrCreateContract(input.customerId, input.legalEntityId, client)
  if ('error' in contract) return contract

  const mandatoryStages = await client.orderStageCatalog.findMany({
    where: { isMandatory: true },
    orderBy: { order: 'asc' },
  })

  // DF-00: блокировка строки контракта для предотвращения гонок нумерации
  // numberInContract без retry-петли при P2002 (петля внутри transaction client
  // на Postgres переводит транзакцию в состояние aborted).
  await client.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contract.id} FOR UPDATE`

  const lastInContract = await client.order.findFirst({
    where: { contractId: contract.id },
    orderBy: { numberInContract: 'desc' },
    select: { numberInContract: true },
  })
  const numberInContract = (lastInContract?.numberInContract ?? 0) + 1
  const number = `${contract.number}-${numberInContract}`

  try {
    const order = await client.order.create({
      data: {
        number,
        numberInContract,
        contractId: contract.id,
        legalEntityId: input.legalEntityId,
        customerId: input.customerId,
        incoterm: input.incoterm ?? null,
        hsCode: input.hsCode ?? null,
        cargoProfile: input.cargoProfile ?? 'standard',
        status: 'calculating',
        ...(input.leadId ? { leadId: input.leadId } : {}),
        ...(input.cargoInfo != null ? { cargoInfo: input.cargoInfo } : {}),
        ...(input.quoteSnapshot != null ? { quoteSnapshot: input.quoteSnapshot } : {}),
        ...(input.route
          ? {
              originCity: input.route.originCity,
              originCountry: input.route.originCountry,
              destinationCity: input.route.destinationCity,
              destinationCountry: input.route.destinationCountry,
              transportType: input.route.transportType as never | undefined,
              readyDate: input.route.readyDate,
              weightKg: input.route.weightKg,
              volumeM3: input.route.volumeM3,
              placesCount: input.route.placesCount,
            }
          : {}),
        ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
        stages: {
          create: mandatoryStages.map((s) => ({
            stageCode: s.code,
            sequence: s.order,
            status: 'not_started' as const,
          })),
        },
      },
    })
    return { id: order.id, number: order.number }
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    return { error: 'Не удалось создать заявку: конфликт уникальности номера', status: 409 }
  }
}

// ─── Этап: проверка обязательности через каталог (роадмап, раздел 3) ──

export async function isStageMandatory(stageCode: string): Promise<boolean> {
  const stage = await db.orderStageCatalog.findUnique({ where: { code: stageCode } })
  return stage?.isMandatory ?? false
}

// ─── Готовность обязательного ядра к завершению заявки (P1-05) ──
export async function getIncompleteMandatoryStages(
  orderId: string
): Promise<Array<{ stageCode: string; name: string }>> {
  const catalog = await db.orderStageCatalog.findMany({
    where: { isMandatory: true },
    select: { code: true, name: true },
    orderBy: { order: 'asc' },
  })
  if (catalog.length === 0) return []
  const stages = await db.orderStageInstance.findMany({
    where: { orderId, stageCode: { in: catalog.map((c) => c.code) } },
    select: { stageCode: true, status: true },
  })
  const doneCodes = new Set(stages.filter((s) => s.status === 'done').map((s) => s.stageCode))
  return catalog.filter((c) => !doneCodes.has(c.code)).map((c) => ({ stageCode: c.code, name: c.name }))
}

// ─── Сводка этапов для списковых проекций заявки (Ж4 → Ж6а) ─────
// Логика вынесена в src/lib/order-summary.ts (RULES 2.14: файл <= 300 строк)
export {
  type StageViewRow,
  type StageView,
  type OrderStagesSummary,
  utcDayStart,
  todayUtcMidnight,
  summarizeOrderStages,
  calcOrderEta,
} from './order-summary'

// ─── Сортировки списка заявок (Ж4; v0.3.1 — переезд из роута, ──────
// RULES 2.14: файл роута ≤ 300; построение orderBy — серверная
// логика запросов, ей место в lib рядом с остальной логикой заявок).
export const ORDER_SORTS = ['newest', 'oldest', 'number_asc', 'number_desc', 'stale'] as const

export function orderOrderBy(sort: string): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }]
    case 'stale':
      // P1-01: «давно без движения» — старое изменение сверху; id —
      // стабильный tie-break, чтобы страницы не дрожали
      return [{ updatedAt: 'asc' }, { id: 'asc' }]
    case 'number_asc':
      // Составной номер «договор-порядковый» — сортируем по его частям,
      // лексикографика «10-2 < 2-1» тут не нужна.
      return [{ contract: { number: 'asc' } }, { numberInContract: 'asc' }, { id: 'asc' }]
    case 'number_desc':
      return [{ contract: { number: 'desc' } }, { numberInContract: 'desc' }, { id: 'asc' }]
    default:
      return [{ createdAt: 'desc' }, { id: 'asc' }]
  }
}
