import { z } from 'zod'
import { formatMoney, moneyAmount } from '@/lib/money'
import { isEmail } from '@/lib/phone'

// ─── Брокеры: константы, схемы и проекции (Дорожка Д, роадмап 5а) ──
// Клиент-безопасный файл по образцу lib/contractors.ts (Г) и
// lib/client-constants.ts (И1): БЕЗ серверных зависимостей (db и
// т.п.), его импортируют и API-роуты, и UI админки/портала.

// Название компании — потолок как у подрядчика (Г2).
export const BROKER_COMPANY_NAME_MAX = 200

// DF-02: контактный email компании брокера для уведомлений
// (адресат-человек живёт в BrokerUser.email; здесь — общий адрес
// компании, фолбэк будущих recipientsOfBroker). Правила те же, что
// у сотрудников (Ж6в): необязателен, мусор не сохраняем.
export const BROKER_EMAIL_MAX = 200
export const BrokerEmailSchema = z
  .string()
  .trim()
  .max(BROKER_EMAIL_MAX, `Email — до ${BROKER_EMAIL_MAX} символов`)
  .refine((v) => isEmail(v), 'Некорректный email — ожидается адрес вида name@company.ru')
// Для PATCH: null = очистить поле, отсутствие = не менять.
export const PatchBrokerEmailSchema = BrokerEmailSchema.nullable()

// Пароль урезанного ЛК брокера. Жёстче подрядчицкого (6, Г2 — только
// свои этапы): брокер видит сделку целиком с этапа расчёта — тот же
// уровень доверия, что у клиента (И1, 8) и сотрудника (Ж6в, 8).
export const BROKER_PASSWORD_MIN = 8
export const BROKER_PASSWORD_MAX = 100

// ─── Создание брокера: POST /api/admin/brokers (Д) ────────────────
// Воронки квалификации (аналога ContractorLead) у брокеров нет —
// роадмап их не предусматривает, менеджер заводит брокера в справочник
// напрямую. Телефон — ЛОГИН портала и обязан нормализоваться в
// +7XXXXXXXXXX (проверка в роуте, как у сотрудников Ж6в: учётка с
// сырым иностранным номером была бы мертворождённой).
export const CreateBrokerSchema = z.object({
  companyName: z.string().trim().min(1, 'Укажите название компании').max(BROKER_COMPANY_NAME_MAX),
  phone: z.string().trim().min(5, 'Укажите телефон — логин портала').max(30),
  email: BrokerEmailSchema.optional(),
  password: z
    .string()
    .min(BROKER_PASSWORD_MIN, `Пароль — минимум ${BROKER_PASSWORD_MIN} символов`)
    .max(BROKER_PASSWORD_MAX),
  isInHouse: z.boolean().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
  contactInfo: z.record(z.unknown()).optional(),
})
export type CreateBrokerInput = z.infer<typeof CreateBrokerSchema>

// ─── PATCH брокера: /api/admin/brokers/[id] (Д) ───────────────────
// Все поля опциональны (хотя бы одно — иначе 400 «Нечего обновлять»
// в refine). DELETE не существует вовсе — как у подрядчиков (Г3):
// история сделок не должна терять участников, «удаление» = isActive
// false, а связи LeadBroker/OrderBroker живут своей жизнью.
// Смена пароля/деактивация рвут сессии (роут).
export const PatchBrokerSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(1, 'Укажите название компании')
      .max(BROKER_COMPANY_NAME_MAX)
      .optional(),
    phone: z.string().trim().min(5, 'Укажите телефон — логин портала').max(30).optional(),
    email: PatchBrokerEmailSchema.optional(),
    password: z
      .string()
      .min(BROKER_PASSWORD_MIN, `Пароль — минимум ${BROKER_PASSWORD_MIN} символов`)
      .max(BROKER_PASSWORD_MAX)
      .optional(),
    isInHouse: z.boolean().optional(),
    isActive: z.boolean().optional(),
    comment: z.string().trim().max(2000).nullable().optional(),
    contactInfo: z.record(z.unknown()).nullable().optional(),
  })
  .refine(
    (v) =>
      v.companyName !== undefined ||
      v.phone !== undefined ||
      v.email !== undefined ||
      v.password !== undefined ||
      v.isInHouse !== undefined ||
      v.isActive !== undefined ||
      v.comment !== undefined ||
      v.contactInfo !== undefined,
    { message: 'Нечего обновлять: передайте companyName, phone, email, password, isInHouse, isActive, comment или contactInfo' }
  )
export type PatchBrokerInput = z.infer<typeof PatchBrokerSchema>

// ─── Публичная проекция брокера (Д) ───────────────────────────────
// select-объект для ответов API: БЕЗ password — хеш не покидает
// сервер даже в read-режиме (тот же принцип, что
// CONTRACTOR_PUBLIC_FIELDS / EMPLOYEE_PUBLIC_FIELDS).
export const BROKER_PUBLIC_FIELDS = {
  id: true,
  companyName: true,
  phone: true,
  email: true,
  isInHouse: true,
  isActive: true,
  comment: true,
  contactInfo: true,
  createdAt: true,
} as const

// ─── Оценка таможенных платежей (BrokerEstimate, роадмап 5а) ──────
// То, что брокер сообщает ещё на этапе расчёта: (а) ожидаемый размер
// таможенных платежей и (б) какие разрешительные документы
// потребуются. PUT /api/broker/leads/[id]/estimate — полная замена
// (семантика PATCH заявки из Ж1): пустая форма не запрещена
// (обнуление), все три поля nullable.
export const PERMIT_MAX_COUNT = 20
export const PERMIT_MAX_LENGTH = 200
export const ESTIMATE_NOTES_MAX = 2000

const PermitListSchema = z
  .array(z.string().trim().min(1, 'Пустой пункт списка — удалите его').max(PERMIT_MAX_LENGTH))
  .max(PERMIT_MAX_COUNT, `Слишком много пунктов — до ${PERMIT_MAX_COUNT}`)

export const BrokerEstimateSchema = z.object({
  // P1-04: Decimal по RULES 2.15 (все деньги — Decimal, до 2 знаков
  // после запятой). Валюта — RUB по природе платежа. 0 допустим
  // (льготные категории ТН ВЭД), null — «сумма пока неизвестна».
  customsDutyEstimate: moneyAmount('Таможенные платежи', { allowZero: true })
    .nullable()
    .optional(),
  requiredPermits: PermitListSchema.nullable().optional(),
  notes: z.string().trim().max(ESTIMATE_NOTES_MAX, 'Комментарий — слишком длинный').nullable().optional(),
})
export type BrokerEstimateInput = z.infer<typeof BrokerEstimateSchema>

// ─── DF-18: строки ответа брокера по кодам ТН ВЭД (D38) ────────────
// Форма короткая (решение D38): по каждому коду три процента + пометки.
// Никаких полей Альты и ничего похожего на заполнение ДТ. Живой лимит
// строк — настройка broker.max_items (дефолт 30) — проверяет роут;
// здесь жёсткий потолок схемы (защита от мусора в теле запроса).
export const ESTIMATE_ITEM_HARD_CAP = 200
export const ESTIMATE_NOTE_MAX = 200

// Проценты — Decimal (RULES 2.15), «разумные границы» карточки: 0..100,
// до 2 знаков после запятой. 0 допустим (льготные коды, НДС 0).
export function percentValue(label: string) {
  return z
    .number({ errorMap: () => ({ message: `${label} — число` }) })
    .min(0, `${label} — не меньше нуля`)
    .max(100, `${label} — не больше 100`)
    .refine((v) => Number.isFinite(v), `${label} — число`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${label} — максимум 2 знака после запятой`)
}

export const EstimateItemSchema = z.object({
  // Ровно 10 цифр (карточка DF-18): справочник DF-17C хранит 10-значные
  // коды; поиск с пробелами («0101 21») обрабатывает HsCodeCombobox —
  // сюда приходит уже нормализованный код выбранной позиции.
  hsCode: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Код ТН ВЭД — ровно 10 цифр'),
  dutyPercent: percentValue('Пошлина').nullable().optional(),
  addDutyPercent: percentValue('Доп. пошлина').nullable().optional(),
  // «антидемпинговая», «компенсационная»…
  addDutyNote: z.string().trim().max(ESTIMATE_NOTE_MAX, 'Примечание — слишком длинное').nullable().optional(),
  vatPercent: percentValue('НДС').nullable().optional(),
  // Нестандартная ставка («2 €/кг»): строка с ней считается вручную
  // (isManualRate) — система её не вычисляет (DF-19 не трогает).
  rateNote: z.string().trim().max(ESTIMATE_NOTE_MAX, 'Примечание — слишком длинное').nullable().optional(),
})

// Расширение контракта PUT оценки: старые поля принимаются как раньше,
// новые добавлены (карточка DF-18, G2 — контракт не ломать).
export const BrokerEstimateFullSchema = BrokerEstimateSchema.extend({
  items: z.array(EstimateItemSchema).max(ESTIMATE_ITEM_HARD_CAP, `Строк — не больше ${ESTIMATE_ITEM_HARD_CAP}`).optional(),
  // false/не передан → черновик (как раньше, событие broker_estimate_changed);
  // true → «Отправить ответ» (статус sent, событие broker_estimate_sent).
  send: z.boolean().optional(),
})

// Строка с нестандартной ставкой (rateNote заполнен) считается брокером
// вручную — карточка DF-18. Единственная точка этого правила: ею пользуются
// форма, карточки и будущий расчёт DF-19.
export function isManualRate(item: { rateNote?: string | null } | null | undefined): boolean {
  return Boolean(item?.rateNote && item.rateNote.trim().length > 0)
}

// Проценты в человекочитаемый вид для diff и карточек: Decimal из API
// приходит строкой/числом; «5.00» → «5», «12.50» → «12,5», null → «—».
export function fmtPercent(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return '—'
  const s = String(Math.round(n * 100) / 100)
  return s.replace('.', ',')
}

// ─── DF-18: разница строк для события estimate_updated ──────────────
// Правки ПОСЛЕ отправки пишутся событием с разницей (карточка DF-18):
// что добавлено, что убрано, у каких кодов поменялись проценты. Чистая
// функция — e2e проверяет текст события, unit — построение.
type DiffItem = {
  hsCode: string
  dutyPercent?: number | string | null
  addDutyPercent?: number | string | null
  vatPercent?: number | string | null
}

export function diffEstimateItems(oldItems: DiffItem[], newItems: DiffItem[]): string {
  const byCode = (list: DiffItem[]) => new Map(list.map((i) => [i.hsCode, i]))
  const before = byCode(oldItems)
  const after = byCode(newItems)
  const parts: string[] = []
  // Порядок детерминированный: сначала добавленные, потом изменённые,
  // потом убранные — все по коду.
  for (const [code, item] of after) {
    if (!before.has(code)) {
      parts.push(`+ ${code} (${fmtPercent(item.dutyPercent)} / ${fmtPercent(item.addDutyPercent)} / ${fmtPercent(item.vatPercent)})`)
    }
  }
  // Decimal из API сериализуется строкой ('5.00'); сравниваем ЧИСЛОВОЕ
  // значение с округлением до 2 знаков — иначе «5.00» ≠ 5 и diff ложит
  // изменение туда, где его нет.
  const normPct = (v: number | string | null | undefined): string => {
    if (v === null || v === undefined || v === '') return ''
    const n = Number(v)
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v)
  }
  const changedFields: Array<[keyof DiffItem, string]> = [
    ['dutyPercent', 'пошлина'],
    ['addDutyPercent', 'доп. пошлина'],
    ['vatPercent', 'НДС'],
  ]
  for (const [code, item] of after) {
    const prev = before.get(code)
    if (!prev) continue
    const changes = changedFields
      .filter(([field]) => normPct(prev[field]) !== normPct(item[field]))
      .map(([field, label]) => `${label} ${fmtPercent(prev[field])}→${fmtPercent(item[field])}`)
    if (changes.length > 0) parts.push(`${code}: ${changes.join(', ')}`)
  }
  for (const code of before.keys()) {
    if (!after.has(code)) parts.push(`− ${code}`)
  }
  return parts.join('; ')
}

// ─── Конвенции Json для UI (по образцу mergeTransportChips Г5) ────
// API хранит requiredPermits как Json; UI читает толерантно — чужая
// структура не роняет карточки.
export function readPermits(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// Строка «₽ / не указана» для UI обеих сторон (админка и портал).
// P1-04: форматирование — только через formatMoney (RULES 2.15).
// Decimal из API приходит строкой/числом — formatMoney понимает оба.
export function fmtDuty(n: number | string | null | undefined): string {
  return n === null || n === undefined || n === ''
    ? 'сумма не указана'
    : formatMoney(n, 'RUB')
}

// Пометка «штатный/привлечённый» для списков.
export const BROKER_KIND_LABELS: Record<string, string> = {
  in_house: 'Штатный',
  external: 'Привлечённый',
}
