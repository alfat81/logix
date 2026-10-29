/**
 * Seed для Logix — первый запуск (А5 + Б2).
 *
 * Создаёт идемпотентно (повторный запуск ничего не ломает):
 *  1. Мастер-учётку сотрудника (roles: ["master"]) — А5;
 *  2. Каталог этапов: 6 обязательных + 2 необязательных примера — Б2;
 *  3. Одно наше юрлицо-образец (можно переименовать/добавить свои).
 *
 * Запуск: bun run seed  (или npx tsx scripts/seed.ts)
 *
 * З1 (безопасность): против НЕ-локальной базы (PostgreSQL и др.) сид
 * ОТКАЗЫВАЕТСЯ создавать мастера, если не заданы MASTER_PHONE и
 * MASTER_PASSWORD, — пароль по умолчанию в бою недопустим (прямой
 * аналог admin123 из истории предыдущего проекта). Режим --dev
 * разрешён только при локальном DATABASE_URL (localhost/127.0.0.1) —
 * там значения по умолчанию допустимы.
 */

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

// ── DF-17: данные справочников (IC-16: единственный импортёр — сид) ──
import { ISO_3166_1, RU_NAME_OVERRIDES } from './ref-data/countries'
import { CURRENCY_ITEMS } from './ref-data/currencies'
import { PACKAGING_ITEMS } from './ref-data/packaging'
import { INCOTERM_ITEMS } from './ref-data/incoterms'
// ── DF-19: шкала таможенных сборов (IC-16: единственный импортёр — сид) ──
import { CUSTOMS_FEE_SCALE_EDITIONS } from './ref-data/customs-fees'

// ── Мини-загрузчик .env — вынесен в scripts/env-fallback.ts (общий
//    для скриптов: seed и import-hs, reuse-first 2.13) ────────────────
import './env-fallback'

const prisma = new PrismaClient()

// Тот же scrypt-формат, что src/lib/password.ts (скопирован сюда,
// чтобы сид не тянул ts-модули приложения через @/ — scripts/ вне
// компиляции Next, путь через относительный import хрупок при
// переносе; формат задокументирован и стабилен).
const KEY_LENGTH = 64
const SALT_LENGTH = 16
function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `scrypt:${salt}:${hash}`
}

// ── З1: локальный режим и защита боевой базы от пароля по умолчанию ──
// DF-00: SQLite (file:) убран полностью. Режим разработки (--dev) разрешён
// ТОЛЬКО если хост базы данных — localhost или 127.0.0.1. Всё остальное —
// боевой режим: сид требует MASTER_PHONE и MASTER_PASSWORD.
function isLocalMode(): boolean {
  if (!process.argv.includes('--dev')) return false
  const url = process.env.DATABASE_URL ?? ''
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

// Проверка выполняется до первого запроса к БД: отказ быстрый и
// без подключения. Сообщение перечисляет, чего именно не хватает,
// и показывает, как задать; сама строка подключения не логируется
// (урок debug-env из предыдущего проекта — URL содержит секреты).
//
// fix1: кроме пустых значений отвергаются ПЛЕЙСХОЛДЕРЫ из скопированных
// команд (урок 30.10: в боевую базу создалась мастер-учётка с телефоном
// «+7XXXXXXXXXX» и паролем из переписки — значения были непустыми и
// гард их пропустил). Телефон — строгий формат, пароль — признаки
// шаблона; примеры в подсказке сами гард не проходят — чтобы копипаст
// шаблона не мог создать учётку.
function placeholderProblem(phone: string, password: string): string | null {
  if (!/^\+\d{7,15}$/.test(phone.trim())) {
    return `MASTER_PHONE не похож на телефон («${phone.trim()}»): нужен формат +79001234567 — плюс и цифры, без букв, X и скобок.`
  }
  // Точные совпадения-шаблоны и явные признаки (скобки, xxx, «заменя…»).
  // Подстроки вроде 'password' НЕ проверяем: одноразовый пароль CI
  // «ci-e2e-master-password» — легитимный, гард не должен ломать CI.
  const s = password.trim()
  const weakExact = [
    'password',
    'пароль',
    'changeme',
    'placeholder',
    'example',
    'сильный пароль',
    'надёжный_пароль',
    'надёжный пароль',
  ]
  const weak = /[<>]/.test(s) || /x{3,}/i.test(s) || /заменя/i.test(s) || weakExact.includes(s.toLowerCase())
  if (weak) {
    return 'MASTER_PASSWORD выглядит как плейсхолдер из шаблона команды — задайте настоящий сильный пароль (при существующем мастере он всё равно не используется, но должен быть непустым и правдоподобным).'
  }
  return null
}

function assertMasterCredentials(): void {
  if (isLocalMode()) return
  const missing: string[] = []
  if (!process.env.MASTER_PHONE) missing.push('MASTER_PHONE')
  if (!process.env.MASTER_PASSWORD) missing.push('MASTER_PASSWORD')
  if (missing.length === 0) {
    const problem = placeholderProblem(process.env.MASTER_PHONE!, process.env.MASTER_PASSWORD!)
    if (problem) {
      console.error(
        [
          'Seed Logix: ОТКАЗ — в переменные попал шаблон, а не настоящее значение (З1 / DF-00).',
          '',
          problem,
          'Сид останавливается ДО записи в БД: шаблонные учётки в боевой базе —',
          'открытый вход (инцидент 30.10: мастер «+7XXXXXXXXXX»).',
          '',
          'Подставьте свои значения ЦЕЛИКОМ (телефон существующего мастера —',
          'сид не меняет пароль существующей учётки):',
          '  bash:       MASTER_PHONE="+79001234567" MASTER_PASSWORD="надёжный_пароль" bun run seed',
          '  PowerShell: $env:MASTER_PHONE = "+79001234567"; $env:MASTER_PASSWORD = "надёжный_пароль"; bun run seed',
          '',
          'Локальный режим (значения по умолчанию разрешены):',
          '  - флаг --dev только при подключении к localhost или 127.0.0.1.',
        ].join('\n'),
      )
      process.exit(1)
    }
    return
  }
  console.error(
    [
      'Seed Logix: ОТКАЗ — бой не на пароле по умолчанию (З1 / DF-00).',
      '',
      `Не задано: ${missing.join(', ')}.`,
      'Пароль logix-master в не-локальной базе — дыра того же класса,',
      'что admin123: забыть одну переменную при посеве боевой базы =',
      'открытый вход. Сид останавливается ДО записи в БД.',
      '',
      'Что задать перед запуском (нужны ОБА значения):',
      '  bash:       MASTER_PHONE="+79001234567" MASTER_PASSWORD="надёжный_пароль" bun run seed',
      '  PowerShell: $env:MASTER_PHONE = "+79001234567"; $env:MASTER_PASSWORD = "надёжный_пароль"; bun run seed',
      '',
      'Локальный режим (значения по умолчанию разрешены):',
      '  - флаг --dev только при подключении к localhost или 127.0.0.1.',
    ].join('\n'),
  )
  process.exit(1)
}

async function seedEmployee(): Promise<void> {
  const phone = process.env.MASTER_PHONE ?? '+79000000000'
  const password = process.env.MASTER_PASSWORD ?? 'logix-master'
  const existing = await prisma.employee.findUnique({ where: { phone } })
  if (existing) {
    console.log(`  = Сотрудник-мастер уже есть: ${existing.name} (${phone})`)
    return
  }
  await prisma.employee.create({
    data: {
      name: 'Мастер Logix',
      phone,
      password: hashPassword(password),
      roles: '["master"]',
    },
  })
  // Пароль в лог не печатаем: логи CI и Vercel видят посторонние
  console.log(`  + Мастер-учётка: ${phone} (пароль — из MASTER_PASSWORD или локальный по умолчанию)`)
  if (!process.env.MASTER_PASSWORD) {
    console.log('    (локальный режим: пароль по умолчанию; против не-локальной базы сид требует MASTER_PHONE + MASTER_PASSWORD — З1)')
  }
}

// Каталог этапов (Б2): обязательное ядро — 6 этапов, которые нельзя
// исключить из заявки (роадмап, раздел 3), + 2 необязательных примера,
// чтобы флоу "менеджер добавляет сверху" было живым с первого дня.
const STAGE_CATALOG: Array<{ code: string; name: string; order: number; isMandatory: boolean }> = [
  { code: 'export_pickup',    name: 'Забор груза у отправителя',    order: 1, isMandatory: true },
  { code: 'export_customs',   name: 'Экспортное таможенное оформление', order: 2, isMandatory: true },
  { code: 'loading',          name: 'Погрузка на транспорт',       order: 3, isMandatory: true },
  { code: 'transport',        name: 'Международная перевозка',     order: 4, isMandatory: true },
  { code: 'import_customs',   name: 'Импортное таможенное оформление', order: 5, isMandatory: true },
  { code: 'final_delivery',   name: 'Доставка до получателя',      order: 6, isMandatory: true },
  { code: 'warehouse_storage', name: 'Складское хранение',         order: 10, isMandatory: false },
  { code: 'cargo_insurance',  name: 'Страхование груза',           order: 11, isMandatory: false },
]

async function seedStageCatalog(): Promise<void> {
  for (const stage of STAGE_CATALOG) {
    await prisma.orderStageCatalog.upsert({
      where: { code: stage.code },
      create: stage,
      update: { name: stage.name, order: stage.order, isMandatory: stage.isMandatory },
    })
  }
  console.log(`  = Каталог этапов: ${STAGE_CATALOG.length} записей (6 обязательных + примеры) — актуализирован`)
}

async function seedLegalEntity(): Promise<void> {
  const existing = await prisma.legalEntity.findFirst()
  if (existing) {
    console.log(`  = Юрлицо уже есть: ${existing.name}`)
    return
  }
  await prisma.legalEntity.create({
    data: {
      name: 'ООО «Логикс»',
      // Заготовка реквизитов под печатные формы — заполняется при
      // документогенерации (роадмап, раздел 4), структура не финальная.
      requisites: {
        inn: '0000000000',
        address: '— заполнить реквизиты —',
        note: 'образец, создан сидом',
      },
    },
  })
  console.log('  + Юрлицо-образец: ООО «Логикс» (реквизиты заполнить)')
}

// ── DF-17: справочники (страны, валюты, упаковка, Инкотермс) ─────────
// Данные — scripts/ref-data/* (IC-16: перечней в логике/UI нет; эти
// файлы импортирует ТОЛЬКО этот сид). Идемпотентно: upsert по
// (dir, code).
//
// Политика пересида: name/nameEn/isActive НЕ перезаписываются — их
// владелец мастер (правки подписей и включённости через экран
// /admin/references переживают пересид; Intl-имена стран фиксируются
// при создании). Обновляются только структурные данные из источника:
// meta (alpha3/числовой код страны, minorUnits валюты, флаги правил
// Инкотермс) и sortOrder. Новые записи источника доезжают при
// следующем сиде; создаются с активностью из данных (DAT — неактивен).
async function seedReferences(): Promise<void> {
  const ruNames = new Intl.DisplayNames(['ru'], { type: 'region' })
  const enNames = new Intl.DisplayNames(['en'], { type: 'region' })

  type Row = {
    dir: string
    code: string
    name: string
    nameEn: string | null
    meta: unknown
    isActive: boolean
    sortOrder: number
  }
  const rows: Row[] = []

  ISO_3166_1.forEach((raw, i) => {
    const [alpha2, alpha3, numeric] = raw.split('|')
    rows.push({
      dir: 'country',
      code: alpha2,
      // Русское название: Intl.DisplayNames, терминология ВЭД — через
      // overrides (карточка DF-17); правится мастером на экране.
      name: RU_NAME_OVERRIDES[alpha2] ?? ruNames.of(alpha2) ?? alpha2,
      nameEn: enNames.of(alpha2),
      meta: { alpha3, numeric },
      isActive: true,
      sortOrder: i,
    })
  })

  CURRENCY_ITEMS.forEach((c, i) => {
    rows.push({
      dir: 'currency',
      code: c.code,
      name: c.name,
      nameEn: c.nameEn,
      meta: { minorUnits: c.minorUnits },
      isActive: c.active,
      sortOrder: i,
    })
  })

  PACKAGING_ITEMS.forEach((p, i) => {
    rows.push({ dir: 'packaging', code: p.code, name: p.name, nameEn: p.nameEn, meta: null, isActive: true, sortOrder: i })
  })

  INCOTERM_ITEMS.forEach((t, i) => {
    rows.push({ dir: 'incoterm', code: t.code, name: t.name, nameEn: t.nameEn, meta: t.meta, isActive: t.active, sortOrder: i })
  })

  for (const r of rows) {
    await prisma.refItem.upsert({
      where: { dir_code: { dir: r.dir, code: r.code } },
      create: r,
      update: { meta: r.meta, sortOrder: r.sortOrder },
    })
  }
  const byDir = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.dir] = (acc[r.dir] ?? 0) + 1), acc), {})
  const parts = Object.entries(byDir)
    .map(([d, n]) => `${d}: ${n}`)
    .join(', ')
  console.log(`  = Справочники DF-17 актуализированы (${parts}); name/isActive мастера не перезаписаны`)
}

// ── DF-19: шкала таможенных сборов (CustomsFeeScale) ─────────────────
// Редакции замещаются ЦЕЛИКОМ: при пересиде строки каждой validFrom
// удаляются и создаются заново из источника (правки подписей — не
// сценарий шкалы: сборы ставятся ПП, редакция = дата + полный список
// скобок; смена ПП — новая validFrom в ref-data + пересид).
async function seedCustomsFeeScale(): Promise<void> {
  const byEdition = new Map<string, typeof CUSTOMS_FEE_SCALE_EDITIONS>()
  for (const row of CUSTOMS_FEE_SCALE_EDITIONS) {
    const list = byEdition.get(row.validFrom) ?? []
    list.push(row)
    byEdition.set(row.validFrom, list)
  }
  let total = 0
  for (const [validFrom, rows] of byEdition) {
    const day = new Date(`${validFrom}T00:00:00.000Z`)
    await prisma.customsFeeScale.deleteMany({ where: { validFrom: day } })
    await prisma.customsFeeScale.createMany({
      data: rows.map((r) => ({
        validFrom: day,
        upperBound: r.upperBound,
        feeRub: r.feeRub,
        sortOrder: r.sortOrder,
      })),
    })
    total += rows.length
  }
  console.log(`  = Шкала таможенных сборов DF-19 актуализирована (строк: ${total}, редакций: ${byEdition.size})`)
}

async function main(): Promise<void> {
  assertMasterCredentials()
  console.log('Seed Logix:')
  await seedEmployee()
  await seedStageCatalog()
  await seedLegalEntity()
  await seedReferences()
  await seedCustomsFeeScale()
  console.log('Готово.')
}

main()
  .catch((e) => {
    console.error('Seed упал:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
