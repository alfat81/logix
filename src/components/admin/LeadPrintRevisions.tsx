'use client'

import { useCallback, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { PrintRevisionList } from '@/components/print-revisions/PrintRevisionList'

// ─── DF-27 волна 2 (Р-3, D75): печатные редакции заявки (админка) ──
// Менеджер формирует неизменяемую редакцию (снимок + hash); клиент и
// менеджер подтверждают ОДНУ И ТУ ЖЕ редакцию; подтверждение менеджера
// не заменяет клиентское. Список и подтверждения — PrintRevisionList
// (общий с кабинетом клиента); здесь — создание редакции.

export function LeadPrintRevisions({ leadId, onChanged }: { leadId: string; onChanged?: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/print-revisions`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: data.error || 'Ошибка', variant: 'destructive' })
        return
      }
      toast({ title: data.message || 'Редакция создана' })
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-medium">Печатные редакции заявки</CardTitle>
        <Button size="sm" variant="outline" onClick={create} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Сформировать редакцию
        </Button>
      </CardHeader>
      <CardContent>
        <PrintRevisionList
          role="admin"
          leadId={leadId}
          onChanged={onChanged}
          confirmLabel="Подтвердить от менеджера"
        />
      </CardContent>
    </Card>
  )
}
