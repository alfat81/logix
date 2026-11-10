'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CalendarDays, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CargoFormFields, CargoGroups } from '@/components/admin/CargoGroups'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { PermitsSection } from '@/components/permits/PermitsSection'
import type { PermitRowUi } from '@/components/permits/types'
import { ActivityFeed, type ActivityRow } from '@/components/admin/ActivityFeed'
import { ClientLeadStatusBadge } from '@/components/client/ClientBadges'
import type { LeadStatus } from '@/lib/leads'
import { ClientQuoteOptions } from './ClientQuoteOptions'
import { ClientLeadAnketa } from './ClientLeadAnketa'
import type { ClientApprovalSnapshot, ClientOptionRow } from './client-lead-types'

// ─── Карточка запроса на расчёт в кабинете клиента (Е) ────────────
// Анкета, которую клиент отправлял (P1-02: правится, пока по запросу
// нет вариантов расчёта), статус воронки и документы: предварительный инвойс для
// расчёта пошлины брокер получает ещё до заявки (роадмап 5/5а).
// Конвертированный запрос показывает ссылку на заявку — документы
// живут там (перенос В4), загрузка сюда закрыта.

type ClientLeadDetail = {
  id: string
  status: LeadStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  // P1-03: маршрут/метрики — колонки (карточка + форма правки)
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  transportType?: string | null
  readyDate?: string | null
  weightKg?: string | number | null
  volumeM3?: string | number | null
  placesCount?: number | null
  order: { id: string; number: string } | null
  // BL-1/BL-7: варианты с продажными ценами, метаданные согласования,
  // активный снимок, право подтвердить
  options?: ClientOptionRow[]
  selectedOptionId?: string | null
  clientConfirmedAt?: string | null
  clientConfirmedVia?: string | null
  clientConfirmedByName?: string | null
  approvalSnapshot?: ClientApprovalSnapshot | null
  canConfirm?: boolean
  // P1-02: правка открыта до первого варианта расчёта
  canEdit?: boolean
  // DF-21: журнал запроса — события с аудиторией 'client', без меток
  activities?: ClientActivityRow[]
  // DF-16: разрешительные запроса (наружная проекция); после
  // конвертации строки живут заявкой — при lead.order секция пуста
  permitRequirements?: PermitRowUi[]
}

// DF-21: строка журнала клиентского кабинета — проекция ActivityFeed
type ClientActivityRow = ActivityRow


const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

export function ClientLeadCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [lead, setLead] = useState<ClientLeadDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // BL-1: согласование варианта — диалог подтверждения + отправка
  const [confirmOption, setConfirmOption] = useState<ClientOptionRow | null>(null)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/leads/${id}`)
      if (res.status === 404) {
        toast({ title: 'Запрос не найден', variant: 'destructive' })
        router.replace('/client')
        return
      }
      const data = await readApiResponse<{ lead?: ClientLeadDetail; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setLead(data.lead ?? null)
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

  // BL-1: согласовать вариант — POST select-option; после успеха карточка
  // перезагружается (статус «Согласован клиентом», условия — из снимка)
  const approveOption = async (option: ClientOptionRow) => {
    setConfirming(true)
    try {
      const res = await fetch(`/api/client/leads/${id}/select-option`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId: option.id }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось согласовать вариант')
      toast({ title: data.message || 'Вариант согласован' })
      setConfirmOption(null)
      load()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setConfirming(false)
    }
  }

  if (loading || !lead) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {!loading && 'Запрос не найден'}
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/client"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Ко всем запросам
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Запрос на расчёт</h1>
        <ClientLeadStatusBadge status={lead.status} />
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarDays className="size-3" />
          от {fmtDate(lead.createdAt)}
        </span>
      </div>

      {/* Стал заявкой — сделка живёт там: этапы, статусы, документы */}
      {lead.order ? (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 border-success/50 bg-success/5">
          <div className="text-sm">
            Запрос согласован — заявка{' '}
            <Link
              href={`/client/orders/${lead.order.id}`}
              className="font-semibold font-mono hover:underline inline-flex items-center gap-1"
            >
              № {lead.order.number}
              <ArrowRight className="size-3.5" />
            </Link>{' '}
            Документы прикрепляйте в карточке заявки.
          </div>
          <Link
            href={`/client/orders/${lead.order.id}`}
            className="text-sm font-medium hover:underline"
          >
            Открыть заявку
          </Link>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Менеджер готовит варианты расчёта. Прикрепите предварительные документы —
          они помогут посчитать таможенные платежи точнее.
        </p>
      )}

      {/* Документы запроса: обмен с менеджером и брокером внутри
          сервиса (Е). После конвертации — пусто и читать нечего:
          файлы переехали в заявку (В4), раздел остаётся для истории
          до перехода. */}
      {/* Анкета запроса + правка (P1-02) — ClientLeadAnketa.tsx (RULES 2.14) */}
      <ClientLeadAnketa lead={lead} reload={load} />

      {/* DF-21: журнал запроса — заметки менеджера «видна клиенту» и
          события статусов; без служебных меток и внутренних событий */}
      <ActivityFeed
        activities={lead.activities ?? []}
        emptyText="Событий пока нет — здесь появятся новости по вашему запросу"
      />

      {/* DF-16: разрешительные документы по запросу — что ждём от вас;
          закрывается загрузкой файла прямо в строке. После конвертации
          строки переносятся в заявку (В4) — здесь секцию прячем */}
      {!lead.order && (
        <PermitsSection
          viewer="client"
          initialPermits={lead.permitRequirements ?? []}
          documentUrlFor={(permitId) => `/api/client/permits/${permitId}/document`}
          onChanged={load}
          emptyText="Разрешительных документов по запросу нет"
        />
      )}

      {!lead.order && (
        <DocumentsSection
          documentsUrl={`/api/client/leads/${lead.id}/documents`}
          versionsUrlFor={(docId) => `/api/client/documents/${docId}/versions`}
          emptyText="Документов нет — прикрепите инвойс или описание груза, чтобы ускорить расчёт"
        />
      )}
    </div>
  )
}
