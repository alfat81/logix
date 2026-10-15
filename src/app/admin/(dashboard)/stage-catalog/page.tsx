import { cookies } from 'next/headers'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { StageCatalogList } from '@/components/admin/StageCatalogList'

// Этапы (Ж6б): каталог типовых этапов заявки — создание, порядок,
// флаг обязательности. Флаг — только мастер: серверная обёртка
// читает сессию и передаёт isMaster в клиентский список, UI честно
// блокирует кнопку менеджеру (но право проверяет и API — UI-блок
// это удобство, не защита).
export default async function StageCatalogPage() {
  const employee = await getEmployeeByToken((await cookies()).get(SESSION_COOKIE)?.value)
  const isMaster = employee?.roles.includes('master') ?? false
  return <StageCatalogList isMaster={isMaster} />
}
