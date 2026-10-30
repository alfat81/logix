import { z } from 'zod'

// ─── DF-16 «Разрешительные документы»: чистые правила (D35) ──────────
// Клиент-безопасный файл (как brokers.ts / waiting.ts): БЕЗ серверных
// зависимостей — импортируется роутами, UI трёх кабинетов и unit-тестами.
// Запись в БД — ТОЛЬКО permits-db.ts (серверный модуль).
//
// Обязательство: кто (providedBy) какой документ (title) должен
// предоставить к какому сроку (neededBy) и блокирует ли он отправку/
// этап (isBlocking). Пока статус pending — плашка «Ожидается: …» видна
// всем сторонам сделки, держится мяч awaiting_permit (DF-05), строка
// попадает в «Ждём от вас» писем; блокирующая с близким сроком даёт
// красное событие permit_overdue (скан диспетчера).

// ─── Кто должен предоставить ─────────────────────────────────────────

export const PERMIT_PROVIDERS = ['client', 'broker', 'staff'] as const
export type PermitProvider = (typeof PERMIT_PROVIDERS)[number]

// Подписи для сотрудников (карточка, события, письма).
export const PERMIT_PROVIDER_LABELS: Record<PermitProvider, string> = {
  client: 'клиент',
  broker: 'брокер',
  staff: 'сотрудник',
}

// С точки зрения читателя: свои обязательства — «вы», чужие — по имени
// стороны (плашка «Ожидается: … — от …» не говорит о читателе «клиент»).
export function providerLabelFor(
  providedBy: PermitProvider,
  viewer: 'staff' | 'client' | 'broker'
): string {
  if (viewer === 'client' && providedBy === 'client') return 'вас'
  if (viewer === 'broker' && providedBy === 'broker') return 'вас'
  return PERMIT_PROVIDER_LABELS[providedBy]
}

// ─── Статусы строки ──────────────────────────────────────────────────

export const PERMIT_STATUSES = ['pending', 'received', 'waived'] as const
export type PermitStatus = (typeof PERMIT_STATUSES)[number]

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  pending: 'Ожидается',
  received: 'Получен',
  waived: 'Не требуется',
}

// ─── Лимиты полей (потолки схем zod + maxLength UI) ──────────────────

export const PERMIT_TITLE_MAX = 200 // как PERMIT_MAX_LENGTH свободного списка
export const PERMIT_STAFF_NOTE_MAX = 1000
export const PERMIT_WAIVED_REASON_MAX = 500
export const PERMIT_ITEM_ID_MAX = 40

// ─── Схемы API ───────────────────────────────────────────────────────

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Срок — дата в формате ГГГГ-ММ-ДД')
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime()), 'Некорректная дата')

// POST /api/{admin|broker}/.../permits — добавляет брокер или сотрудник.
// itemId — необязательная привязка к строке ответа брокера (валидацию
// «строка существует у этой сделки» делает роут).
export const CreatePermitSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Укажите название документа')
    .max(PERMIT_TITLE_MAX, `Название — не длиннее ${PERMIT_TITLE_MAX} символов`),
  providedBy: z.enum(PERMIT_PROVIDERS, {
    errorMap: () => ({ message: 'Кто предоставляет: client | broker | staff' }),
  }),
  isBlocking: z.boolean().optional(),
  neededBy: dateStr.nullable().optional(),
  staffNote: z
    .string()
    .trim()
    .max(PERMIT_STAFF_NOTE_MAX, 'Заметка — слишком длинная')
    .nullable()
    .optional(),
  itemId: z.string().trim().max(PERMIT_ITEM_ID_MAX).nullable().optional(),
})
export type CreatePermitInput = z.infer<typeof CreatePermitSchema>

// PATCH /api/admin/permits/[id] — правит ТОЛЬКО сотрудник: поля строки
// и «не требуется» с причиной. Перевод в received — только загрузкой
// документа (POST /permits/[id]/document), PATCH его не подделывает.
export const PatchPermitSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Укажите название документа')
      .max(PERMIT_TITLE_MAX)
      .optional(),
    providedBy: z.enum(PERMIT_PROVIDERS).optional(),
    isBlocking: z.boolean().optional(),
    neededBy: dateStr.nullable().optional(),
    staffNote: z.string().trim().max(PERMIT_STAFF_NOTE_MAX).nullable().optional(),
    itemId: z.string().trim().max(PERMIT_ITEM_ID_MAX).nullable().optional(),
    status: z.enum(PERMIT_STATUSES).optional(),
    waivedReason: z.string().trim().max(PERMIT_WAIVED_REASON_MAX).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Нечего обновлять: передайте хотя бы одно поле',
  })
export type PatchPermitInput = z.infer<typeof PatchPermitSchema>

// ─── Чистые правила ──────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

// «Красный» срок (D35): до neededBy осталось меньше permits.red_days_before
// суток ЛИБО срок прошёл. neededBy — дата (UTC-полночь из формы), nowUtc —
// точка сравнения (тесты передают фиксированную). Возврат true — красный
// (в интерфейсе: badge critical; в скане диспетчера — кандидат на
// permit_overdue, если строка блокирующая).
export function isPermitRed(neededBy: Date, nowUtc: Date, redDaysBefore: number): boolean {
  return neededBy.getTime() - nowUtc.getTime() <= redDaysBefore * DAY_MS
}

// Просрочка: срок прошёл (независимо от isBlocking — для плашки/письма).
export function isPermitOverdue(neededBy: Date, nowUtc: Date): boolean {
  return neededBy.getTime() < nowUtc.getTime()
}

// Строка в порядке срочности для правила «у кого мяч» (DF-05): первой
// сдаётся блокирующая, затем ближайший срок (без срока — в конце), затем
// старейшая. Тесты фиксируют порядок.
export type PermitUrgencyRow = {
  providedBy: PermitProvider
  isBlocking: boolean
  neededBy: Date | null
  createdAt: Date
}

export function pickMostUrgentPermit<T extends PermitUrgencyRow>(rows: T[]): T | null {
  let best: T | null = null
  for (const row of rows) {
    if (!best || lessUrgent(best, row)) best = row
  }
  return best
}

// Лексикографическое сравнение срочности: best уступает место row, если
// row «горячее» (blocking ↓, срок ↑ c null в конце, createdAt ↑).
function lessUrgent(a: PermitUrgencyRow, b: PermitUrgencyRow): boolean {
  if (a.isBlocking !== b.isBlocking) return !a.isBlocking // b блокирующая → b горячее
  const aDue = a.neededBy ? a.neededBy.getTime() : Number.MAX_SAFE_INTEGER
  const bDue = b.neededBy ? b.neededBy.getTime() : Number.MAX_SAFE_INTEGER
  if (aDue !== bDue) return aDue > bDue // b раньше → b горячее
  return a.createdAt.getTime() > b.createdAt.getTime() // b старее → b горячее
}

// Держатель мяча по providedBy: клиент/брокер ждём с них, сотрудник —
// менеджер (onId решает waiting-db по сделке).
export function permitHolderKind(providedBy: PermitProvider): 'client' | 'broker' | 'manager' {
  if (providedBy === 'client') return 'client'
  if (providedBy === 'broker') return 'broker'
  return 'manager'
}

// Дата для плашек/писем: дд.мм.гггг по UTC (та же семантика, что
// fmtRuDate у событий; здесь локальная чистая копия — activity.ts тянет
// Prisma и из клиента запрещён).
export function fmtPermitDate(d: Date | null | undefined): string {
  if (!d) return '—'
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getUTCFullYear()}`
}
