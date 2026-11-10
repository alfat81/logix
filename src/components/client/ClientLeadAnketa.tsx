'use client'

// Поток A (integrity IC-09): анкета запроса кабинета клиента + диалог
// правки (P1-02) — вынесены из ClientLeadCard (RULES 2.14, файл ≤ 300).
import { useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
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
import { CargoFormFields, CargoGroups } from '@/components/admin/CargoGroups'
import {
  EMPTY_LEAD_CARGO_FORM,
  buildLeadPayload,
  cargoFormFromData,
  type LeadCargoForm,
} from '@/lib/leads'
import { readApiResponse } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'

type AnketaLead = {
  id: string
  cargoInfo: Record<string, unknown> | null
  originCity?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationCountry?: string | null
  transportType?: string | null
  readyDate?: string | null
  weightKg?: string | number | null
  volumeM3?: string | number | null
  placesCount?: number | null
  canEdit?: boolean
  order: { id: string; number: string } | null
}

export function ClientLeadAnketa({
  lead,
  reload,
}: {
  lead: AnketaLead
  reload: () => void
}) {
  const { toast } = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [cargo, setCargo] = useState<LeadCargoForm>({ ...EMPTY_LEAD_CARGO_FORM })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editOpen && lead) {
      // P1-03: форма — из колонок маршрута + cargoInfo-rest
      setCargo(cargoFormFromData(lead))
    }
  }, [editOpen, lead])

  const saveAnketa = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/client/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildLeadPayload(cargo)),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить запрос')
      toast({ title: data.message || 'Запрос обновлён' })
      setEditOpen(false)
      reload()
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
        {/* Анкета, которую клиент отправлял (P1-02: правится до начала расчёта) */}
        <Card className="p-0">
          <CardContent className="p-4 grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Анкета запроса</h2>
              {lead.canEdit && (
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Править запрос
                </Button>
              )}
            </div>
            {lead.canEdit && (
              <p className="text-xs text-muted-foreground">
                Пока менеджер не начал расчёт, вы можете уточнить данные запроса —
                изменения увидит ваш менеджер.
              </p>
            )}
            <CargoGroups
              route={lead}
              cargoInfo={lead.cargoInfo}
              emptyText="Анкета не заполнялась — запрос зарегистрирован без подробностей"
            />
          </CardContent>
        </Card>

        {/* P1-02: диалог правки анкеты груза (общий бланк с админкой) */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Правка запроса</DialogTitle>
              <DialogDescription>
                Уточните детали груза и маршрута — менеджер получит обновлённые
                данные и увидит, что именно изменилось.
              </DialogDescription>
            </DialogHeader>
            <CargoFormFields form={cargo} onChange={setCargo} />
            <DialogFooter>
              <Button onClick={saveAnketa} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

    </>
  )
}
