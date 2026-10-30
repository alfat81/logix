/**
 * Фикстура e2e (DF-05/D45): сдвигает waitingSince запроса назад по времени,
 * чтобы проверить эскалацию «несколько вариантов расчёта, выбора нет
 * 2 рабочих дня» на РЕАЛЬНОМ пороге секции «Ждут дольше N часов» без
 * ожидания. Ждёт событие пересчёта не нужно: колонка ждёт, PATCH варианта
 * позже пересчитает её заново (recomputeAfterEvent).
 *
 * usage: bun scripts/e2e_backdate_waiting.ts <leadId> <days>
 * Запускается ТОЛЬКО на тестовой базе (как e2e_seed_notification.ts).
 */
import { PrismaClient } from '@prisma/client'

const leadId = process.argv[2]
const days = Number(process.argv[3] ?? '4')
if (!leadId || !Number.isFinite(days) || days <= 0) {
  console.error('usage: bun scripts/e2e_backdate_waiting.ts <leadId> <days>')
  process.exit(2)
}
const prisma = new PrismaClient()
try {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  await prisma.lead.update({ where: { id: leadId }, data: { waitingSince: since } })
  console.log(JSON.stringify({ ok: true, leadId, waitingSince: since.toISOString() }))
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
