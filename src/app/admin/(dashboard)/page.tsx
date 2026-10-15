import { AttentionScreen } from '@/components/admin/AttentionScreen'

// Ж5: главная страница — «Требует внимания» (просрочка, проблемы,
// неназначенные исполнители, лиды без движения). Список заявок
// переехал на /admin/orders, меню ведёт в оба раздела.
export default function AdminPage() {
  return <AttentionScreen />
}
