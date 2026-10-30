import Link from 'next/link'

// ─── Лента событий сделки (общий список для двух экранов) ────────────
// Тело ленты «События»: правая панель главной (P1-18) и блок
// «Последние события» Пульса (DF-07). Раньше размечалось дважды —
// IC-14 поймал 12-строчные окна; теперь один список: элементы приходят
// с createdAt Date (сервер) или ISO-строкой (API) — форматируем здесь.
// Подписи типов — снимок lib/activity (полный словарь живёт там).
// Заголовки карточек у экранов разные («События» / «Последние события
// за сутки») — их каждая карточка рисует сама.

export type ActivityEventItem = {
  id: string
  actorName: string
  type: string
  description: string
  isInternal: boolean
  createdAt: Date | string
  leadId: string | null
  orderId: string | null
}

export const TYPE_LABEL: Record<string, string> = {
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

// Момент события — компактно, без года: лента показывает свежее.
const fmt = (d: Date | string): string =>
  new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function ActivityEventList({ items }: { items: ActivityEventItem[] }) {
  return (
    <div className="px-0 pb-3">
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
    </div>
  )
}
