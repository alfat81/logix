import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { History } from 'lucide-react'

// ─── Правая панель «События» на главной админки (P1-18, BRANDBOOK §4) ──
// Третья колонка workspace (280 | 1fr | 320): свежая активность по всем
// сделкам — журнал (Ж2) в масштабе платформы. Серверный компонент:
// данные читаются в page.tsx одним запросом, интерактивности нет —
// клик уводит в карточку сделки, остальное живёт в её ленте.

export type SideActivityItem = {
  id: string
  actorName: string
  type: string
  description: string
  isInternal: boolean
  createdAt: Date
  leadId: string | null
  orderId: string | null
}

// Момент события — компактно, без года: панель показывает свежее.
const fmt = (d: Date): string =>
  d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// Человеческое имя типа — словарь из lib/activity (снимок на UI-уровне,
// полный словарь живёт там: P1-13 сведёт форматтеры).
const TYPE_LABEL: Record<string, string> = {
  lead_created: 'Запрос создан',
  lead_edited: 'Запрос правлен',
  lead_status_changed: 'Статус запроса',
  lead_assignee_changed: 'Ответственный',
  lead_broker_attached: 'Брокер подключён',
  lead_broker_detached: 'Брокер откреплён',
  lead_converted: 'Конвертация',
  note_added: 'Заметка',
  option_added: 'Вариант расчёта',
  option_updated: 'Вариант правлен',
  option_deleted: 'Вариант удалён',
  broker_estimate_changed: 'Оценка брокера',
  broker_estimate_sent: 'Ответ брокера',
  estimate_updated: 'Ответ брокера правлен',
  order_created: 'Заявка создана',
  order_status_changed: 'Статус заявки',
  stage_created: 'Этап добавлен',
  stage_updated: 'Этап правлен',
  stage_status_changed: 'Статус этапа',
  contractor_created: 'Подрядчик создан',
  contractor_updated: 'Подрядчик правлен',
  contractor_pool_changed: 'Пул подрядчиков',
  document_created: 'Документ',
  document_version_added: 'Версия документа',
  document_deleted: 'Документ удалён',
}

export function SideActivityFeed({ items }: { items: SideActivityItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" />
          События
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        {items.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">
            Событий пока нет — журнал начнётся с первого действия
          </p>
        ) : (
          <ol className="px-6">
            {items.map((a, i) => (
              <li
                key={a.id}
                className={`py-2.5 ${i > 0 ? 'border-t border-border/60' : ''} ${
                  a.isInternal ? 'border-l-2 border-l-accent pl-2 -ml-px' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {TYPE_LABEL[a.type] ?? 'Событие'}
                  </span>
                  <time className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {fmt(a.createdAt)}
                  </time>
                </div>
                <p className="text-sm leading-snug mt-0.5 break-words">{a.description}</p>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {a.actorName}
                  {a.leadId && (
                    <>
                      {' · '}
                      <Link href={`/admin/leads/${a.leadId}`} className="underline-offset-2 hover:underline">
                        запрос
                      </Link>
                    </>
                  )}
                  {a.orderId && (
                    <>
                      {' · '}
                      <Link href={`/admin/orders/${a.orderId}`} className="underline-offset-2 hover:underline">
                        заявка
                      </Link>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
