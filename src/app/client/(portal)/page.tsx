import { cookies } from 'next/headers'
import { ClientHome } from '@/components/client/ClientHome'
import { getClientByToken, CLIENT_SESSION_COOKIE } from '@/lib/client-auth'

// Главная клиентского кабинета (И1): Обзор по референсу
// clientcabinet.png (TU-01.7) — приветствие, сводные карточки,
// «Актуальные предложения», заявки и запросы, таймлайн статусов.
// Имя пользователя и компания — из живой сессии (server), данные
// тянет клиентский ClientHome через API портала — единая точка
// правды (паттерн Г4).
export default async function ClientHomePage() {
  const client = await getClientByToken(
    (await cookies()).get(CLIENT_SESSION_COOKIE)?.value
  )
  return <ClientHome userName={client?.userName ?? ''} companyName={client?.name ?? ''} />
}
