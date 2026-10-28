import { z } from 'zod'
import { refCodeField } from '@/lib/ref'

// ─── P1-03: маршрут и груз — поля, а не только JSON ─────────────────
// Коды типа перевозки, словарь подписей, разбор свободного текста
// «Страна, город» и zod-схема route-полей. Файл БЕЗ серверных
// зависимостей (db и т.п.): его импортируют API-роуты, lib-хелперы
// и UI (CargoGroups, формы, списки).

// Стабильные коды колонок (Prisma enum TransportType). Русские подписи
// формы (TRANSPORT_TYPES в lib/leads.ts) — поверх кодов: Json бланка
// уезжает в печатные формы как есть, колонки и фильтры — по кодам.
export const TRANSPORT_TYPE_CODES = ['auto', 'rail', 'sea', 'air', 'multimodal'] as const
export type TransportTypeCode = (typeof TRANSPORT_TYPE_CODES)[number]

export const TRANSPORT_TYPE_LABELS: Record<TransportTypeCode, string> = {
  auto: 'Авто',
  rail: 'ЖД',
  sea: 'Море',
  air: 'Авиа',
  multimodal: 'Мультимодальная',
}

// Форма бланка хранит русские подписи (TRANSPORT_TYPES); на колонки
// ложится код. Словарь tolerant: варианты словоформы «Мультимодальный»
// и латиница принимаются (легаси-данные писались руками).
export const TRANSPORT_FORM_TO_CODE: Record<string, TransportTypeCode> = {
  Авто: 'auto',
  авто: 'auto',
  ЖД: 'rail',
  жд: 'rail',
  Море: 'sea',
  море: 'sea',
  Авиа: 'air',
  авиа: 'air',
  'Мультимодальная': 'multimodal',
  'Мультимодальный': 'multimodal',
  'мультимодальная': 'multimodal',
  auto: 'auto',
  rail: 'rail',
  sea: 'sea',
  air: 'air',
  multimodal: 'multimodal',
}

// ── Разбор свободного «Страна, город» ───────────────────────────────
// Первая запятая — граница (подсказка формы: «Китай, Чэнду»); без
// запятой — весь текст считается городом (страна неизвестна). Тот же
// алгоритм в backfill-миграции P1_03 — менять синхронно.
export function parseRouteText(
  v: string | null | undefined
): { country: string | null; city: string | null } {
  const s = (v ?? '').trim()
  if (!s) return { country: null, city: null }
  const i = s.indexOf(',')
  if (i === -1) return { country: null, city: s }
  const country = s.slice(0, i).trim() || null
  const city = s.slice(i + 1).trim() || null
  return { country, city }
}

// Обратная сборка для показа/редактирования: «Страна, город» / «Город» /
// «Страна» / ''.
export function joinRouteText(country: unknown, city: unknown): string {
  const c = typeof country === 'string' ? country.trim() : ''
  const t = typeof city === 'string' ? city.trim() : ''
  if (c && t) return `${c}, ${t}`
  return t || c
}

// ── zod-схема route-полей (тела POST/PATCH) ─────────────────────────
// Все поля опциональны; null = очистить поле. readyDate — строго
// yyyy-mm-dd (дата-инпут формы). Вес/объём — положительные числа,
// места — целые. Пустой объект отвергается (молчаливый no-op без следа
// в журнале — анти-паттерн контракта лида/заявки).
export const RouteFieldsSchema = z
  .object({
    originCity: z.string().trim().max(120).nullable().optional(),
    originCountry: z.string().trim().max(120).nullable().optional(),
    destinationCity: z.string().trim().max(120).nullable().optional(),
    destinationCountry: z.string().trim().max(120).nullable().optional(),
    transportType: z.enum(TRANSPORT_TYPE_CODES).nullable().optional(),
    readyDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата — в формате ГГГГ-ММ-ДД')
      .nullable()
      .optional(),
    weightKg: z.number().positive('Вес должен быть больше нуля').nullable().optional(),
    volumeM3: z.number().positive('Объём должен быть больше нуля').nullable().optional(),
    placesCount: z
      .number()
      .int('Количество мест — целое число')
      .positive('Количество мест должно быть больше нуля')
      .nullable()
      .optional(),
    // DF-17: коды стран из справочника (Combobox, IC-16). Денимализацию
    // текстовых колонок (имя из справочника) делает API через ref-db —
    // клиент присылает ТОЛЬКО код, имя берётся из справочника на сервере
    // (принцип снимка: старые отображения/печать работают без join).
    originCountryCode: refCodeField('Страна отправления'),
    destinationCountryCode: refCodeField('Страна прибытия'),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Нечего обновлять: укажите хотя бы одно поле маршрута',
  })
export type RouteFieldsInput = z.infer<typeof RouteFieldsSchema>

// Готовность к отгрузке: строка yyyy-mm-dd → UTC-полночь (даты бланка —
// календарные, таймзона не должна сдвигать день — правило Ж5/P1-06).
// undefined = поле не трогаем, null = очистить.
export function readyDateInput(
  v: string | null | undefined
): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return new Date(`${v}T00:00:00.000Z`)
}

// RouteFieldsInput → данные для prisma create/update (readyDate — Date,
// undefined = поле не трогаем). Прямые свойства — без условных спредов
// (союз типов от спредов ломает вывод TS на больших data-объектах).
export function routeToDbColumns(
  r: RouteFieldsInput | undefined
):
  | {
      originCity?: string | null
      originCountry?: string | null
      destinationCity?: string | null
      destinationCountry?: string | null
      transportType?: TransportTypeCode | null
      readyDate?: Date | null
      weightKg?: number | null
      volumeM3?: number | null
      placesCount?: number | null
      originCountryCode?: string | null
      destinationCountryCode?: string | null
    }
  | undefined {
  if (!r) return undefined
  return {
    originCity: r.originCity,
    originCountry: r.originCountry,
    destinationCity: r.destinationCity,
    destinationCountry: r.destinationCountry,
    transportType: r.transportType,
    readyDate: readyDateInput(r.readyDate),
    weightKg: r.weightKg,
    volumeM3: r.volumeM3,
    placesCount: r.placesCount,
    originCountryCode: r.originCountryCode,
    destinationCountryCode: r.destinationCountryCode,
  }
}
