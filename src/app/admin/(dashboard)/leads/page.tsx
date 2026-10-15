import { LeadsList } from '@/components/admin/LeadsList'

// Воронка лидов (Дорожка В). Данные тянет клиентский LeadsList
// через API — единая точка правды со списком заявок (паттерн Б5).
export default function LeadsPage() {
  return <LeadsList />
}
