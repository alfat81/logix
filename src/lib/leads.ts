import { z } from 'zod'
import {
  parseRouteText,
  joinRouteText,
  RouteFieldsSchema,
  TRANSPORT_FORM_TO_CODE,
  TRANSPORT_TYPE_LABELS,
  type TransportTypeCode,
} from '@/lib/route-fields'

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
  // Маршрут (бланк п.3, 17, 20, 4, 18)
  transportType: string
  from: string
  to: string
  routeNote: string
  shipDate: string
  // Груз (бланк п.5–15)
  cargoName: string
  hsCode: string
  placesCount: string
  weightKg: string
  volumeM3: string
  packaging: string
  cargoValue: string
  dangerous: string
  stackable: string
  tiltable: string
  specialRequirements: string
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
  from: '',
  to: '',
  routeNote: '',
  shipDate: '',
  cargoName: '',
  hsCode: '',
  placesCount: '',
  weightKg: '',
  volumeM3: '',
  packaging: '',
  cargoValue: '',
  dangerous: '',
  stackable: '',
  tiltable: '',
  specialRequirements: '',
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
  from: 'Пункт отправления',
  to: 'Пункт прибытия',
  routeNote: 'Маршрут (подробно)',
  shipDate: 'Предв. дата отправления',
  cargoName: 'Наименование груза',
  hsCode: 'Код ТН ВЭД',
  placesCount: 'Количество мест',
  weightKg: 'Общий вес брутто, кг',
  volumeM3: 'Общий объём, м³',
  packaging: 'Тип упаковки',
  cargoValue: 'Стоимость груза',
  dangerous: 'Опасный груз',
  stackable: 'Штабелирование',
  tiltable: 'Кантование',
  specialRequirements: 'Особые требования',
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
  }
  cargo: Record<string, unknown> | null
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

  const origin = parseRouteText(form.from)
  const dest = parseRouteText(form.to)
  const shipDate = /^\d{4}-\d{2}-\d{2}$/.test(form.shipDate.trim())
    ? form.shipDate.trim()
    : null

  const route: LeadCargoPayload['route'] = {
    originCity: origin.city,
    originCountry: origin.country,
    destinationCity: dest.city,
    destinationCountry: dest.country,
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
  return { route, cargo: Object.keys(cargo).length > 1 ? cargo : null }
}

// Типизированное чтение cargoInfo в карточке: лиды со старой или
// чужой структурой Json не роняют UI (unknown-ключи показываются
// как есть, деградации нет).
export type LeadCargoData = Partial<Record<keyof LeadCargoForm, unknown>>

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
}): LeadCargoForm {
  const s = (v: unknown): string => (typeof v === 'string' ? v : '')
  const n = (v: unknown): string => {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return String(Number(v))
    return ''
  }
  const b = (v: unknown): string => (v === true ? 'yes' : v === false ? 'no' : '')
  const data: LeadCargoData = readLeadCargo(row.cargoInfo)

  // Маршрут: колонки (первичный источник), fallback — легаси Json
  const fromCols = joinRouteText(row.originCountry, row.originCity)
  const toCols = joinRouteText(row.destinationCountry, row.destinationCity)
  const legacy = data as Record<string, unknown>
  const from =
    fromCols || joinRouteText(null, s(data.from) || s(legacy.origin))
  const to = toCols || joinRouteText(null, s(data.to) || s(legacy.destination))

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
    from,
    to,
    routeNote: s(data.routeNote),
    shipDate,
    cargoName: s(data.cargoName),
    hsCode: s(data.hsCode),
    placesCount: n(row.placesCount),
    weightKg: n(row.weightKg),
    volumeM3: n(row.volumeM3),
    packaging: s(data.packaging),
    cargoValue: s(data.cargoValue),
    dangerous: b(data.dangerous),
    stackable: b(data.stackable),
    tiltable: b(data.tiltable),
    specialRequirements: s(data.specialRequirements),
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
        errorMap: () => ({ message: 'Неизвестный статус лида' }),
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
  })
  .refine(
    (d) =>
      d.status !== undefined ||
      d.assignedToId !== undefined ||
      d.rawContact !== undefined ||
      d.cargoInfo !== undefined ||
      d.route !== undefined,
    {
      message: 'Нечего обновлять: укажите статус, assignedToId, rawContact, cargoInfo или route',
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
  incoterm: z.string().trim().max(10).optional().nullable(),
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
  // Деньги — целые рубли, как customsDutyEstimate/priceEstimate в схеме:
  // копейки в B2B-расчётах не значатся, Int и в БД, и в API.
  priceEstimate: z
    .number()
    .int('Стоимость — целое число (руб.)')
    .positive('Стоимость должна быть больше нуля'),
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
    priceEstimate: z
      .number()
      .int('Стоимость — целое число (руб.)')
      .positive('Стоимость должна быть больше нуля')
      .optional(),
    etaDays: z.number().int('Срок — целое число дней').positive('Срок должен быть больше нуля (дней)').optional(),
    priorityFit: z.enum(QUOTE_PRIORITY_FITS, {
      errorMap: () => ({ message: 'Неизвестный ориентир (speed | cost | safety)' }),
    }).optional(),
  })
  .nullable()
export type QuoteSnapshotInput = z.infer<typeof QuoteSnapshotSchema>
