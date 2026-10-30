import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import { getSetting } from '@/lib/settings'
import { isPermitRed } from '@/lib/permits'
import { fmtPermitDate } from '@/lib/permits'

// ─── DF-16: скан просрочки разрешительных (ход диспетчера DF-03) ─────
// Карточка: «(г) красное событие permit_overdue, если isBlocking и до
// neededBy осталось меньше permits.red_days_before дней (по умолчанию 3)
// либо срок прошёл, не чаще раза в сутки».
//
// Идемпотентность повтора — lastRemindedAt на строке: событие пишется,
// только если его ещё не было (NULL) или прошло не меньше
// permits.remind_every_days суток (дефолт 2) — «не чаще раза в сутки»
// из карточки выполнено с запасом (повторный проход диспетчера через
// минуту второго письма не создаёт). Скан не падает сам: сбой на одной
// строке логируется и не останавливает проход (cron повторит через 5 мин).

const DAY_MS = 24 * 60 * 60 * 1000

export type PermitScanRun = {
  checked: number
  emitted: number
}

export async function scanPermitOverdue(at: Date = new Date()): Promise<PermitScanRun> {
  const run: PermitScanRun = { checked: 0, emitted: 0 }
  const [redDays, remindDays] = await Promise.all([
    getSetting('permits.red_days_before'),
    getSetting('permits.remind_every_days'),
  ])

  const candidates = await db.permitRequirement.findMany({
    where: {
      status: 'pending',
      isBlocking: true,
      // Срок в «красном окне» или прошёл: neededBy <= now + redDays*сутки.
      neededBy: { lte: new Date(at.getTime() + redDays * DAY_MS) },
      // Не напоминали либо прошло remind_every_days суток.
      OR: [
        { lastRemindedAt: null },
        { lastRemindedAt: { lte: new Date(at.getTime() - remindDays * DAY_MS) } },
      ],
    },
    select: { id: true, title: true, providedBy: true, neededBy: true, orderId: true, leadId: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  run.checked = candidates.length

  for (const row of candidates) {
    try {
      const neededBy = row.neededBy as Date
      if (!isPermitRed(neededBy, at, redDays)) continue
      const overdue = neededBy.getTime() < at.getTime()
      const target = row.orderId ? { orderId: row.orderId } : { leadId: row.leadId as string }
      await db.$transaction(async (tx) => {
        await emitEvent(tx, {
          target,
          actor: { type: 'system' },
          type: 'permit_overdue',
          description: `Разрешительный документ «${row.title}» — срок ${fmtPermitDate(neededBy)}${overdue ? ', срок прошёл' : ''} (блокирует отправку)`,
          notify: { permitProvidedBy: row.providedBy as 'client' | 'broker' | 'staff' },
        })
        await tx.permitRequirement.update({
          where: { id: row.id },
          data: { lastRemindedAt: at },
        })
      })
      run.emitted += 1
    } catch (e) {
      console.error('[permits-scan] строка не обработана (cron повторит):', row.id, e)
    }
  }
  return run
}
