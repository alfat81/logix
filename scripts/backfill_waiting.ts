// ─── DF-05 «У кого мяч»: backfill-пересчёт ожидания ──────────────────
// Заполняет waitingOn* для ВСЕХ заявок и запросов (миграция df_05_waiting
// оставляет колонки NULL = «ещё не считали»). Идемпотентен: повторный
// запуск — no-op для уже посчитанных (kind/reason не меняются — записи
// не происходит), безопасен на любой базе.
//
// Запуск (владелец, после распаковки релиза и migrate deploy):
//   npx prisma@6 generate        — пересоздать клиента с новыми полями
//   npx tsx scripts/backfill_waiting.ts
// DATABASE_URL — из .env или переменной окружения (боевая база — по
// инструкции релиза; скрипт только ЧИТАЕТ состояние и пишет 4 колонки).

import { db } from '../src/lib/db'
import { recomputeWaitingLead, recomputeWaitingOrder } from '../src/lib/waiting-db'

async function main() {
  const [orderIds, leadIds] = await Promise.all([
    db.order.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } }),
    db.lead.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } }),
  ])
  console.log(`Пересчёт ожидания: заявок ${orderIds.length}, запросов ${leadIds.length}`)

  let orders = 0
  let leads = 0
  // Пачками по 50: одна транзакция на пачку — сбой середины не теряет
  // уже записанные пачки (повтор запуска докатывает).
  const BATCH = 50
  for (let i = 0; i < orderIds.length; i += BATCH) {
    const slice = orderIds.slice(i, i + BATCH).map((r) => r.id)
    await db.$transaction(async (tx) => {
      for (const id of slice) {
        const before = await tx.order.findUnique({
          where: { id },
          select: { waitingOnKind: true },
        })
        await recomputeWaitingOrder(tx, id)
        const after = await tx.order.findUnique({
          where: { id },
          select: { waitingOnKind: true },
        })
        if ((before?.waitingOnKind ?? null) !== (after?.waitingOnKind ?? null)) orders++
      }
    })
    console.log(`  заявки: ${Math.min(i + BATCH, orderIds.length)}/${orderIds.length}`)
  }
  for (let i = 0; i < leadIds.length; i += BATCH) {
    const slice = leadIds.slice(i, i + BATCH).map((r) => r.id)
    await db.$transaction(async (tx) => {
      for (const id of slice) {
        const before = await tx.lead.findUnique({
          where: { id },
          select: { waitingOnKind: true },
        })
        await recomputeWaitingLead(tx, id)
        const after = await tx.lead.findUnique({
          where: { id },
          select: { waitingOnKind: true },
        })
        if ((before?.waitingOnKind ?? null) !== (after?.waitingOnKind ?? null)) leads++
      }
    })
    console.log(`  запросы: ${Math.min(i + BATCH, leadIds.length)}/${leadIds.length}`)
  }
  console.log(`Готово. Сменили kind: заявок ${orders}, запросов ${leads}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
