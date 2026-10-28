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
