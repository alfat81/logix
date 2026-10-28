import { z } from 'zod'
import {
  parseRouteText,
  joinRouteText,
  RouteFieldsSchema,
  TRANSPORT_FORM_TO_CODE,
  TRANSPORT_TYPE_LABELS,
  type TransportTypeCode,
} from '@/lib/route-fields'
import { VAT_MODES, moneyAmount } from '@/lib/money'
import { currencyCodeSchema } from '@/lib/ref'

// Константы статусов и zod-схемы лидов — файл БЕЗ серверных зависимостей
// (db и т.п.): его импортируют и API-роуты, и будущий UI воронки (В5).
// Разделение как в заявках: константы/схемы здесь, серверная логика
// (конвертация, инварианты вариантов) — в роутах и lib/orders.ts.

// Статус лида (роадмап, разделы 2 и 8.1): верхнеуровневый статус воронки
// менеджер переводит вручную. Исключение — «won»: он терминальный и
// проставляется ТОЛЬКО конвертацией в заявку (В4), API В2 его отвергает.
// Побочный автомат один и осознанный (В3): первый добавленный вариант
// расчёта переводит new → calculated — статус буквально означает
// «посчитан»; удаление вариантов статус НЕ откатывает (симметрия с 8.1:
// статус меняет человек, не триггер).
export const LEAD_STATUSES = ['new', 'calculated', 'won', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Новый',
  calculated: 'Рассчитан',
  won: 'Выигран',
  lost: 'Отказ',
}

// v0.3.1 (BRANDBOOK §4.1): счётчик навигации у «Лидов» — активные,
// т.е. ещё не вышедшие из воронки: won уезжает в заявку, lost закрыт.
// Группа едина с ORDER_ACTIVE_STATUSES (lib/order-constants) по духу:
// одно место знания о том, что считается «активным».
export const LEAD_ACTIVE_STATUSES: readonly LeadStatus[] = ['new', 'calculated']

// Источник лида (И1): 'manual' — создан менеджером (В2, дефолт схемы),
// 'cabinet' — запрос из клиентского кабинета. Поле читают список и
// карточка лида в админке (бейдж «Кабинет»: менеджеру видно, что
// запрос пришёл снаружи и ещё не проработан).
export const LEAD_SOURCES = ['manual', 'cabinet'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  manual: 'Менеджер',
  cabinet: 'Кабинет',
}

// Черновая анкета контакта на этапе запроса (В1, rawContact Json).
// Телефон здесь СОЗНАТЕЛЬНО не нормализуется и не валидируется жёстко:
// до конвертации это черновик, контакты бывают иностранные (+86…),
// нормализация (lib/phone.ts) случится один раз — при рождении Customer
// из rawContact на конвертации (В4).
export const RawContactSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя контакта'),
  phone: z.string().trim().max(30).optional(),
  email: z.string().email('Некорректный email').optional(),
})
export type RawContact = z.infer<typeof RawContactSchema>

// Свободная анкета груза на этапе запроса (груз/вес/объём/откуда-куда).
// Json без жёсткой формы: структура уедет в печатные формы расчёта
// позже (Phase 2), на этапе запроса фиксировать её рано.
export const CargoInfoSchema = z.record(z.unknown())

// ─── Анкета груза лида по типовому бланку заявки (В5) ────────────
//
// Разбор бланка клиента (upload/zayavka-J-3-26-2634.pdf, 28 полей)
// дал полям запроса конкретную структуру. Здесь — та часть бланка,
// что заполняется ДО расчёта (маршрут, груз, стороны); остальное
// живёт в других сущностях: п.21–23 бланка (перечень услуг, срок,
// стоимость и условия оплаты) — это варианты расчёта QuoteOption
// (В3) и далее заявка; п.25–28 (заверения, подписи, печать) —
// печатные формы (Дорожка Е). API остаётся толерантным
// (CargoInfoSchema = record): структура — договорённость UI В5,
// лиды с иной формой Json карточка читает без падений.

// Тип перевозки (бланк, п.3). Значения — русские строки: Json груза
// уедет в печатные формы как есть, без словаря перекодировки.
export const TRANSPORT_TYPES = ['Авиа', 'Авто', 'ЖД', 'Море', 'Мультимодальная'] as const
export type TransportType = (typeof TRANSPORT_TYPES)[number]

// Состояние формы анкеты в UI: все поля — строки (числа парсятся при
// сборке в buildLeadPayload), '' = «не заполнено», Да/Нет — 'yes'|'no'.
export type LeadCargoForm = {
  // Маршрут (бланк п.3, 17, 20, 4, 18). DF-17: страна — Combobox
  // справочника (IC-16): форма хранит КОД, имя берёт сервер из
  // справочника (денормализация в текстовую колонку на записи).
  transportType: string
  originCountryCode: string
  originCity: string
  destinationCountryCode: string
  destinationCity: string
  routeNote: string
  shipDate: string
  // Груз (бланк п.5–15). Упаковка — Combobox с вариантом «Другое»:
  // выбрали из справочника → packaging = имя, packagingCode = код;
  // «Другое» → свободный текст, код пустой.
  cargoName: string
  hsCode: string
  placesCount: string
  weightKg: string
  volumeM3: string
  packaging: string
  packagingCode: string
  cargoValue: string
  dangerous: string
  stackable: string
  tiltable: string
  specialRequirements: string
  // DF-17: условие поставки — Combobox с разъяснением (в форме запроса
  // клиента; у менеджера — при конвертации). Хранится кодом.
  incotermCode: string
  // Грузоотправитель (п.16) и грузополучатель (п.19): наименование,
  // ИНН, адрес — как в бланке, блоками.
  shipperName: string
  shipperInn: string
  shipperAddress: string
  consigneeName: string
  consigneeInn: string
  consigneeAddress: string
}

export const EMPTY_LEAD_CARGO_FORM: LeadCargoForm = {
  transportType: '',
  originCountryCode: '',
  originCity: '',
  destinationCountryCode: '',
  destinationCity: '',
  routeNote: '',
  shipDate: '',
  cargoName: '',
  hsCode: '',
  placesCount: '',
  weightKg: '',
  volumeM3: '',
  packaging: '',
  packagingCode: '',
  cargoValue: '',
  dangerous: '',
  stackable: '',
  tiltable: '',
  specialRequirements: '',
  incotermCode: '',
  shipperName: '',
  shipperInn: '',
  shipperAddress: '',
  consigneeName: '',
  consigneeInn: '',
  consigneeAddress: '',
}

// Подписи полей анкеты — общие для диалога создания и карточки лида
// (порядок полей повторяет бланк заявки клиента).
export const LEAD_CARGO_LABELS: Record<keyof LeadCargoForm, string> = {
  transportType: 'Тип перевозки',
  originCountryCode: 'Страна отправления',
  originCity: 'Пункт отправления',
  destinationCountryCode: 'Страна прибытия',
  destinationCity: 'Пункт прибытия',
  routeNote: 'Маршрут (подробно)',
  shipDate: 'Предв. дата отправления',
  cargoName: 'Наименование груза',
  hsCode: 'Код ТН ВЭД',
  placesCount: 'Количество мест',
  weightKg: 'Общий вес брутто, кг',
  volumeM3: 'Общий объём, м³',
  packaging: 'Тип упаковки',
  packagingCode: 'Упаковка (код)',
  cargoValue: 'Стоимость груза',
  dangerous: 'Опасный груз',
  stackable: 'Штабелирование',
  tiltable: 'Кантование',
  specialRequirements: 'Особые требования',
  incotermCode: 'Условия поставки (Инкотермс)',
  shipperName: 'Наименование',
  shipperInn: 'ИНН',
  shipperAddress: 'Адрес',
  consigneeName: 'Наименование',
  consigneeInn: 'ИНН',
  consigneeAddress: 'Адрес',
}

// Сборка тела POST/PATCH из формы: маршрут/метрики уходят в route
// (колонки P1-03), «остальное» бланка — в cargo (Json, v: 1). Пустые
// строки отбрасываются, числа парсятся с запятой или точкой, Да/Нет →
// true/false. route всегда полный (null = очистить поле — диф в журнале
// пустое против пустого не пишет), cargo null = очистить анкету-rest.
export type LeadCargoPayload = {
  route: {
    originCity?: string | null
    originCountry?: string | null
    destinationCity?: string | null
    destinationCountry?: string | null
    transportType?: TransportTypeCode | null
    readyDate?: string | null
    weightKg?: number | null
    volumeM3?: number | null
    placesCount?: number | null
    originCountryCode?: string | null
    destinationCountryCode?: string | null
  }
  cargo: Record<string, unknown> | null
  // DF-17: условие поставки — код из справочника (колонка Lead,
  // конвертация переносит в заявку). Пустая строка/отсутствие — поле не указано.
  incotermCode?: string | null
}

export function buildLeadPayload(form: LeadCargoForm): LeadCargoPayload {
  const s = (v: string): string | undefined => v.trim() || undefined
  const num = (v: string): number | null => {
    const t = v.trim().replace(',', '.')
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const bool = (v: string): boolean | undefined =>
    v === 'yes' ? true : v === 'no' ? false : undefined

  const shipDate = /^\d{4}-\d{2}-\d{2}$/.test(form.shipDate.trim())
    ? form.shipDate.trim()
    : null

  // DF-17: маршрут — город текстом, страна КОДОМ из справочника
  // (имя на сервере денормализует ref-db); текст «Страна, город» больше
  // не пишется формами (легаси-колонки живут снимками).
  const route: LeadCargoPayload['route'] = {
    originCity: s(form.originCity) || null,
    destinationCity: s(form.destinationCity) || null,
    originCountryCode: form.originCountryCode.trim() || null,
    destinationCountryCode: form.destinationCountryCode.trim() || null,
    transportType: TRANSPORT_FORM_TO_CODE[form.transportType.trim()] ?? null,
    readyDate: shipDate,
    weightKg: num(form.weightKg),
    volumeM3: num(form.volumeM3),
    placesCount: num(form.placesCount),
  }

  const cargo: Record<string, unknown> = {
    routeNote: s(form.routeNote),
    cargoName: s(form.cargoName),
    hsCode: s(form.hsCode),
    packaging: s(form.packaging),
    packagingCode: s(form.packagingCode),
    cargoValue: s(form.cargoValue),
    dangerous: bool(form.dangerous),
    stackable: bool(form.stackable),
    tiltable: bool(form.tiltable),
    specialRequirements: s(form.specialRequirements),
    shipperName: s(form.shipperName),
    shipperInn: s(form.shipperInn),
    shipperAddress: s(form.shipperAddress),
    consigneeName: s(form.consigneeName),
    consigneeInn: s(form.consigneeInn),
    consigneeAddress: s(form.consigneeAddress),
    v: 1,
  }
  for (const k of Object.keys(cargo)) {
    if (cargo[k] === undefined) delete cargo[k]
  }
  return {
    route,
    cargo: Object.keys(cargo).length > 1 ? cargo : null,
    incotermCode: form.incotermCode.trim() || null,
  }
}

// Типизированное чтение cargoInfo в карточке: лиды со старой или
// чужой структурой Json не роняют UI (unknown-ключи показываются
// как есть, деградации нет). Легаси-ключи (from/to/origin — до
// миграции P1-03) читаются как unknown — отображения их используют
// только как fallback.
export type LeadCargoData = Partial<Record<keyof LeadCargoForm, unknown>> & Record<string, unknown>

export function readLeadCargo(cargoInfo: unknown): LeadCargoData {
  return cargoInfo && typeof cargoInfo === 'object' && !Array.isArray(cargoInfo)
    ? (cargoInfo as LeadCargoData)
    : {}
}

// Обратный разбор в состояние формы (Ж1: правка груза ЗАЯВКИ, правка
// анкеты лида P1-02, диалоги). Источник — колонки P1-03 (маршрут и
// метрики: Decimal приходит строкой — толерантно) + cargoInfo-rest.
// Легаси-ключи Json (from/origin/…) — fallback, если колонки пусты
// (старые данные до миграции/ручные вставки). Форма работает строками
// ('' = «не заполнено», 'yes'/'no' = Да/Нет), даты — yyyy-mm-dd.
export function cargoFormFromData(row: {
  cargoInfo?: unknown
  originCity?: unknown
  originCountry?: unknown
  destinationCity?: unknown
  destinationCountry?: unknown
  transportType?: unknown
  readyDate?: Date | string | null
  weightKg?: unknown
  volumeM3?: unknown
  placesCount?: unknown
  originCountryCode?: unknown
  destinationCountryCode?: unknown
  incotermCode?: unknown
}): LeadCargoForm {
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  const n = (v: unknown): string => {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return String(Number(v))
    return ''
  }
  const b = (v: unknown): string => (v === true ? 'yes' : v === false ? 'no' : '')
  const data: LeadCargoData = readLeadCargo(row.cargoInfo)

  // Маршрут: город — колонка (первичный источник), fallback — город из
  // легаси-текста «Страна, город» (до миграции P1-03 страна и город
  // жили одной строкой). Страна — КОД из колонки (DF-17); легаси-текст
  // страны формы не показывает — код проставляет backfill/выбор
  // в Combobox.
  const legacy = data as Record<string, unknown>
  const legacyFrom = joinRouteText(row.originCountry, row.originCity) || s(data.from) || s(legacy.origin)
  const legacyTo = joinRouteText(row.destinationCountry, row.destinationCity) || s(data.to) || s(legacy.destination)
  const originCity = s(row.originCity) || parseRouteText(legacyFrom).city || ''
  const destinationCity = s(row.destinationCity) || parseRouteText(legacyTo).city || ''

  // Тип перевозки: код колонки → подпись формы; fallback — Json-строка
  const code = typeof row.transportType === 'string' ? row.transportType : ''
  const transportType =
    (code in TRANSPORT_TYPE_LABELS
      ? TRANSPORT_TYPE_LABELS[code as TransportTypeCode]
      : '') || s(data.transportType)

  // Дата: Date → yyyy-mm-dd; строка-дата → как есть (если в формате)
  let shipDate = ''
  if (row.readyDate instanceof Date && !Number.isNaN(row.readyDate.getTime())) {
    shipDate = row.readyDate.toISOString().slice(0, 10)
  } else if (typeof row.readyDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.readyDate)) {
    shipDate = row.readyDate.slice(0, 10)
  }
  if (!shipDate) {
    const legacy = s(data.shipDate)
    shipDate = /^\d{4}-\d{2}-\d{2}$/.test(legacy) ? legacy : ''
  }

  return {
    transportType,
    originCountryCode: s(row.originCountryCode),
    originCity,
    destinationCountryCode: s(row.destinationCountryCode),
    destinationCity,
    routeNote: s(data.routeNote),
    shipDate,
    cargoName: s(data.cargoName),
    hsCode: s(data.hsCode),
    placesCount: n(row.placesCount),
    weightKg: n(row.weightKg),
    volumeM3: n(row.volumeM3),
    packaging: s(data.packaging),
    packagingCode: s(data.packagingCode),
    cargoValue: s(data.cargoValue),
    dangerous: b(data.dangerous),
    stackable: b(data.stackable),
    tiltable: b(data.tiltable),
    specialRequirements: s(data.specialRequirements),
    incotermCode: s(row.incotermCode),
    shipperName: s(data.shipperName),
    shipperInn: s(data.shipperInn),
    shipperAddress: s(data.shipperAddress),
    consigneeName: s(data.consigneeName),
    consigneeInn: s(data.consigneeInn),
    consigneeAddress: s(data.consigneeAddress),
  }
}

export const CreateLeadSchema = z
  .object({
    customerId: z.string().min(1).optional(),
    rawContact: RawContactSchema.optional(),
    cargoInfo: CargoInfoSchema.optional(),
    // P1-03: маршрут/метрики — колонки (см. lib/route-fields.ts)
    route: RouteFieldsSchema.optional(),
    // DF-17: условие поставки — код из справочника (кабинет клиента;
    // конвертация переносит в заявку)
    incotermCode: z.string().trim().max(10).transform((v) => v.toUpperCase()).nullable().optional(),
  })
  .refine((d) => d.customerId || d.rawContact, {
    message: 'Укажите существующего клиента (customerId) или контакты (rawContact)',
  })
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>

// PATCH лида — смена статуса (+ причина при отказе), ответственного
// (P1-01: assignedToId nullable — null снимает назначение) и/или правка
// анкеты (P1-02/P1-03: rawContact/cargoInfo/route — окно new/calculated
// проверяет роут; cargoInfo — полная замена известных полей-rest,
// неизвестные ключи сохраняет mergeLeadCargo). Пустое обновление — 400:
// молчаливый 200 плодит «ничего не изменилось» без следа в журнале.
export const PatchLeadSchema = z
  .object({
    status: z
      .enum(LEAD_STATUSES, {
        errorMap: () => ({ message: 'Неизвестный статус запроса' }),
      })
      .optional(),
    lostReason: z.string().trim().min(1, 'Укажите причину отказа').optional(),
    // P1-01: id сотрудника (строка) или null = снять ответственного.
    // Существование и активность сотрудника проверяет роут (справочник
    // живёт короче истории — проверка на момент действия).
    assignedToId: z.string().min(1).nullable().optional(),
    // P1-02/P1-03: анкета — контакты, груз-rest и маршрут-колонки.
    rawContact: RawContactSchema.optional(),
    cargoInfo: CargoInfoSchema.optional(),
    route: RouteFieldsSchema.optional(),
    // DF-17: условие поставки кодом (null = очистить)
    incotermCode: z.string().trim().max(10).transform((v) => v.toUpperCase()).nullable().optional(),
  })
  .refine(
    (d) =>
      d.status !== undefined ||
      d.assignedToId !== undefined ||
      d.rawContact !== undefined ||
      d.cargoInfo !== undefined ||
      d.route !== undefined ||
      d.incotermCode !== undefined,
    {
      message: 'Нечего обновлять: укажите статус, assignedToId, rawContact, cargoInfo, route или incotermCode',
    }
  )
export type PatchLeadInput = z.infer<typeof PatchLeadSchema>

// ─── Конвертация лида в заявку (В4) ─────────────────────────────────
//
// Тело запроса: юрлицо — ОБЯЗАТЕЛЬНЫЙ осознанный выбор менеджера на
// старте сделки (роадмап 8.2: договор создаётся на пару клиент+юрлицо);
// Инкотермс и ТН ВЭД — опциональные справочные поля заявки (роадмап,
// раздел 4/6). Лимиты и необязательность зеркалят POST /api/admin/orders
// (Б3): конвертация не должна быть строже ручного создания той же заявки.
export const ConvertLeadSchema = z.object({
  legalEntityId: z.string().min(1, 'Выберите юрлицо'),
  // DF-17: условие поставки кодом из справочника; легаси-ключ incoterm
  // принимается (старые клиенты/скрипты) — при обоих приоритет у кода.
  incoterm: z.string().trim().max(10).optional().nullable(),
  incotermCode: z
    .string()
    .trim()
    .max(10)
    .transform((v) => v.toUpperCase())
    .optional()
    .nullable(),
  hsCode: z.string().trim().max(20).optional().nullable(),
})
export type ConvertLeadInput = z.infer<typeof ConvertLeadSchema>

// ─── Варианты расчёта (В3) ──────────────────────────────────────────

// Ориентир варианта: под какой приоритет клиента этот вариант заточен
// (роадмап: «на какой приоритет клиента ориентирован»).
export const QUOTE_PRIORITY_FITS = ['speed', 'cost', 'safety'] as const
export type QuotePriorityFit = (typeof QUOTE_PRIORITY_FITS)[number]

export const QUOTE_PRIORITY_FIT_LABELS: Record<QuotePriorityFit, string> = {
  speed: 'Скорость',
  cost: 'Цена',
  safety: 'Надёжность',
}

// Виды транспорта в варианте — свободный список непустых строк («Авто»,
// «ЖД», «Море», «Авиа», «Мультимодальный»…). Закрытый справочник видов
// транспорта — тема Дорожки Г (справочники); на этапе воронки фиксировать
// его рано (роадмап сознательно держит transportModes как Json).
export const TransportModesSchema = z
  .array(z.string().trim().min(1, 'Пустой вид транспорта'))
  .min(1, 'Укажите хотя бы один вид транспорта')

const QuoteOptionFieldsSchema = z.object({
  description: z.string().trim().min(1, 'Опишите вариант расчёта'),
  transportModes: TransportModesSchema.optional(),
  // P1-04 (RULES 2.15, D19): цена клиенту + валюта + метка НДС;
  // себестоимость (costEstimate) — отдельное поле, наружу не выходит.
  // Все деньги — Decimal(14,2) в БД, до 2 знаков после запятой в API.
  price: moneyAmount('Цена'),
  currency: currencyCodeSchema.default('RUB'),
  vatMode: z.enum(VAT_MODES).default('WITHOUT_VAT'),
  costEstimate: moneyAmount('Себестоимость').nullable().optional(),
  costCurrency: currencyCodeSchema.default('RUB'),
  etaDays: z.number().int('Срок — целое число дней').positive('Срок должен быть больше нуля (дней)'),
  priorityFit: z.enum(QUOTE_PRIORITY_FITS, {
    errorMap: () => ({ message: 'Неизвестный ориентир варианта (speed | cost | safety)' }),
  }),
  isSelected: z.boolean().optional(),
})

export const CreateQuoteOptionSchema = QuoteOptionFieldsSchema
export type CreateQuoteOptionInput = z.infer<typeof CreateQuoteOptionSchema>

// PATCH варианта: любое подмножество полей, но не пустое. Инвариант
// «isSelected ровно один на лид» — не в схеме, а в роуте В3: снятие
// отметки с прежнего варианта — кросс-записная операция, zod её не видит.
export const UpdateQuoteOptionSchema = QuoteOptionFieldsSchema.partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Пустое обновление: укажите хотя бы одно поле варианта',
  })
export type UpdateQuoteOptionInput = z.infer<typeof UpdateQuoteOptionSchema>

// ─── Снимок условий сделки (Ж1) ─────────────────────────────────────
//
// Order.quoteSnapshot — копия выбранного варианта на момент конвертации
// (описание, виды транспорта, цена, срок, ориентир). Тот же состав
// полей, что QuoteOption, но без id/isSelected: после конвертации
// заявка — источник правды и живёт своей жизнью. Для ручных заявок
// (без лида) снимок заполняется PATCH'ем постепенно, поэтому все поля
// опциональны; валидация значений — как у варианта. null на верхнем
// уровне = «снять условия» (PATCH-семантика полной замены).
export const QuoteSnapshotSchema = z
  .object({
    description: z.string().trim().min(1, 'Опишите условия').optional(),
    transportModes: TransportModesSchema.nullable().optional(),
    // P1-04: цена с валютой и меткой НДС (cost в снимок не попадает —
    // заявка и её проекции наружу себестоимость не показывают).
    price: moneyAmount('Стоимость').optional(),
    currency: currencyCodeSchema.optional(),
    vatMode: z.enum(VAT_MODES).optional(),
    etaDays: z.number().int('Срок — целое число дней').positive('Срок должен быть больше нуля (дней)').optional(),
    priorityFit: z.enum(QUOTE_PRIORITY_FITS, {
      errorMap: () => ({ message: 'Неизвестный ориентир (speed | cost | safety)' }),
    }).optional(),
  })
  .nullable()
export type QuoteSnapshotInput = z.infer<typeof QuoteSnapshotSchema>
