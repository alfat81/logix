import { ContractsList } from '@/components/admin/ContractsList'

// Договоры (Ж6а): список рамочных договоров с поиском по номеру,
// клиенту и юрлицу. Создания вручную нет — договор рождается
// автоматически при первой заявке пары клиент+юрлицо.
export default function ContractsPage() {
  return <ContractsList />
}
