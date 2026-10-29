// Верификация данных ТН ВЭД после импорта (проверка Шага 9).
// Запуск: DATABASE_URL=... npx tsx scripts/verify-hs-db.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const total = await prisma.hsCode.count()
  const active = await prisma.hsCode.count({ where: { validTo: null } })
  const level10 = await prisma.hsCode.count({ where: { level: 10 } })
  const journal = await prisma.hsImport.findFirst({ orderBy: { version: 'desc' } })
  const byRev = await prisma.hsCode.groupBy({ by: ['sourceRev'], _count: true })
  const sample = await prisma.hsCode.findFirst({ where: { sourceRev: '2026-10-28' }, select: { code: true, name: true, level: true } })
  console.log(JSON.stringify({ total, active, level10, byRev, journal, sample }, null, 2))
}

main()
  .catch((e) => { console.error('Проверка упала:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
