import { ClientHome } from '@/components/client/ClientHome'

// Главная клиентского кабинета (И1): «Мои заявки» (этапы и статусы)
// и «Мои запросы» (воронка + создание нового). Данные тянет
// клиентский ClientHome через API портала — единая точка правды
// (паттерн Г4).
export default function ClientHomePage() {
  return <ClientHome />
}
