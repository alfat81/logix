'use client'

// ── Ж1: суть заявки — груз и маршрут (вынесено из page.tsx, P1-19) ──
// Карточка показа (CargoGroups — общий бланк лида и заявки) + диалог
// правки: тот же бланк, что у создания лида (CargoFormFields); заявки
// без лида заполняются с нуля, конвертированные — правятся поверх
// снимка. Сохранение — полная замена cargoInfo (null = очистить).
import { useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { CargoGroups, CargoFormFields } from '@/components/admin/CargoGroups'
import {
  buildLeadPayload,
  cargoFormFromData,
  EMPTY_LEAD_CARGO_FORM,
  type LeadCargoForm,
} from '@/lib/leads'

export function OrderCargoCard({
  orderId,
  route,
  cargoInfo,
  onChanged,
}: {
  orderId: string
  // route — колонки маршрута (P1-03): origin/destination/transport/…,
  // показ идёт общим компонентом, правка — полная замена
  route: Record<string, unknown>
  cargoInfo: Record<string, unknown> | null
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [cargoOpen, setCargoOpen] = useState(false)
  const [cargoForm, setCargoForm] = useState<LeadCargoForm>({ ...EMPTY_LEAD_CARGO_FORM })
  const [savingCargo, setSavingCargo] = useState(false)

  const openCargoEdit = () => {
    // P1-03: форма собирается из колонок маршрута + cargoInfo-rest
    // (cargoFormFromData — толерантно к чужой форме Json)
    setCargoForm(cargoFormFromData(route))
    setCargoOpen(true)
  }

  const saveCargo = async () => {
    setSavingCargo(true)
    try {
      // buildLeadPayload: маршрут/метрики → route (колонки),
      // остальное бланка → cargoInfo (v: 1); null = очистить
      const { route: routePayload, cargo } = buildLeadPayload(cargoForm)
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: routePayload, cargoInfo: cargo }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) {
        toast({ title: data.error || 'Ошибка', variant: 'destructive' })
        return
      }
      toast({ title: data.message || 'Обновлено' })
      setCargoOpen(false)
      onChanged()
    } finally {
      setSavingCargo(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Груз и маршрут</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={openCargoEdit}
            title="Править груз и маршрут"
          >
            <Pencil className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <CargoGroups
            route={route}
            cargoInfo={cargoInfo}
            emptyText="Груз и маршрут не заполнены — у заявки без запроса бланк пуст, заполните правкой"
          />
        </CardContent>
      </Card>

      {/* Диалог правки груза и маршрута */}
      <Dialog open={cargoOpen} onOpenChange={setCargoOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Груз и маршрут</DialogTitle>
            <DialogDescription>
              Бланк типовой заявки клиента. Пустые поля не сохраняются,
              очистка всех полей снимает груз с заявки.
            </DialogDescription>
          </DialogHeader>
          <CargoFormFields form={cargoForm} onChange={setCargoForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCargoOpen(false)}>
              Отмена
            </Button>
            <Button onClick={saveCargo} disabled={savingCargo}>
              {savingCargo && <Loader2 className="size-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
