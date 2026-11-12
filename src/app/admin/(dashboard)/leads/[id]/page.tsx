import { LeadCard } from '@/components/admin/LeadCard'

// Карточка лида: анкета → варианты → конвертация. Клиентский
// LeadCard работает через API В2–В4 (паттерн карточки заявки Б5).
// TU-01.6: ?convert=1 — авто-открытие диалога конвертации: быстрая
// кнопка «В заказ» из очереди Обзора ведёт сюда; явное подтверждение
// менеджера сохраняется (обязательная адаптация макета), логика
// конвертации — в одном месте (API В4).
export default async function LeadPage({
  searchParams,
}: {
  searchParams: Promise<{ convert?: string }>
}) {
  const sp = await searchParams
  return <LeadCard autoOpenConvert={sp.convert === '1'} />
}
