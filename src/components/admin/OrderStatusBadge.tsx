import { Badge } from '@/components/ui/badge'
import { ORDER_BADGE_VARIANTS } from '@/lib/status-badges'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/order-constants'

// P1-19 (BRANDBOOK §3.2): бейдж-«таблетка» по варианту из единой
// точки маппинга; текст — тот же словарь ORDER_STATUS_LABELS.
// v0.3.1: переезд из OrdersList.tsx в собственный файл — компонент
// используют 13 файлов (кабинеты, глобальный поиск), а списковой
// OrdersList больше не должен быть их транзитной зависимостью
// (RULES 2.14: декомпозиция, D15). Экспорт из OrdersList сохранён
// строкой реэкспорта — импорты потребителей не менялись.
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER_BADGE_VARIANTS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
}
