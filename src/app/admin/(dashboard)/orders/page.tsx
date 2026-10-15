import { OrdersList } from '@/components/admin/OrdersList'

// Ж5: список заявок переехал с главной сюда — /admin теперь сводка
// «Требует внимания». OrdersList не менялся: тот же клиентский
// компонент с поиском/сортировкой/пагинацией (Ж4).
export default function OrdersPage() {
  return <OrdersList />
}
