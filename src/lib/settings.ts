import { Prisma } from '@prisma/client'
import { db } from './db'
import { type ActivityActor } from '@/lib/activity'
import { SettingValidationError, asEventCodeList, asInt, asNonEmptyStr, asOneOf, asOptionalEmail, asOptionalStr, asStringList, asTime, asTimeList, asTimezone } from './settings-validators'

// Единая поверхность импорта модуля настроек: потребители (API Блока 4,
// DF-03/DF-08/DF-11) берут всё из settings.ts, внутренности валидаторов
// наружу не тянут.
export { SettingValidationError }

// ─── DF-00D «Настройки системы»: реестр + get/set (D32, инвариант 9) ─
// Бизнес-параметры (окна рассылок, лимиты, пороги, подписи) живут в
// реестре SETTINGS и таблице Setting, а не литералами в коде: владелец
// меняет их на экране /admin/settings без выката. Правило выбора места:
// секрет/адрес инфраструктуры → env; бизнес-параметр → настройка;
// перечень, с которым связана логика, → реестр в коде.
// Валидаторы значений — settings-validators.ts (лимит 300 строк).
// Файл серверный (тянет db) — импорт из клиентских компонентов запрещён.

// ─── Группы экрана настроек ──────────────────────────────────────────

export const SETTING_GROUPS = [
  'notifications',
  'owner_digest',
  'waiting',
  'permits',
  'broker',
  'files',
  'brand',
  'email',
] as const
export type SettingGroup = (typeof SETTING_GROUPS)[number]

export const SETTING_GROUP_LABELS: Record<SettingGroup, string> = {
  notifications: 'Рассылки',
  owner_digest: 'Сводка владельцу',
  waiting: 'Ожидания',
  permits: 'Разрешительные документы',
  broker: 'Брокеры',
  files: 'Файлы',
  brand: 'Бренд',
  email: 'Почта',
}

// ─── Описание настройки ──────────────────────────────────────────────

// value — Json: форма зависит от типа; структуру знает реестр, БД не
// проверяет (валидация — TS-уровень, инвариант хелпера).
export type SettingValue = string | number | string[]

// type — рендер поля на экране настроек: время, список времён, число,
// короткий текст, многострочный текст, список строк.
export type SettingType = 'time' | 'time_list' | 'number' | 'string' | 'text' | 'string_list'

export type SettingDef<K extends string = string, T extends SettingValue = SettingValue> = {
  readonly key: K
  readonly group: SettingGroup
  readonly uiType: SettingType
  // Подпись и подсказка экрана; непусты — проверяет settings.test.ts.
  readonly label: string
  readonly hint: string
  readonly defaultValue: T
  // Валидатор: нормализует значение или бросает SettingValidationError.
  readonly validate: (v: unknown) => T
}

// Сохранение генериков defineSetting: ключ остаётся литералом → типы
// SettingKey/SettingsValues выводятся из реестра компилятором.
function defineSetting<K extends string, T extends SettingValue>(def: SettingDef<K, T>): SettingDef<K, T> {
  return def
}

// ─── Реестр SETTINGS — стартовый набор карточки DF-00D ───────────────

export const SETTINGS = [
  defineSetting({
    key: 'notifications.client_digest_times', group: 'notifications', uiType: 'time_list',
    label: 'Часы обычных рассылок',
    hint: 'Окна обычных писем клиенту и брокеру (§8). Согласование и «красные» уходят сразу, вне окон.',
    defaultValue: ['09:00', '16:00'], validate: (v) => asTimeList(v),
  }),
  defineSetting({
    key: 'notifications.timezone', group: 'notifications', uiType: 'string',
    label: 'Часовой пояс рассылок',
    hint: 'IANA-имя: в этом поясе считаются окна рассылок и сутки лимитов.',
    defaultValue: 'Europe/Moscow', validate: (v) => asTimezone(v),
  }),
  defineSetting({
    key: 'notifications.max_regular_per_day', group: 'notifications', uiType: 'number',
    label: 'Обычных писем в сутки участнику',
    hint: 'Потолок на участника; по умолчанию равен числу окон.',
    defaultValue: 2, validate: (v) => asInt(v, 1, 10),
  }),
  defineSetting({
    key: 'notifications.immediate_phases', group: 'notifications', uiType: 'string_list',
    label: 'Фазы мгновенных писем',
    hint: 'Сделки в этих фазах получают письма сразу, без сбора в окна (стадия согласования).',
    defaultValue: ['запрос', 'расчёт', 'подтверждение'], validate: (v) => asStringList(v, 0, 10, 50),
  }),
  defineSetting({
    key: 'notifications.red_event_types', group: 'notifications', uiType: 'string_list',
    label: '«Красные» события',
    hint: 'Коды из реестра событий: письма по ним уходят сразу и вне лимитов. Пополнят DF-05/DF-16.',
    defaultValue: [], validate: (v) => asEventCodeList(v),
  }),
  defineSetting({
    key: 'notifications.red_max_per_hour', group: 'notifications', uiType: 'number',
    label: '«Красных» писем в час участнику',
    hint: 'Антишторм: больше этого числа красных писем в час не отправляется.',
    defaultValue: 5, validate: (v) => asInt(v, 1, 60),
  }),
  defineSetting({
    key: 'notifications.staff_mode', group: 'notifications', uiType: 'string',
    label: 'Режим писем сотрудникам',
    hint: 'immediate — сразу; digest — собирать в окна. Транспорт сотрудников уточняет DF-03.',
    defaultValue: 'immediate', validate: (v) => asOneOf(v, ['immediate', 'digest']),
  }),
  defineSetting({
    key: 'notifications.red_subject_prefix', group: 'notifications', uiType: 'string',
    label: 'Префикс темы «красных» писем',
    hint: 'Тема красного письма начинается с этого префикса (DF-03). Пусто — без префикса.',
    defaultValue: 'Срочно:', validate: (v) => asOptionalStr(v, 50),
  }),
  defineSetting({
    key: 'owner_digest.window_start', group: 'owner_digest', uiType: 'time',
    label: 'Начало окна сводки владельцу',
    hint: 'Сводка отправляется внутри окна (O-6: 09:00–10:00 по Москве).',
    defaultValue: '09:00', validate: (v) => asTime(v),
  }),
  defineSetting({
    key: 'owner_digest.window_end', group: 'owner_digest', uiType: 'time',
    label: 'Конец окна сводки владельцу',
    hint: 'Должно быть позже начала окна; сверяют экран и диспетчер DF-08.',
    defaultValue: '10:00', validate: (v) => asTime(v),
  }),
  defineSetting({
    key: 'waiting.attention_hours', group: 'waiting', uiType: 'number',
    label: 'Порог «ждёт дольше», часов',
    hint: 'Часы ожидания, после которых сделка попадает в «ждут дольше суток» (Г4).',
    defaultValue: 24, validate: (v) => asInt(v, 1, 168),
  }),
  defineSetting({
    key: 'permits.red_days_before', group: 'permits', uiType: 'number',
    label: 'Красная подсветка за N дней до срока',
    hint: 'Разрешительный документ со сроком ближе N дней — красный (D35, DF-16). 0 — в день срока.',
    defaultValue: 3, validate: (v) => asInt(v, 0, 30),
  }),
  defineSetting({
    key: 'permits.remind_every_days', group: 'permits', uiType: 'number',
    label: 'Период напоминаний, дней',
    hint: 'Раз в N дней напоминание об ожидаемом разрешительном документе (DF-16).',
    defaultValue: 2, validate: (v) => asInt(v, 1, 30),
  }),
  defineSetting({
    key: 'broker.max_items', group: 'broker', uiType: 'number',
    label: 'Строк в ответе брокера, максимум',
    hint: 'Потолок строк кодов ТН ВЭД в одном ответе брокера (DF-18, D38).',
    defaultValue: 30, validate: (v) => asInt(v, 1, 100),
  }),
  defineSetting({
    key: 'files.max_mb', group: 'files', uiType: 'number',
    label: 'Максимальный размер файла, МБ',
    hint: 'Лимит загрузки одного файла (DF-11). Действующий лимит документов 4 МБ переносится при касании.',
    defaultValue: 25, validate: (v) => asInt(v, 1, 200),
  }),
  defineSetting({
    key: 'brand.name', group: 'brand', uiType: 'string',
    label: 'Название компании',
    hint: 'Подставляется в письма и интерфейс вместо литерала (IC-10 разрешает литерал здесь).',
    defaultValue: 'Logix', validate: (v) => asNonEmptyStr(v, 100),
  }),
  defineSetting({
    key: 'brand.signature', group: 'brand', uiType: 'text',
    label: 'Подпись в письмах',
    hint: 'Дополнение к подписи: имя, телефон, сайт. Пусто — только название из brand.name.',
    defaultValue: '', validate: (v) => asOptionalStr(v, 500),
  }),
  defineSetting({
    key: 'email.from_name', group: 'email', uiType: 'string',
    label: 'Имя отправителя писем',
    hint: '«От кого» в письмах. Домен и ключ почты — переменные окружения, не настройка (D32).',
    defaultValue: 'Logix', validate: (v) => asNonEmptyStr(v, 100),
  }),
  defineSetting({
    key: 'email.reply_to', group: 'email', uiType: 'string',
    label: 'Адрес для ответов (Reply-To)',
    hint: 'Пусто — ответы идут на адрес отправителя.',
    defaultValue: '', validate: (v) => asOptionalEmail(v),
  }),
]

export type SettingKey = (typeof SETTINGS)[number]['key']
// Ключ → тип значения: getSetting/setSetting типизированы по реестру,
// потребитель (DF-03/DF-08/DF-11) не кастует вручную.
export type SettingsValues = { [D in (typeof SETTINGS)[number] as D['key']]: D['defaultValue'] }

const SETTING_BY_KEY = new Map<string, SettingDef>(SETTINGS.map((d) => [d.key, d]))

// Свободные ключи не допускаются: пишем только то, что знает экран
// и что согласовано карточкой (инвариант 9, модель Setting).
export function getSettingDef(key: string): SettingDef {
  const def = SETTING_BY_KEY.get(key)
  if (!def) throw new SettingValidationError(`Неизвестная настройка «${key}» — свободные ключи не допускаются`)
  return def
}

// ─── Чтение с кэшем ≤ 60 с и откатом на дефолт ───────────────────────

// Технический параметр чтения, не бизнес-параметр: регулирует свежесть
// кэша, не поведение сделки; поэтому константой, а не настройкой (D32).
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { value: SettingValue; expiresAt: number }>()

// Сброс кэша: тесты и административные операции (после массовых правок).
export function clearSettingsCache(): void {
  cache.clear()
}

// Пустая таблица легитимна: откат на значение по умолчанию — система
// работает до первого изменения владельцем (карточка DF-00D).
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsValues[K]> {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as SettingsValues[K]
  const row = await db.setting.findUnique({ where: { key } })
  const value = (row ? row.value : getSettingDef(key).defaultValue) as SettingsValues[K]
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

// ─── Запись: валидатор + событие setting_changed (emitEvent) ─────────

function actorName(a: ActivityActor): string {
  return a.type === 'system' ? 'Система' : a.name
}

// Значение из БД приходит как JsonValue (может миновать типы реестра)
// — форматируем устойчиво к любой форме.
function formatValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((s) => `«${String(s)}»`).join(', ')}]`
  if (typeof v === 'string' || typeof v === 'number') return `«${String(v)}»`
  return `«${JSON.stringify(v)}»`
}

// Актёр — тот, кто сохранил (мастер; API Блока 4 передаёт employeeActor).
// tx по умолчанию db: изменение настройки + событие — одна транзакция
// (инвариант 2), роут Блока 4 передаст tx из $transaction.
export async function setSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  actor: ActivityActor,
  tx: Prisma.TransactionClient = db,
): Promise<SettingsValues[K]> {
  const def = getSettingDef(key)
  const parsed = def.validate(value)
  const prev = await tx.setting.findUnique({ where: { key } })
  const oldValue = prev ? prev.value : def.defaultValue
  // Сохранение того же значения — no-op: сравниваем с ЭФФЕКТИВНЫМ
  // значением (строка, а без неё — дефолт), чтобы не плодить строку
  // и событие без фактического изменения.
  if (JSON.stringify(oldValue) === JSON.stringify(parsed)) {
    return parsed as SettingsValues[K]
  }
  const updatedBy = actorName(actor)
  await tx.setting.upsert({
    where: { key },
    create: { key, value: parsed as Prisma.InputJsonValue, updatedByName: updatedBy },
    update: { value: parsed as Prisma.InputJsonValue, updatedByName: updatedBy },
  })
  // Кэш сбрасываем сразу: getSetting после setSetting в том же запросе
  // обязан видеть новое значение, не дожидаясь TTL.
  cache.delete(key)
  // Динамический импорт emitEvent (v0.6.5): events → enqueue → rules →
  // settings — статическое ребро settings → events замыкало бы цикл.
  const { emitEvent } = await import('./events')
  await emitEvent(tx, {
    target: null, // глобальное событие: настройка не belongs сделке (DF-00D)
    actor,
    type: 'setting_changed',
    description: `${key}: ${formatValue(oldValue)} → ${formatValue(parsed)}`,
  })
  return parsed as SettingsValues[K]
}

// «Сбросить» на экране настроек: строка удаляется, getSetting возвращается
// к дефолту. Сброс отсутствующей строки — no-op без события.
export async function resetSetting<K extends SettingKey>(
  key: K,
  actor: ActivityActor,
  tx: Prisma.TransactionClient = db,
): Promise<void> {
  const def = getSettingDef(key)
  const prev = await tx.setting.findUnique({ where: { key } })
  if (!prev) return
  await tx.setting.delete({ where: { key } })
  cache.delete(key)
  const { emitEvent } = await import('./events')
  await emitEvent(tx, {
    target: null,
    actor,
    type: 'setting_changed',
    description: `${key}: ${formatValue(prev.value)} → значение по умолчанию ${formatValue(def.defaultValue)}`,
  })
}
