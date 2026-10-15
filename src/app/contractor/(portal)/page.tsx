import { ContractorOrdersList } from '@/components/contractor/ContractorOrdersList'

// Свои заявки (Г4). Данные тянет клиентский ContractorOrdersList
// через API портала — единая точка правды (паттерн Б5/В5).
export default function ContractorHomePage() {
  return <ContractorOrdersList />
}
