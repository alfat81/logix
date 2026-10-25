'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import {
  CONTRACTOR_LEAD_STATUSES,
  CONTRACTOR_LEAD_STATUS_LABELS,
  readInfoString,
  type ContractorLeadStatus,
} from '@/lib/contractors'
import { ContractorLeadStatusBadge } from './contractorlead/ContractorLeadStatusBadge'
import { ContractorLeadActionsDialog } from './contractorlead/ContractorLeadActionsDialog'
import { ContractorLeadContractDialog } from './contractorlead/ContractorLeadContractDialog'
import { ContractorLeadCreateDialog } from './contractorlead/ContractorLeadCreateDialog'
import { fmtLeadDate, type ContractorLeadRow } from './contractorlead/types'

// ─── Воронка квалификации подрядчиков (Г5, паттерн лидов В5) ───────
// Кандидаты (ContractorLead, Г2) — табы по статусам, диалог создания с
// черновой анкетой rawInfo, диалог кандидата с переходами: в
// квалификацию, отказ с причиной, перевод в пул с формой рождения
// подрядчика (телефон/стартовый пароль/компетенции), удаление без
// родившегося подрядчика. Отдельной карточки-страницы нет: у кандидата
// мало контента (не лид с 28-польной анкетой и вариантами) — диалог
// закрывает сценарий, очередь Г5 называет один маршрут /admin/contractors.
//
// v0.5.0 (P1-22): диалоги и общие части выезды в contractorlead/
// (TransportChips — общий с пулом; резка под лимит 300, RULES 2.14).
export function ContractorLeadsSection({
  refreshKey = 0,
  onContractorBorn,
}: {
  refreshKey?: number
  onContractorBorn?: () => void
}) {
  const { toast } = useToast()

  const [leads, setLeads] = useState<ContractorLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | ContractorLeadStatus>('all')

  // Диалог создания кандидата
  const [createOpen, setCreateOpen] = useState(false)

  // Диалог кандидата (просмотр анкеты + действия)
  const [selected, setSelected] = useState<ContractorLeadRow | null>(null)

  // Форма рождения живёт в своём диалоге; здесь — выбор кандидата
  const [contractLead, setContractLead] = useState<ContractorLeadRow | null>(null)

  const load = useCallback(
    async (status: 'all' | ContractorLeadStatus) => {
      setLoading(true)
      try {
        const url =
          status === 'all'
            ? '/api/admin/contractor-leads'
            : `/api/admin/contractor-leads?status=${status}`
        const res = await fetch(url)
        const data = await readApiResponse<{ contractorLeads: ContractorLeadRow[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        setLeads(data.contractorLeads)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить кандидатов',
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
    load(statusFilter)
  }, [statusFilter, load, refreshKey])

  // Актуальный кандидат для диалога (после мутаций перечитываем список,
  // а диалогу нужен свежий статус — берём из перечитанного списка)
  const current = selected ? leads.find((l) => l.id === selected.id) ?? selected : null

  const patchLead = async (lead: ContractorLeadRow, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/contractor-leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readApiResponse<{ contractorLead?: ContractorLeadRow; message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Ошибка', variant: 'destructive' })
      return false
    }
    toast({ title: data.message || 'Обновлено' })
    await load(statusFilter)
    if (data.contractorLead) setSelected(data.contractorLead)
    return true
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Квалификация</h2>
          <p className="text-sm text-muted-foreground">
            Кандидаты: знакомство → переговоры → пул. Переводы — руками, автоматов нет (роадмап 8.1)
          </p>
        </div>
        <Button variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Новый кандидат
        </Button>
      </div>

      {/* Табы по статусам воронки (паттерн лидов В5, ?status= из Г2) */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setStatusFilter('all')}
        >
          Все
        </Button>
        {CONTRACTOR_LEAD_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? 'default' : 'outline'}
            onClick={() => setStatusFilter(s)}
          >
            {CONTRACTOR_LEAD_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : leads.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {statusFilter === 'all'
            ? 'Кандидатов пока нет — добавьте первого.'
            : `Кандидатов со статусом «${CONTRACTOR_LEAD_STATUS_LABELS[statusFilter]}» нет.`}
        </Card>
      ) : (
        <div className="grid gap-2">
          {leads.map((l) => {
            const raw = l.rawInfo ?? {}
            const person = readInfoString(raw.contactPerson)
            const phone = readInfoString(raw.phone)
            const directions = readInfoString(raw.directions)
            return (
              <Card
                key={l.id}
                className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 cursor-pointer transition-colors hover:border-ring"
                onClick={() => setSelected(l)}
              >
                <div className="min-w-44 flex-1">
                  <div className="font-medium truncate">{l.companyName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[person || 'без контактного лица', phone].filter(Boolean).join(' · ')} ·{' '}
                    {fmtLeadDate(l.createdAt)}
                  </div>
                </div>
                <div className="min-w-40 flex-1 text-sm">
                  {directions || <span className="text-muted-foreground">Зоны не указаны</span>}
                </div>
                <ContractorLeadStatusBadge status={l.status} />
              </Card>
            )
          })}
        </div>
      )}

      <ContractorLeadCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => load(statusFilter)}
      />

      <ContractorLeadActionsDialog
        lead={current}
        onClose={() => setSelected(null)}
        patchLead={patchLead}
        onOpenContract={setContractLead}
        onDeleted={() => {
          setSelected(null)
          load(statusFilter)
        }}
      />

      <ContractorLeadContractDialog
        lead={contractLead}
        onClose={() => setContractLead(null)}
        patchLead={patchLead}
        onContractorBorn={onContractorBorn}
      />
    </section>
  )
}
