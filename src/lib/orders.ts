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
  legalEntityId: string
): Promise<{ id: string; number: number } | { error: string; status: number }> {
  const legalEntity = await db.legalEntity.findUnique({ where: { id: legalEntityId } })
  if (!legalEntity) return { error: 'Юрлицо не найдено', status: 404 }

  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt++) {
    const existing = await db.contract.findUnique({
      where: { customerId_legalEntityId: { customerId, legalEntityId } },
    })
    if (existing) return { id: existing.id, number: existing.number }

    // Сквозной номер договора: max+1 (паттерн createWorkOrder из APEX
    // Moto — без автоинкремента, чтобы гонка ловилась уникальностью,
    // а не молча плодила пропуски в транзакциях).
    const last = await db.contract.findFirst({ orderBy: { number: 'desc' }, select: { number: true } })
    const number = (last?.number ?? 0) + 1
    try {
      const created = await db.contract.create({ data: { customerId, legalEntityId, number } })
      return { id: created.id, number: created.number }
    } catch (err) {
      // Либо номер занят (гонка нумерации), либо пару уже создали —
      // обе ситуации разруливает следующий виток (findUnique наверху).
      if (!isUniqueViolation(err)) throw err
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
  // В4: заявка рождается из лида — связь Order.leadId ставится прямо
  // при создании. @unique на leadId в схеме защищает от гонки двойного
  // клика по «Конвертировать»: второй параллельный create упирается в
  // P2002, а не в вторую заявку-дубликат.
  leadId?: string
  // Ж1: снимки с лида — груз (форма бланка, как Lead.cargoInfo) и
  // выбранный вариант расчёта. Копия в момент конвертации: дальше
  // заявка — источник правды, правки лида на неё не влияют.
  // null/undefined = поля не заданы (ручные заявки из Б3).
  cargoInfo?: Prisma.InputJsonValue | null
  quoteSnapshot?: Prisma.InputJsonValue | null
  // P1-03: маршрут/метрики — снимок колонок лида (convert) в колонки
  // заявки; готовые к записи значения (readyDate уже Date). Ручные
  // заявки (Б3) создаются без груза — PATCH заполнит позже.
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
  // P1-01: ответственный менеджер. Ручная заявка (Б3) — создатель;
  // конвертация В4 — ответственный лида (без него — конвертер).
  // null/undefined = не назначена (совместимо с обоими путями).
  assignedToId?: string | null
}

// Номер заявки — составной «<договор>-<порядковый>» (Б4): первая заявка
// по договору 17 будет «17-1», вторая «17-2». Порядковый — в рамках
// договора, уникальность защищена на уровне БД (@@unique +
// денормализованный Order.number тоже уникален), гонка — retry-петлёй
// P2002, как у заказов APEX Moto.
export async function createOrderWithStages(
  input: CreateOrderInput
): Promise<{ id: string; number: string } | { error: string; status: number }> {
  const contract = await findOrCreateContract(input.customerId, input.legalEntityId)
  if ('error' in contract) return contract

  // Обязательное ядро подставляется автоматически (роадмап, раздел 3):
  // читаем каталог один раз до цикла — справочник в рамках одного
  // запроса не меняется.
  const mandatoryStages = await db.orderStageCatalog.findMany({
    where: { isMandatory: true },
    orderBy: { order: 'asc' },
  })

  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt++) {
    const lastInContract = await db.order.findFirst({
      where: { contractId: contract.id },
      orderBy: { numberInContract: 'desc' },
      select: { numberInContract: true },
    })
    const numberInContract = (lastInContract?.numberInContract ?? 0) + 1
    const number = `${contract.number}-${numberInContract}`

    try {
      const order = await db.order.create({
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
          // Ручные заявки (Б3) приходят без leadId — колонка остаётся
          // NULL (осознанно допустимо); заявка из лида (В4) получает
          // связь с рождения записи.
          ...(input.leadId ? { leadId: input.leadId } : {}),
          // Ж1: снимки с лида — только когда есть что копировать;
          // иначе колонки остаются NULL (ручные заявки, правка — PATCH).
          ...(input.cargoInfo != null ? { cargoInfo: input.cargoInfo } : {}),
          ...(input.quoteSnapshot != null ? { quoteSnapshot: input.quoteSnapshot } : {}),
          // P1-03: маршрут/метрики — снимок колонок лида (undefined-safe)
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
          // P1-01: ответственный — только когда есть кто назначать
          // (иначе колонка остаётся NULL и лид попадает в «Без ответственного»).
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
    }
  }
  return { error: 'Не удалось создать заявку после нескольких попыток', status: 500 }
}

// ─── Этап: проверка обязательности через каталог (роадмап, раздел 3) ──

// Правило «обязательное ядро нельзя удалить» защищается НА СЕРВЕРЕ,
// а не только скрытой кнопкой в UI — урок write-guard'ов из APEX Moto.
export async function isStageMandatory(stageCode: string): Promise<boolean> {
  const stage = await db.orderStageCatalog.findUnique({ where: { code: stageCode } })
  return stage?.isMandatory ?? false
}

// ─── Готовность обязательного ядра к завершению заявки (P1-05) ──
// Обязательные (по АКТУАЛЬНОМУ каталогу, не по снимку) этапы, которые
// ещё не «Завершён». Пустой список = заявку можно завершать; непустой
// — завершение отклоняется, мастер может перекрыть с комментарием
// (решение о перекрытии принимает роут PATCH заявки — там роль и журнал).
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
// Ближайший этап / прогресс / просрочка считаются одинаково в списке
// заявок (Ж4) и в карточке клиента (Ж6а) — один код-путь вместо копий.
// Этапов в заявке единицы, поэтому JS-сводка по выбранным этапам
// дешевле отдельного aggregate-запроса (комментарий роута orders GET).

export type StageViewRow = {
  stageCode: string
  status: string
  plannedDate: Date | null
  contractor: { companyName: string } | null
}

export type StageView = {
  code: string
  name: string
  status: string
  plannedDate: Date | null
  contractorName: string | null
}

export type OrderStagesSummary = {
  stagesTotal: number
  stagesDone: number
  stagesProblem: number
  nearestStage: StageView | null
  overdue: boolean
  // v0.3.1 (BRANDBOOK §4.3): имя просроченного этапа для строки
  // задержки на карточке списка — без него карточка могла бы показать
  // просрочку не того этапа (просроченным может быть любой
  // незавершённый, не только ближайший).
  overdueStage: string | null
}

export function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

// Граница «сегодня» по UTC: плановые даты приходят UTC-полуночью
// (UI шлёт T00:00:00.000Z), локальная таймзона сервера не должна
// сдвигать день (то же правило — в роуте orders GET и Ж5 attention).
export function todayUtcMidnight(): number {
  return utcDayStart(new Date())
}

// Этапы заявки (по sequence asc) → сводка: первый незавершённый этап
// (включая «проблема» — он и есть ближайшая точка работы), прогресс и
// просрочка (ЛЮБОЙ незавершённый этап с планом раньше сегодняшней).
export function summarizeOrderStages(
  stages: StageViewRow[],
  stageNames: Map<string, string>,
  todayUtc: number
): OrderStagesSummary {
  const incomplete = stages.filter((s) => s.status !== 'done')
  const nearest = incomplete[0] ?? null
  const overdueRow =
    incomplete.find((s) => s.plannedDate !== null && s.plannedDate.getTime() < todayUtc) ?? null
  return {
    stagesTotal: stages.length,
    stagesDone: stages.length - incomplete.length,
    stagesProblem: stages.filter((s) => s.status === 'problem').length,
    nearestStage: nearest
      ? {
          code: nearest.stageCode,
          name: stageNames.get(nearest.stageCode) ?? nearest.stageCode,
          status: nearest.status,
          plannedDate: nearest.plannedDate,
          contractorName: nearest.contractor?.companyName ?? null,
        }
      : null,
    overdue: overdueRow !== null,
    overdueStage: overdueRow
      ? stageNames.get(overdueRow.stageCode) ?? overdueRow.stageCode
      : null,
  }
}

// v0.3.1 (BRANDBOOK §4.3): ETA заявки — обещанная дата завершения.
// Семантика: МАКСИМАЛЬНАЯ плановая дата среди незавершённых этапов
// («когда закончится всё»), а не план ближайшего — просроченный ранний
// этап не должен занижать ETA финала. Дат нет или всё завершено —
// null (UI показывает «Даты не заданы»/«Доставлено»). Серверная
// точка подсчёта — чтобы клиентская проекция и будущие кабинеты
// считали одинаково (принцип единого код-пути, как summarize выше).
export function calcOrderEta(
  stages: Array<{ status: string; plannedDate: Date | null }>
): Date | null {
  let eta: Date | null = null
  for (const s of stages) {
    if (s.status === 'done' || s.plannedDate === null) continue
    if (eta === null || s.plannedDate.getTime() > eta.getTime()) eta = s.plannedDate
  }
  return eta
}

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
