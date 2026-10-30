'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, UserSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { ListTabs } from '@/components/admin/ListTabs'
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
// v0.7.10 (DF-22): секция — эталонная обёртка Card (CardTitle text-base
// с иконкой, действие — CardAction в заголовке, как у брокеров);
// фильтры статусов — общий ListTabs (BRANDBOOK §4.2) вместо пилюль;
// карточка кандидата — анатомия §4.3-lite по эталону «Юрлица»
// (LegalEntityCard): строка 1 — «с {дата}» + бейдж статуса, строка 2 —
// название semibold, строка 3 — контакт muted; справа — зоны.
export function ContractorLeadsSection({
  refreshKey = 0,
  portalEnabled,
  onContractorBorn,
}: {
  refreshKey?: number
  // D31 (DF-00C): флаг заморозки кабинета — в диалог выдачи доступа
  portalEnabled: boolean
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
    <section>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserSearch className="size-4 text-muted-foreground" />
            Квалификация
          </CardTitle>
          <CardDescription>
            Кандидаты: знакомство → переговоры → пул. Переводы — руками, автоматов нет (роадмап 8.1)
          </CardDescription>
          <CardAction>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Новый кандидат
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {/* Табы по статусам воронки (паттерн лидов В5, ?status= из Г2;
              DF-22: общий ListTabs §4.2 — counts не показываем, выборка
              грузится по одному статусу) */}
          <ListTabs
            tabs={[
              { key: 'all', label: 'Все' },
              ...CONTRACTOR_LEAD_STATUSES.map((s) => ({
                key: s,
                label: CONTRACTOR_LEAD_STATUS_LABELS[s],
              })),
            ]}
            active={statusFilter}
            onChange={(k) => setStatusFilter(k as 'all' | ContractorLeadStatus)}
          />

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
              <Loader2 className="size-4 animate-spin" />
              Загрузка…
            </div>
          ) : leads.length === 0 ? (
            <span className="text-center text-muted-foreground text-sm py-2">
              {statusFilter === 'all'
                ? 'Кандидатов пока нет — добавьте первого.'
                : `Кандидатов со статусом «${CONTRACTOR_LEAD_STATUS_LABELS[statusFilter]}» нет.`}
            </span>
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
                    className="p-4 cursor-pointer transition-colors hover:border-ring"
                    onClick={() => setSelected(l)}
                  >
                    {/* Анатомия §4.3-lite (эталон — «Юрлица») */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-muted-foreground tabular-nums">
                            с {fmtLeadDate(l.createdAt)}
                          </span>
                          <ContractorLeadStatusBadge status={l.status} />
                        </div>
                        <div className="mt-0.5 truncate font-semibold">{l.companyName}</div>
                        <div className="mt-0.5 truncate text-sm text-muted-foreground">
                          {[person || 'без контактного лица', phone].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="shrink-0 max-w-48 text-right">
                        <div className="truncate text-sm text-muted-foreground">
                          {directions || 'Зоны не указаны'}
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
        portalEnabled={portalEnabled}
        onClose={() => setContractLead(null)}
        patchLead={patchLead}
        onContractorBorn={onContractorBorn}
      />
    </section>
  )
}
