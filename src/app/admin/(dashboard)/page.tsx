import { db } from '@/lib/db'
import Link from 'next/link'
import { fmtRuDate } from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'
import { projectActors, STAFF_READER } from '@/lib/actor-name'
import { isStaffOnlyRow } from '@/lib/activity'
import { activeOrdersTotal, orderStatusCounts } from '@/lib/order-counts'
import { AttentionScreen } from '@/components/admin/AttentionScreen'
import {
  SideActivityFeed,
  type SideActivityItem,
} from '@/components/admin/SideActivityFeed'
import { SummaryCards } from '@/components/admin/command-center/SummaryCards'
import { LeadQueue, type QueueLead } from '@/components/admin/command-center/LeadQueue'

/* TU-01.6 — Command Center // Обзор (референс commandcenter.png, волна 2):
   сводные карточки (реальные счётчики БД), очередь обработки заявок
   (new + client_approved), экран «Требует внимания» (Ж5 — бизнес-логика
   сохранена без изменений), системный пульс (реальная лента событий).
   Демо-данные макета не переносятся; маржинальные показатели — только в
   интерфейсе менеджера (блок «Маржин // Отчёты» не реализуется — реального
   агрегатора маржи нет, Д-18). «В ЗАКАЗ» из очереди ведёт на карточку
   заявки с авто-открытием существующего диалога подтверждения (В4).
   Правила ленты — DF-01/DF-02A без изменений. */
export default async function AdminPage() {
  // Сводные счётчики — те же источники, что у списков и бейджей меню:
  // лида — статусы воронки, заявки — orderStatusCounts (DF-21).
  const [newLeads, approvedLeads, orderCounts, queueLeads] = await Promise.all([
    db.lead.count({ where: { status: 'new' } }),
    db.lead.count({ where: { status: 'client_approved' } }),
    orderStatusCounts(),
    db.lead.findMany({
      where: { status: { in: ['new', 'client_approved'] } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, status: true, rawContact: true, updatedAt: true },
    }),
  ])
  const inTransit = activeOrdersTotal(orderCounts)

  // rawContact { name, phone?, email? } — черновая анкета до конвертации;
  // имя может отсутствовать (лид с сайта без анкеты) — строка без фейка.
  const queue: QueueLead[] = queueLeads.map((l) => {
    const contact =
      l.rawContact && typeof l.rawContact === 'object' && 'name' in l.rawContact
        ? String((l.rawContact as { name?: unknown }).name ?? '')
        : ''
    return {
      id: l.id,
      status: l.status as QueueLead['status'],
      contactName: contact,
      updatedLabel: fmtRuDate(l.updatedAt),
    }
  })

  // DF-01: фильтр ленты — только через eventWhereFor (инвариант
  // §1.3 ROADMAP-DEALFLOW); DF-02A: актёр-человек собирается при чтении —
  // «Имя (Компания)» (устаревшие строки — компания, как было).
  const feed = await db.activity.findMany({
    where: eventWhereFor('staff'),
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const rows = await projectActors(feed, STAFF_READER)

  const items: SideActivityItem[] = rows.map((a) => ({
    id: a.id,
    actorName: a.actorName,
    type: a.type,
    description: a.description,
    // df_03_contract: колонки isInternal больше нет — приватность
    // события живёт в audience; бейдж «Заметка» рисуется для staff-only.
    isInternal: isStaffOnlyRow(a),
    createdAt: a.createdAt,
    leadId: a.leadId,
    orderId: a.orderId,
  }))

  return (
    <div className="space-y-6">
      <SummaryCards newLeads={newLeads} approved={approvedLeads} inTransit={inTransit} />

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-6">
          {/* Очередь обработки (референс: «ОЧЕРЕДЬ ОБРАБОТКИ // ЗАЯВКИ») */}
          <section aria-labelledby="queue-title" className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <h2 id="queue-title" className="text-lg font-semibold tracking-tight text-foreground">
                Очередь обработки <span className="text-accent-text">{"// Заявки"}</span>
              </h2>
              <Link
                href="/admin/leads"
                className="shrink-0 text-xs font-semibold uppercase tracking-widest text-accent-text underline decoration-2 underline-offset-4 hover:text-foreground"
              >
                Посмотреть все
              </Link>
            </div>
            <LeadQueue items={queue} />
          </section>

          {/* Экран «Требует внимания» (Ж5): компонент без изменений —
              бизнес-правила очередей не тронуты (e2e-регрессия) */}
          <section id="attention" className="scroll-mt-14">
            <AttentionScreen />
          </section>
        </div>

        <aside aria-label="Системный пульс" className="mt-6 xl:mt-0 self-start xl:sticky xl:top-14">
          {/* Системный пульс (референс): лента событий платформы */}
          <SideActivityFeed items={items} title="Системный пульс" />
        </aside>
      </div>
    </div>
  )
}
