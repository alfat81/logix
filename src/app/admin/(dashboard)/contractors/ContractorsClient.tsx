'use client'

import { useState } from 'react'
import { ContractorLeadsSection } from '@/components/admin/ContractorLeadsSection'
import { ContractorPoolSection } from '@/components/admin/ContractorPoolSection'

// v0.5.3 (DF-00C): клиентское тело страницы «Подрядчики» вынесено из
// page.tsx — сама страница стала серверной, чтобы прочитать флаг
// CONTRACTOR_PORTAL_ENABLED на сервере и передать его пропсами
// (не NEXT_PUBLIC, RULES 2.3/D31). Логика 1:1 из page.tsx v0.5.2:
// секции живут раздельными выборками, но одно событие затрагивает
// обе (рождение подрядчика в воронке → перезагрузка пула, правка
// в пуле → перезагрузка воронки) — пара счётчиков версий.
export function ContractorsClient({ portalEnabled }: { portalEnabled: boolean }) {
  const [poolVersion, setPoolVersion] = useState(0)
  const [leadsVersion, setLeadsVersion] = useState(0)

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Подрядчики</h1>
        <p className="text-sm text-muted-foreground">
          Воронка квалификации и пул исполнителей (Дорожка Г)
        </p>
      </div>
      <ContractorLeadsSection
        refreshKey={leadsVersion}
        portalEnabled={portalEnabled}
        onContractorBorn={() => setPoolVersion((v) => v + 1)}
      />
      <ContractorPoolSection
        refreshKey={poolVersion}
        portalEnabled={portalEnabled}
        onContractorChanged={() => setLeadsVersion((v) => v + 1)}
      />
    </div>
  )
}
