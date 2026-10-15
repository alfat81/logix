'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CalendarDays, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { CargoGroups } from '@/components/admin/CargoGroups'
import { DocumentsSection } from '@/components/documents/DocumentsSection'
import { ClientLeadStatusBadge } from '@/components/client/ClientBadges'
import type { LeadStatus } from '@/lib/leads'

// ─── Карточка запроса на расчёт в кабинете клиента (Е) ────────────
// Анкета, которую клиент отправлял (снимок — правки только новым
// запросом), статус воронки и документы: предварительный инвойс для
// расчёта пошлины брокер получает ещё до заявки (роадмап 5/5а).
// Конвертированный запрос показывает ссылку на заявку — документы
// живут там (перенос В4), загрузка сюда закрыта.

type ClientLeadDetail = {
  id: string
  status: LeadStatus
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  order: { id: string; number: string } | null
}

const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU')

export function ClientLeadCard() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [lead, setLead] = useState<ClientLeadDetail | null>(null)
  const [loading, setLoading] = useState(true)

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

      {/* Анкета, которую клиент отправлял (снимок) */}
      <Card className="p-0">
        <CardContent className="p-4 grid gap-3">
          <h2 className="text-base font-semibold">Анкета запроса</h2>
          <CargoGroups
            cargoInfo={lead.cargoInfo}
            emptyText="Анкета не заполнялась — запрос зарегистрирован без подробностей"
          />
        </CardContent>
      </Card>

      {/* Документы запроса: обмен с менеджером и брокером внутри
          сервиса (Е). После конвертации — пусто и читать нечего:
          файлы переехали в заявку (В4), раздел остаётся для истории
          до перехода. */}
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
