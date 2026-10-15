'use client'

import { useState } from 'react'
import { ContractorLeadsSection } from '@/components/admin/ContractorLeadsSection'
import { ContractorPoolSection } from '@/components/admin/ContractorPoolSection'

// Подрядчики (Дорожка Г): воронка квалификации кандидатов + пул
// исполнителей на одной странице — контур «нашли → проверили → в
// работе». Данные тянут клиентские секции через API Г2/Г3 — единая
// точка правды, паттерн лидов В5.
//
// Секции живут раздельными выборками (у каждой свой фильтр), но одно
// событие затрагивает обе: рождение подрядчика в воронке должно
// сразу появиться в пуле, а правка/исключение в пуле — обновить
// карточку кандидата (там виден родившийся подрядчик). Поэтому
// страница — клиентский компонент с парой счётчиков версий:
// onContractorBorn → перезагрузка пула, onContractorChanged →
// перезагрузка воронки.
export default function ContractorsPage() {
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
        onContractorBorn={() => setPoolVersion((v) => v + 1)}
      />
      <ContractorPoolSection
        refreshKey={poolVersion}
        onContractorChanged={() => setLeadsVersion((v) => v + 1)}
      />
    </div>
  )
}
