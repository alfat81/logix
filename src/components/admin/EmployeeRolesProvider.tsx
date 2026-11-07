'use client'

import { createContext, useContext } from 'react'

// ── Роли сотрудника для клиентских компонентов (DF-26 волна 2, §9.3) ──
// Серверный layout один раз читает сессию и отдаёт признак «мастер»
// вниз по дереву — клиентские диалоги (обход блокировки этапа) не ходят
// за ролью отдельным запросом. Только флаг мастера: других ролей в UI
// клиент не различает (лестницы прав проверяет сервер).
const IsMasterContext = createContext(false)

export function IsMasterProvider({
  isMaster,
  children,
}: {
  isMaster: boolean
  children: React.ReactNode
}) {
  return <IsMasterContext.Provider value={isMaster}>{children}</IsMasterContext.Provider>
}

export function useIsMaster(): boolean {
  return useContext(IsMasterContext)
}
