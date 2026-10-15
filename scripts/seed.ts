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
 * аналог admin123 из истории APEX Moto). Локальный режим — SQLite-
 * файл в DATABASE_URL (file:...) или флаг --dev — там значения
 * по умолчанию разрешены.
 */

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

// ── Мини-загрузчик .env (без зависимости от dotenv): Prisma Client
//    сам грузит .env, но при запуске через tsx без переменных окружения
//    этот фолбэк гарантирует, что DATABASE_URL найдётся. ─────────────
import { readFileSync } from 'fs'
import { join } from 'path'

function loadEnvFallback(): void {
  for (const candidate of [join(process.cwd(), '.env'), join(process.cwd(), 'prisma', '.env')]) {
    try {
      const text = readFileSync(candidate, 'utf-8')
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
      }
    } catch {
      /* файла нет — пропускаем */
    }
  }
}
loadEnvFallback()

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
// Локальный режим = явный флаг --dev ИЛИ SQLite-файл в DATABASE_URL
// (префикс file:). Всё остальное (PostgreSQL и любые другие
// провайдеры) — «боевой» режим: сид требует MASTER_PHONE и
// MASTER_PASSWORD, иначе отказ до первого запроса к БД.
function isLocalMode(): boolean {
  if (process.argv.includes('--dev')) return true
  return (process.env.DATABASE_URL ?? '').startsWith('file:')
}

// Проверка выполняется до первого запроса к БД: отказ быстрый и
// без подключения. Сообщение перечисляет, чего именно не хватает,
// и показывает, как задать; сама строка подключения не логируется
// (урок /api/debug-env из APEX Moto — URL содержит секреты).
function assertMasterCredentials(): void {
  if (isLocalMode()) return
  const missing: string[] = []
  if (!process.env.MASTER_PHONE) missing.push('MASTER_PHONE')
  if (!process.env.MASTER_PASSWORD) missing.push('MASTER_PASSWORD')
  if (missing.length === 0) return
  console.error(
    [
      'Seed Logix: ОТКАЗ — бой не на пароле по умолчанию (З1).',
      '',
      `Не задано: ${missing.join(', ')}.`,
      'Пароль logix-master в не-локальной базе — дыра того же класса,',
      'что admin123: забыть одну переменную при посеве боевой базы =',
      'открытый вход. Сид останавливается ДО записи в БД.',
      '',
      'Что задать перед запуском (нужны ОБА значения):',
      '  MASTER_PHONE="+79001234567" MASTER_PASSWORD="<сильный пароль>" bun run seed',
      '',
      'Локальный режим (значения по умолчанию разрешены):',
      '  - SQLite в DATABASE_URL: file:./db/custom.db (или другой file:...);',
      '  - флаг --dev для не-file базы — только для разработки, не для прода.',
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
  console.log(`  + Мастер-учётка: ${phone} / пароль: ${password}`)
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

async function main(): Promise<void> {
  assertMasterCredentials()
  console.log('Seed Logix:')
  await seedEmployee()
  await seedStageCatalog()
  await seedLegalEntity()
  console.log('Готово.')
}

main()
  .catch((e) => {
    console.error('Seed упал:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
