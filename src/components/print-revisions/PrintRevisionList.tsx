'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  confirmPrintRevisionUi,
  fetchPrintRevisions,
  type PrintRevisionRow,
} from '@/lib/print-revisions-ui'

// ─── DF-27 волна 2 (Р-3, D75): список печатных редакций заявки ──────
// Общий рендер для админки (LeadPrintRevisions) и кабинета клиента
// (ClientLeadPrintRevisions): редакции + статусы подтверждений сторон +
// действие подтверждения актуальной редакции (по revisionId+contentHash).
// Различия ролей — только в подписи действия и примечании (props).

const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function PrintRevisionList({
  role,
  leadId,
  onChanged,
  confirmLabel,
  note,
}: {
  role: 'admin' | 'client'
  leadId: string
  onChanged?: () => void
  // Подпись действия подтверждения (роль видна человеку)
  confirmLabel: string
  // Примечание о смысле подтверждения (кабинет клиента)
  note?: string
}) {
  const { toast } = useToast()
  const [rows, setRows] = useState<PrintRevisionRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setRows(await fetchPrintRevisions(role, leadId))
  }, [role, leadId])

  useEffect(() => {
    void load()
  }, [load])

  const confirm = async (rev: PrintRevisionRow) => {
    setBusy(true)
    try {
      const r = await confirmPrintRevisionUi(role, leadId, rev.id, rev.contentHash)
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' })
        return
      }
      toast({ title: r.message })
      await load()
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Загрузка…
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {note ??
          'Редакций нет — сформируйте первую: снимок состава сведений заявки, который клиент и менеджер подтверждают раздельно.'}
      </p>
    )
  }
  return (
    <div className="space-y-2 text-sm">
      {rows.map((rev) => {
        const clientOk = rev.confirmations.some((c) => c.partyRole === 'client')
        const managerOk = rev.confirmations.some((c) => c.partyRole === 'manager')
        return (
          <div key={rev.id} className="rounded-md border p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Редакция №{rev.seq}</span>
              <span className="text-muted-foreground">от {fmtDateTime(rev.createdAt)}</span>
              {clientOk && managerOk ? (
                <Badge variant="delivered">Подтверждена обеими сторонами</Badge>
              ) : (
                <Badge variant="pending">Ожидает подтверждения</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Badge variant={clientOk ? 'delivered' : 'version'}>
                Клиент: {clientOk ? 'подтвердил' : 'не подтвердил'}
              </Badge>
              <Badge variant={managerOk ? 'delivered' : 'version'}>
                Менеджер: {managerOk ? 'подтвердил' : 'не подтвердил'}
              </Badge>
              <span className="text-xs">hash {rev.contentHash.slice(0, 12)}…</span>
            </div>
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
            {((role === 'client' && !clientOk) || (role === 'admin' && !managerOk)) && (
              <Button size="sm" variant={role === 'admin' ? 'outline' : 'default'} onClick={() => confirm(rev)} disabled={busy}>
                <ShieldCheck className="size-4" />
                {confirmLabel}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
