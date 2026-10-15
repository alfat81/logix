/**
 * Диагностика входа: каким известным паролям соответствует каждый
 * сотрудник в базе, которую видит приложение (тот же DATABASE_URL,
 * что и у dev-сервера: переменная окружения > .env).
 *
 * Запуск из корня проекта:  node scripts/check-master-pass.js
 * Можно передать свои кандидаты-пароли:
 *   node scripts/check-master-pass.js "мойпароль" "ещёпароль"
 * Без аргументов проверяются: пароль SQL-посева (S-cont-local) и
 * локальный default (logix-master).
 *
 * Только чтение; хэш и пароли не печатает (печатает ТОЛЬКО те
 * кандидаты, которые совпали — они и так известны вызывающему).
 */

// ESM (.mjs): единый стиль с остальными скриптами — import вместо
// require, работает на голом node без флагов (у пользователя Node 24).
// Порядок безопасен как в seed.ts: DATABASE_URL читается при
// конструировании PrismaClient, а не при импорте модуля — загрузчик
// .env ниже успевает отработать до new PrismaClient().
import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { scryptSync, timingSafeEqual } from 'node:crypto'

// Мини-загрузчик .env — тот же механизм, что в scripts/seed.ts
function loadEnvFallback() {
  for (const candidate of ['.env', 'prisma/.env']) {
    try {
      const text = fs.readFileSync(candidate, 'utf8')
      for (const line of text.split(/\r?\n/)) {
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

const candidates =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ['Logix-QTLbcKe06OJOl3sm', 'logix-master']

const url = process.env.DATABASE_URL || '(DATABASE_URL не найден)'
const host = (url.match(/@([^/?]+)/) || [])[1] || url

function passwordFits(stored, plain) {
  if (!stored.startsWith('scrypt:')) return false
  const [, salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false
  const hash = scryptSync(plain, salt, 64)
  const ref = Buffer.from(hashHex, 'hex')
  return hash.length === ref.length && timingSafeEqual(hash, ref)
}

async function main() {
  console.log('Хост базы:', host)
  console.log('Проверяемые пароли-кандидаты:', candidates.join(' | '))
  const employees = await prisma.employee.findMany({
    select: { phone: true, name: true, password: true },
    orderBy: { phone: 'asc' },
  })
  if (employees.length === 0) {
    console.log('Сотрудников в этой базе НЕТ — приложение смотрит не в ту базу, что вы проверяли, или посев туда не делался.')
    return
  }
  for (const e of employees) {
    if (!e.password.startsWith('scrypt:')) {
      console.log(`${e.phone} (${e.name}) — хэш НЕ в формате scrypt, значение начинается с: ${e.password.slice(0, 16)}…`)
      continue
    }
    const fits = candidates.filter((c) => passwordFits(e.password, c))
    console.log(
      `${e.phone} (${e.name}) —`,
      fits.length ? `ПОДХОДИТ: ${fits.join(', ')}` : 'ни один из проверяемых паролей не подошёл'
    )
  }
}

main()
  .catch((e) => {
    console.error('ОШИБКА:', String(e.message).slice(0, 300))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
