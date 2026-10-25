'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import {
  COMPETENCIES_DIRECTIONS_KEY,
  COMPETENCIES_TRANSPORT_KEY,
  readInfoString,
  readTransportChips,
} from '@/lib/contractors'
import { ContractorPoolEditDialog } from './contractorpool/ContractorPoolEditDialog'
import { fmtPoolDate, type ContractorRow, type PoolFilter } from './contractorpool/types'

// ─── Пул подрядчиков (Г5) ──────────────────────────────────────────
// Справочник Contractor (Г3): GET ?active= витрина пула против
// исключённых. Правка профиля — PATCH, компетенции — чипы
// TRANSPORT_TYPES, договорные поля/комментарий пустой строкой
// осознанно очищаются (паттерн incoterm Б3). Исключение из пула —
// МЯГКОЕ (isActive=false): на новые этапы не назначается, но вход в
// ЛК и текущие назначения живут; DELETE у справочника нет вовсе.
//
// v0.5.0 (P1-22): диалог правки/исключения — выезд в contractorpool/
// (резка под лимит 300, RULES 2.14).
export function ContractorPoolSection({
  refreshKey = 0,
  onContractorChanged,
}: {
  refreshKey?: number
  onContractorChanged?: () => void
}) {
  const { toast } = useToast()

  const [contractors, setContractors] = useState<ContractorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PoolFilter>('active')

  // Диалог правки профиля (форма живёт в диалоге)
  const [selected, setSelected] = useState<ContractorRow | null>(null)

  const load = useCallback(
    async (f: PoolFilter) => {
      setLoading(true)
      try {
        const url =
          f === 'all'
            ? '/api/admin/contractors'
            : `/api/admin/contractors?active=${f === 'active'}`
        const res = await fetch(url)
        const data = await readApiResponse<{ contractors: ContractorRow[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        setContractors(data.contractors)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить пул',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    load(filter)
  }, [filter, load, refreshKey])

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Пул</h2>
          <p className="text-sm text-muted-foreground">
            Квалифицированные исполнители. Исключение — мягкое: новые назначения блокируются,
            текущие этапы и вход в ЛК живут
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['active', 'В пуле'],
            ['excluded', 'Исключённые'],
            ['all', 'Все'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : contractors.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {filter === 'active'
            ? 'Пул пуст — переведите первого кандидата в квалификации.'
            : filter === 'excluded'
              ? 'Исключённых подрядчиков нет.'
              : 'Подрядчиков пока нет.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {contractors.map((c) => {
            const chips = readTransportChips((c.competencies ?? {})[COMPETENCIES_TRANSPORT_KEY])
            const directions = readInfoString((c.competencies ?? {})[COMPETENCIES_DIRECTIONS_KEY])
            return (
              <Card
                key={c.id}
                className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 cursor-pointer transition-colors hover:border-ring"
                onClick={() => setSelected(c)}
              >
                <div className="min-w-44 flex-1">
                  <div className="font-medium truncate">{c.companyName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.phone}
                    {c.contractNumber ? ` · договор № ${c.contractNumber}` : ''}
                    {c.contractSignedAt ? ` от ${fmtPoolDate(c.contractSignedAt)}` : ''}
                  </div>
                  {c.comment && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{c.comment}</div>
                  )}
                </div>
                <div className="min-w-36 flex-1">
                  <div className="flex flex-wrap gap-1">
                    {chips.length ? (
                      chips.map((t) => (
                        <Badge key={t} variant="outline" className="text-xxs">
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">компетенции не указаны</span>
                    )}
                  </div>
                  {directions && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{directions}</div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {c._count.stages > 0 ? `${c._count.stages} этап(ов) назначено` : 'без назначений'}
                </div>
                {c.isActive ? (
                  <Badge variant="delivered">
                    в пуле
                  </Badge>
                ) : (
                  <Badge variant="version">
                    исключён
                  </Badge>
                )}
                <Pencil className="size-4 text-muted-foreground" />
              </Card>
            )
          })}
        </div>
      )}

      <ContractorPoolEditDialog
        contractor={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null)
          load(filter)
        }}
        onReloaded={() => load(filter)}
        onRowFresh={setSelected}
        onContractorChanged={onContractorChanged}
      />
    </section>
  )
}
