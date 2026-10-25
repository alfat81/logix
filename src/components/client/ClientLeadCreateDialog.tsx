'use client'

import { useState } from 'react'
import { Loader2, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
// Анкета груза — общий бланк заявки (lib/leads: константы и сборка
// общие для всех порталов). Компонент живёт в admin/, но это доменная
// форма документа, а не «хром» кабинета менеджера — клиент заполняет
// её у себя, в отличие от бейджей (те копируются, см. ClientBadges).
import { CargoFormFields } from '@/components/admin/CargoGroups'
import {
  EMPTY_LEAD_CARGO_FORM,
  buildLeadPayload,
  type LeadCargoForm,
} from '@/lib/leads'
import { CLIENT_LEAD_DAILY_LIMIT } from '@/lib/client-constants'

// v0.5.0 (P1-22): диалог «Новый запрос на расчёт» клиентского
// кабинета — выезд из ClientHome.tsx (резка под лимит 300, RULES
// 2.14). Логика 1:1: анкета по бланку заявки (P1-03), непусто — хотя
// бы одно поле маршрута или анкеты; дневной лимит И1.
export function ClientLeadCreateDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [cargo, setCargo] = useState<LeadCargoForm>({ ...EMPTY_LEAD_CARGO_FORM })

  const handleCreate = async () => {
    // P1-03: форма → route (колонки) + cargoInfo-rest; непусто —
    // хотя бы одно поле маршрута или анкеты
    const { route, cargo: cargoInfo } = buildLeadPayload(cargo)
    const hasRoute = Object.values(route).some((v) => v != null)
    if (!cargoInfo && !hasRoute) {
      toast({
        title: 'Заполните хотя бы одно поле анкеты',
        description: 'Менеджеру нужно понимать, что и куда везти',
        variant: 'destructive',
      })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/client/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargoInfo, route }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить запрос')

      toast({ title: 'Запрос отправлен', description: 'Менеджер свяжется с вами по расчёту' })
      setCreateOpen(false)
      setCargo({ ...EMPTY_LEAD_CARGO_FORM })
      onCreated()
    } catch (e) {
      toast({
        title: 'Ошибка отправки',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <Button onClick={() => setCreateOpen(true)}>
        <Plus className="size-4" />
        Новый запрос
      </Button>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый запрос на расчёт</DialogTitle>
          <DialogDescription>
            Заполните анкету по бланку заявки — что везём, откуда и куда.
            Все поля необязательны, но чем полнее анкета, тем точнее расчёт.
            Менеджер увидит запрос сразу и свяжется с вами. В сутки можно
            отправить до {CLIENT_LEAD_DAILY_LIMIT} запросов.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <CargoFormFields form={cargo} onChange={setCargo} />
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Отправить запрос
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
