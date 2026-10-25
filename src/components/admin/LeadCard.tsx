'use client'

// Карточка лида (В2/В3/В4). P1-19: файл разрезан (RULES 2.14, ≤300) —
// диалоги и блоки вынесены в lead/ (LeadStatusControls, LeadConvertBlock,
// LeadAnketaCard, types.ts). Layout — BRANDBOOK §4 (этап B, P1-18):
// рабочая область 1fr + правая панель «Детали/Журнал» 320px.
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { LeadStatusBadge } from '@/components/admin/LeadsList'
import { Breadcrumbs } from '@/components/admin/Breadcrumbs'
import { AssigneeField } from '@/components/admin/AssigneeField'
import { LeadEditDialog } from '@/components/admin/LeadEditDialog'
import { QuoteOptionsSection } from '@/components/admin/QuoteOptionsSection'
import { ActivityFeed } from '@/components/admin/ActivityFeed'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { NoteForm } from '@/components/admin/NoteForm'
import { BrokerLinksSection } from '@/components/admin/BrokerLinksSection'
import type { LeadStatus } from '@/lib/leads'
import { fmtDate, type LeadFull } from '@/components/admin/lead/types'
import { LeadAnketaCard } from '@/components/admin/lead/LeadAnketaCard'
import { LeadConvertBlock } from '@/components/admin/lead/LeadConvertBlock'
import { LeadStatusControls } from '@/components/admin/lead/LeadStatusControls'

export function LeadCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const [lead, setLead] = useState<LeadFull | null>(null)
  const [loading, setLoading] = useState(true)

  // P1-02: правка анкеты (контакты + груз) — окно new/calculated
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/leads/${id}`)
      if (res.status === 404) {
        toast({ title: 'Запрос не найден', variant: 'destructive' })
        router.replace('/admin/leads')
        return
      }
      const data = await readApiResponse<{ lead: LeadFull; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLead(data.lead)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить запрос',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [id, router, toast])

  useEffect(() => {
    load()
  }, [load])

  const patchLead = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readApiResponse<{ message?: string; error?: string }>(res)
    if (!res.ok) {
      toast({ title: data.error || 'Ошибка', variant: 'destructive' })
      return false
    }
    toast({ title: data.message || 'Обновлено' })
    load()
    return true
  }

  if (loading || !lead) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        <Loader2 className="size-4 animate-spin" />
        Загрузка…
      </div>
    )
  }

  const isWon = lead.status === 'won'
  const selectedOption = lead.options.find((o) => o.isSelected) ?? null
  // P1-02: правка анкеты — new/calculated (won/lost закрывают правку;
  // у lost возврат в работу — мастер, у won правка через заявку)
  const anketaEditable = lead.status === 'new' || lead.status === 'calculated'

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6">
      {/* BRANDBOOK §4 (P1-18): рабочая область 1fr + правая панель
          «Детали/Журнал» 320px. При < 1280px панель складывается вниз,
          порядок DOM не меняется. */}
      <div className="space-y-4 min-w-0">
        {/* Ж7: крошки вместо кнопки «назад» — путь виден целиком
            (Главная / Лиды / текущий лид), паттерн карточки заявки. */}
        <Breadcrumbs
          items={[
            { label: 'Главная', href: '/admin' },
            { label: 'Запросы', href: '/admin/leads' },
            { label: `Запрос от ${fmtDate(lead.createdAt)}` },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Запрос от {fmtDate(lead.createdAt)}</h1>
          <LeadStatusBadge status={lead.status} />
          {/* И1: запрос из клиентского кабинета */}
          {lead.source === 'cabinet' && <Badge variant="outline">Кабинет</Badge>}
          <LeadStatusControls
            leadId={lead.id}
            status={lead.status as LeadStatus}
            hasOrder={!!lead.order}
            optionsCount={lead.options.length}
            patchLead={patchLead}
          />
        </div>

        {/* P1-01: ответственный менеджер — смена PATCH'ем с записью в журнал
            (у мастера — выбор из справочника, у менеджера — read-only) */}
        <AssigneeField
          value={lead.assignee?.id ?? null}
          currentName={lead.assignee?.name ?? null}
          onSave={(employeeId) => patchLead({ assignedToId: employeeId })}
        />

        {lead.status === 'lost' && lead.lostReason && (
          <Card className="p-3 text-sm border-destructive/40 bg-destructive/5">
            <span className="text-muted-foreground">Причина отказа: </span>
            {lead.lostReason}
          </Card>
        )}

        {/* ── Анкета запроса (бланк заявки; компонент lead/, P1-19) ── */}
        <LeadAnketaCard
          lead={lead}
          editable={anketaEditable}
          onEdit={() => setEditOpen(true)}
        />

        {/* ── Д: брокеры расчёта (роадмап 5а) — подключаются на расчёте,
            оценка платежей — их обязанность; при конвертации доступ
            переезжает в заявку. won — история, управление закрыто. */}
        <BrokerLinksSection
          targetType="lead"
          targetId={String(id)}
          links={lead.brokers}
          disabled={isWon}
          onChanged={load}
          emptyText="Брокеры не подключены — подключите таможенного представителя для оценки платежей"
        />

        {/* ── Е: документы сделки (роадмап 5) — предварительный инвойс
            для расчёта пошлины живёт на расчёте. won — без секции: сделка
            переехала в заявку, документы уехали вместе с ней (В4). ── */}
        {!isWon && (
          <DocumentsSection
            documentsUrl={`/api/admin/leads/${id}/documents`}
            versionsUrlFor={(docId) => `/api/admin/documents/${docId}/versions`}
            deleteUrlFor={(docId) => `/api/admin/documents/${docId}`}
            canMarkInternal
            emptyText="Документов нет — предварительный инвойс брокеру, сканы и прочее загружайте здесь"
          />
        )}

        {/* ── Варианты расчёта (В3) — секция вынесена в компонент
            (P1-04: деньги — валюта/НДС/себестоимость) ────────────── */}
        <QuoteOptionsSection
          leadId={String(id)}
          options={lead.options}
          disabled={isWon}
          onChanged={load}
        />
        {/* ── Конвертация / заявка (В4; компонент lead/, P1-19) ──── */}
        {lead.order ? (
          <Card className="p-4 flex flex-wrap items-center gap-4 border-success/50 bg-success/5">
            <div className="flex-1">
              <div className="font-medium">Конвертирован в заявку</div>
              <div className="text-sm text-muted-foreground">
                Воронка завершена — история запроса зафиксирована
              </div>
            </div>
            <Button asChild>
              <Link href={`/admin/orders/${lead.order.id}`}>
                Заявка {lead.order.number}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Card>
        ) : lead.status !== 'lost' ? (
          <LeadConvertBlock
            leadId={lead.id}
            cargoInfo={lead.cargoInfo}
            canConvert={!!selectedOption}
          />
        ) : null}
      </div>

      {/* Правая панель «Детали/Журнал» (BRANDBOOK §4, 320px):
          заметка (Ж3) + лента (Ж2). Sticky на xl — контекст не
          теряется при длинной анкете; на < xl — блок внизу. */}
      <aside className="space-y-4 min-w-0 xl:sticky xl:top-14">
        <NoteForm targetType="lead" targetId={String(id)} onAdded={load} />
        <ActivityFeed
          activities={lead.activities}
          emptyText="Событий пока нет — журнал начнётся с первого действия"
        />
      </aside>

      {/* ── P1-02: диалог правки анкеты (контакты + груз) ── */}
      <LeadEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        leadId={lead.id}
        hasCustomer={!!lead.customer}
        initialContact={lead.customer ? null : lead.rawContact}
        initialRow={lead}
        onSaved={load}
      />
    </div>
  )
}
