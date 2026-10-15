import { CustomerCard } from '@/components/admin/CustomerCard'

// Карточка клиента (Ж6а): контакты, рамочные договоры, заявки и
// лиды. Клиентский CustomerCard работает через GET /api/admin/
// customers/[id] (паттерн карточек лида и заявки).
export default function CustomerPage() {
  return <CustomerCard />
}
