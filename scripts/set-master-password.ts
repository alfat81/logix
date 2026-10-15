/**
 * Смена пароля мастер-учётки Logix — З1-замет для баз, посеянных
 * до З1 (DEPLOY.md, раздел 4.1).
 *
 * Сид идемпотентен и НЕ обновляет пароль существующего мастера:
 * если база посеяна до З1 и мастер родился с logix-master, сид это
 * не лечит — пароль меняется этим скриптом.
 *
 * Запуск:
 *   MASTER_PHONE="+79000000000" MASTER_PASSWORD="<новый>" \
 *     DATABASE_URL="<direct-строка Neon>" bun run set-master
 *
 * MASTER_PHONE можно опустить: скрипт возьмёт единственного мастера
 * базы (roles содержит "master"); если мастеров несколько — откажется
 * и перечислит телефоны. MASTER_PASSWORD обязателен всегда: значений
 * по умолчанию у скрипта нет ни в одном режиме, включая локальный.
 */

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

// ── Мини-загрузчик .env — копия механизма scripts/seed.ts ──────────
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

// Тот же scrypt-формат, что scripts/seed.ts и src/lib/password.ts
// (формат задокументирован и стабилен).
const KEY_LENGTH = 64
const SALT_LENGTH = 16
function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = scryptSync(plain, salt, KEY_LENGTH).toString('hex')
  return `scrypt:${salt}:${hash}`
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// Поля, которые читаем/показываем: пароль не выбираем принципиально.
const MASTER_FIELDS = { id: true, name: true, phone: true, isActive: true } as const

type MasterRow = {
  id: string
  name: string
  phone: string
  isActive: boolean
}

function listMasters(): Promise<MasterRow[]> {
  // roles — JSON-строка вида '["master"]'; contains по подстроке
  // "master" не ловит "manager" — ложных совпадений на текущем
  // наборе ролей нет.
  return prisma.employee.findMany({
    where: { roles: { contains: 'master' } },
    select: MASTER_FIELDS,
  })
}

async function resolveTarget(): Promise<MasterRow> {
  const phone = process.env.MASTER_PHONE

  if (phone) {
    const byPhone = await prisma.employee.findUnique({
      where: { phone },
      select: MASTER_FIELDS,
    })
    if (byPhone) return byPhone

    const masters = await listMasters()
    const hint =
      masters.length === 0
        ? 'Мастеров в базе нет вообще — сначала bun run seed (DEPLOY.md, раздел 4.1).'
        : `Мастера в базе: ${masters.map((m) => m.phone).join(', ')}.`
    fail(`Сотрудника с телефоном ${phone} нет. ${hint}`)
  }

  const masters = await listMasters()
  if (masters.length === 0) {
    fail('Мастеров в базе нет — сначала bun run seed (DEPLOY.md, раздел 4.1).')
  }
  if (masters.length > 1) {
    fail(
      `Мастеров несколько: ${masters
        .map((m) => m.phone)
        .join(', ')} — укажите цель в MASTER_PHONE.`,
    )
  }
  return masters[0]
}

async function main(): Promise<void> {
  const password = process.env.MASTER_PASSWORD
  if (!password) {
    fail(
      [
        'set-master: ОТКАЗ — MASTER_PASSWORD не задан.',
        '',
        'У скрипта нет значений по умолчанию ни в одном режиме.',
        'Смена пароля мастера, рождённого с logix-master (база до З1):',
        '  MASTER_PHONE="+79000000000" MASTER_PASSWORD="$(openssl rand -base64 24)" bun run set-master',
      ].join('\n'),
    )
  }
  if (password === 'logix-master') {
    console.warn(
      'ВНИМАНИЕ: новый пароль совпадает со старым паролем по умолчанию (logix-master) — для боевой базы так нельзя.',
    )
  } else if (password.length < 12) {
    console.warn('ВНИМАНИЕ: пароль короче 12 символов — для боевой базы лучше длиннее.')
  }

  const target = await resolveTarget()

  await prisma.employee.update({
    where: { id: target.id },
    data: { password: hashPassword(password) },
  })

  const activeNote = target.isActive
    ? ''
    : ' ВНИМАНИЕ: аккаунт деактивирован (isActive=false) — вход не пройдёт, включите его.'
  console.log(`  = Пароль мастера обновлён: ${target.name} (${target.phone}).${activeNote}`)
  console.log('    Сам пароль не печатаем — он только что был в вашей команде.')
}

main()
  .catch((e) => {
    console.error('set-master упал:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
