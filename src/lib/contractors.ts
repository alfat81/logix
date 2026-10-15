import { z } from 'zod'

// Константы статусов и zod-схемы подрядческой линии — файл БЕЗ серверных
// зависимостей (db и т.п.): его импортируют и API-роуты (Г2/Г3), и UI
// (Г5) — тот же паттерн «константы для UI», что lib/leads.ts из В1 и
// lib/order-constants.ts из Б3.

// ─── Статусы кандидата (ContractorLead, Г1/Г2) ──────────────────────
//
// Свой чек-лист квалификации, НЕ копия клиентской воронки (роадмап 2):
// new → qualifying → contracted | rejected. Переходы — руками менеджера
// (симметрия 8.1: статус меняет человек, не триггер; автоматов в этой
// воронке нет вообще — в отличие от клиентской, где new→calculated
// ставил первый вариант В3). Исключение — «contracted»: он терминальный
// и ставится ТОЛЬКО рождением Contractor в транзакции (Г2), API его
// отвергает при попытке поставить «просто статус» — как «won» у лида.
export const CONTRACTOR_LEAD_STATUSES = [
  'new',
  'qualifying',
  'contracted',
  'rejected',
] as const
export type ContractorLeadStatus = (typeof CONTRACTOR_LEAD_STATUSES)[number]

export const CONTRACTOR_LEAD_STATUS_LABELS: Record<ContractorLeadStatus, string> = {
  new: 'Новый',
  qualifying: 'Квалификация',
  contracted: 'В пуле',
  rejected: 'Отказ',
}

// Черновая анкета кандидата (rawInfo Json, Г1) — толерантный record, как
// CargoInfoSchema лида (В1): API структуру НЕ валидирует. Известные
// ключи (контактное лицо/телефон/email/что возит/зоны/источник) —
// договорённость UI Г5 (метки + рендер как есть), чужая структура Json
// карточку не роняет.
export const RawContractorInfoSchema = z.record(z.unknown())

// Компетенции подрядчика (competencies Json, Г1) — тоже record: виды
// транспорта/направления покажет UI (чипы TRANSPORT_TYPES из lib/leads.ts),
// допуски (негабарит/опасные) добавятся внутрь Json в Phase 2 без
// миграции — «точка расширения на старте», роадмап 6.
export const ContractorCompetenciesSchema = z.record(z.unknown())

// Контактные данные подрядчика (contactInfo Json, Г1) — сырой Json по
// образцу rawContact: лицо/email/реквизиты, структуру не фиксируем до
// реальных печатных форм (Дорожка Е).
export const ContractorContactInfoSchema = z.record(z.unknown())

// ─── Создание кандидата (POST /api/admin/contractor-leads, Г2) ──────
export const CreateContractorLeadSchema = z.object({
  companyName: z.string().trim().min(1, 'Укажите название компании').max(200),
  rawInfo: RawContractorInfoSchema.optional(),
})
export type CreateContractorLeadInput = z.infer<typeof CreateContractorLeadSchema>

// ─── PATCH кандидата: смена статуса / рождение подрядчика ───────────
//
// Один роут, два сценария (формулировка Г2):
//   • status: qualifying | rejected — ручные переходы (rejected требует
//     причину — симметрия lostReason лида);
//   • status: contracted — транзакция рождения Contractor: phone и
//     стартовый пароль ОБЯЗАТЕЛЬНЫ (это логин урезанного ЛК, Г4),
//     компетенции/контакт/договорные поля — опциональные дополнения к
//     тому, что менеджер уже знает из rawInfo.
// Обязательность полей рождения — в роуте (зависит от статуса), а не в
// refine схемы: zod не должен требовать телефон у простого перехода в
// qualifying.
export const PatchContractorLeadSchema = z.object({
  status: z.enum(CONTRACTOR_LEAD_STATUSES, {
    errorMap: () => ({ message: 'Неизвестный статус кандидата' }),
  }),
  rejectReason: z.string().trim().min(1, 'Укажите причину отказа').optional(),

  // Поля рождения подрядчика (используются только при status=contracted)
  phone: z.string().trim().min(5, 'Укажите телефон для входа в ЛК').max(30).optional(),
  password: z.string().min(6, 'Пароль — минимум 6 символов').max(100).optional(),
  competencies: ContractorCompetenciesSchema.optional(),
  contactInfo: ContractorContactInfoSchema.optional(),
  contractNumber: z.string().trim().max(50).optional(),
  contractSignedAt: z.coerce.date().optional().nullable(),
  comment: z.string().trim().max(2000).optional(),
})
export type PatchContractorLeadInput = z.infer<typeof PatchContractorLeadSchema>

// ─── Публичная проекция подрядчика (Г3) ─────────────────────────
// select-объект для ответов API пула: БЕЗ password — хеш не покидает
// сервер даже в read-режиме. Чистый объект без импортов (тот же
// принцип «файл для роутов и UI», что у констант выше): им пользуются
// GET /api/admin/contractors и PATCH /[id] из Г3.
export const CONTRACTOR_PUBLIC_FIELDS = {
  id: true,
  companyName: true,
  phone: true,
  competencies: true,
  contactInfo: true,
  contractNumber: true,
  contractSignedAt: true,
  isActive: true,
  comment: true,
  createdAt: true,
} as const

// ─── PATCH подрядчика пула: /api/admin/contractors/[id] (Г3) ─────
//
// Единственный write справочника: правка профиля/компетенций,
// исключение из пула и возврат (isActive), смена пароля ЛК. DELETE
// не существует вовсе — «удаление» = isActive=false (шапка Дорожки
// Г: история заявок не теряет исполнителей). Все поля опциональны:
// пустой PATCH — 400 «Нечего обновлять» в роуте.
//
// Телефон — это ЛОГИН ЛК, поэтому редактируется с ограничениями
// (нормализация в момент записи + занятость другим подрядчиком —
// 409, паттерн рождения из Г2). contractNumber/comment — nullable:
// PATCH умеет осознанно ОЧИЩАТЬ поле null'ом (пустая строка тоже
// приводится к null, как incoterm у заявки в Б3).
export const PatchContractorSchema = z.object({
  companyName: z.string().trim().min(1, 'Укажите название компании').max(200).optional(),
  phone: z.string().trim().min(5, 'Укажите телефон для входа в ЛК').max(30).optional(),
  password: z.string().min(6, 'Пароль — минимум 6 символов').max(100).optional(),
  competencies: ContractorCompetenciesSchema.optional(),
  contactInfo: ContractorContactInfoSchema.optional(),
  contractNumber: z.string().trim().max(50).nullable().optional(),
  contractSignedAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
})
export type PatchContractorInput = z.infer<typeof PatchContractorSchema>

// ─── Конвенции Json для UI (Г5) ────────────────────────────────────
//
// API толерантен к любой форме rawInfo/competencies (record-схемы выше),
// но UI Г5 договаривается о КОНКРЕТНЫХ ключах — ровно тех, что писали
// прогонные скрипты Г2/Г3 и демо-данные песочницы (Сванишвили):
//   • rawInfo кандидата: contactPerson / phone / email / transportTypes
//     (массив) / directions — анкета «кто и что возит» на этапе поиска;
//   • competencies подрядчика: transportModes (массив, чипы
//     TRANSPORT_TYPES из lib/leads.ts) / directions (строка зон).
// Чужие/старые ключи карточка НЕ теряет: unknown-поля rawInfo
// показываются как есть, чужие значения массива компетенций
// сохраняются при записи чипов (см. mergeTransportChips).
export const CONTRACTOR_RAW_INFO_LABELS: Record<string, string> = {
  contactPerson: 'Контактное лицо',
  phone: 'Телефон',
  email: 'Email',
  transportTypes: 'Виды транспорта',
  directions: 'Зоны работы',
}

export const COMPETENCIES_TRANSPORT_KEY = 'transportModes'
export const COMPETENCIES_DIRECTIONS_KEY = 'directions'

// Толерантное чтение массива видов транспорта: не массив / не строки —
// пусто, UI не падает на любой форме Json.
export function readTransportChips(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// Толерантное чтение строковых полей анкеты (directions и пр.).
export function readInfoString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Слияние при записи чипов компетенций: менеджер переключает только
// известные значения TRANSPORT_TYPES, значения вне справочника
// (внесённые раньше руками или скриптом) молча сохраняются — правка
// чипов не должна стирать данные, которых UI не показывает.
export function mergeTransportChips(
  existing: unknown,
  selectedKnown: readonly string[]
): string[] {
  const existingArr = readTransportChips(existing)
  const kept = existingArr.filter((v) => !selectedKnown.includes(v))
  return [...selectedKnown, ...kept]
}
