'use client'

// Поток A волна 1 (BL-7): архив запросов клиента (won/lost) — вынесен из
// ClientHome (RULES 2.14, integrity IC-09). Сворачиваемый блок, грузится
// по раскрытию; строки те же, что в «Моих запросах»: бейдж «Выигран/Отказ»,
// ссылка на заявку у won — история не пропадает.
import { useCallback, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { ClientLeadRow, type ClientLeadRowData } from '@/components/client/ClientLeadRow'

type ArchiveLead = {
  id: string
  status: 'new' | 'calculated' | 'client_approved' | 'won' | 'lost'
  createdAt: string
  cargoInfo: Record<string, unknown> | null
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  order: { id: string; number: string } | null
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

export function ClientLeadArchive() {
  const { toast } = useToast()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archived, setArchived] = useState<ClientLeadRowData[] | null>(null)

  const loadArchived = useCallback(async () => {
    try {
      const res = await fetch('/api/client/leads?archived=1')
      const data = await readApiResponse<{ leads?: ArchiveLead[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setArchived(data.leads ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить архив запросов',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setArchived([])
    }
  }, [toast])

  const toggle = () => {
    const next = !archiveOpen
    setArchiveOpen(next)
    if (next && archived === null) loadArchived()
  }

  return (
    <section className="grid gap-2">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {archiveOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Архив запросов{archived !== null ? ` (${archived.length})` : ''}
      </button>
      {archiveOpen &&
        (archived === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : archived.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            В архиве пока пусто — здесь останутся завершённые и отклонённые запросы.
          </p>
        ) : (
          <div className="grid gap-2">
            {archived.map((l) => (
              <ClientLeadRow key={l.id} lead={l} />
            ))}
          </div>
        ))}
    </section>
  )
}
