// Проверка префиксов ТН ВЭД в справочнике (диагностика смоука п.1–2).
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main(): Promise<void> {
  for (const p of ['01245', '010121', '0101', '0102', '0106']) {
    const n = await prisma.hsCode.count({ where: { code: { startsWith: p }, validTo: null } })
    console.log(p, '→', n)
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
