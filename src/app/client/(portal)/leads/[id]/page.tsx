import { ClientLeadCard } from '@/components/client/ClientLeadCard'

// Карточка запроса на расчёт в кабинете клиента (Е): анкета, статус,
// документы до превращения в заявку. Только чтение анкеты; документы
// — единственная интерактивная часть (роадмап 5).
export default function ClientLeadPage() {
  return <ClientLeadCard />
}
