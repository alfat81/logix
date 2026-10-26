// DF-00B (IC-01): управление временной shadow-БД для `prisma migrate diff`.
// prisma db execute оборачивает SQL в транзакцию, а CREATE/DROP DATABASE
// в транзакции Postgres запрещены — поэтому жизненный цикл shadow-БД идёт
// через $executeRawUnsafe (паттерн scripts/q-db.mjs).
// Использование: SHADOW_URL=<url базы postgres> bun scripts/shadow-db.ts create|drop
import { PrismaClient } from '@prisma/client'

const cmd = process.argv[2]
const url = process.env.SHADOW_URL
if (!url || !['create', 'drop'].includes(cmd ?? '')) {
  console.error('usage: SHADOW_URL=... bun scripts/shadow-db.ts create|drop')
  process.exit(2)
}
const prisma = new PrismaClient({ datasources: { db: { url } } })
try {
  if (cmd === 'create') await prisma.$executeRawUnsafe('CREATE DATABASE logix_ic_shadow')
  if (cmd === 'drop') await prisma.$executeRawUnsafe('DROP DATABASE IF EXISTS logix_ic_shadow')
  console.log('OK')
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
