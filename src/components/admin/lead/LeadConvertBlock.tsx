'use client'

// Блок конвертации лида в заявку (В4) — вынесен из LeadCard при резке
// (P1-19). Кнопка с подсказкой + диалог (юрлицо/Инкотермс/ТН ВЭД);
// справочник юрлиц грузится при первом открытии. После успеха —
// переход на свежую заявку (там этапы и статус — следить удобно).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { readLeadCargo } from '@/lib/leads'
import { IncotermPicker } from '@/components/references/IncotermPicker'
import type { RefPick } from '@/components/references/ReferenceCombobox'
import type { LegalEntityRow } from './types'

export function LeadConvertBlock({
  leadId,
  cargoInfo,
  canConvert,
  // DF-17: условие поставки из запроса клиента (Lead.incotermCode) —
  // предзаполняется, менеджер может изменить при конвертации
  initialIncotermCode,
}: {
  leadId: string
  cargoInfo: Record<string, unknown> | null
  canConvert: boolean
  initialIncotermCode?: string | null
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [convertOpen, setConvertOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [legalEntities, setLegalEntities] = useState<LegalEntityRow[]>([])
  const [legalEntityId, setLegalEntityId] = useState('')
  const [incotermCode, setIncotermCode] = useState('')
  const [hsCode, setHsCode] = useState('')

  // Справочник юрлиц — при первом открытии диалога конвертации
  useEffect(() => {
    if (!convertOpen || legalEntities.length) return
    fetch('/api/admin/legal-entities')
      .then((r) => r.json())
      .then((d) => setLegalEntities(d.legalEntities ?? []))
      .catch(() => {})
  }, [convertOpen, legalEntities.length])

  const openConvert = () => {
    // ТН ВЭД предзаполняем из анкеты (бланк п.5); Инкотермс — из запроса
    // клиента (DF-17), иначе пусто
    const hs = readLeadCargo(cargoInfo).hsCode
    setHsCode(typeof hs === 'string' ? hs : '')
    setLegalEntityId('')
    setIncotermCode(initialIncotermCode ?? '')
    setConvertOpen(true)
  }

  const doConvert = async () => {
    if (!legalEntityId) {
      toast({ title: 'Выберите юрлицо', variant: 'destructive' })
      return
    }
    setConverting(true)
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalEntityId,
          // DF-17: условие поставки — КОД из справочника (легаси-ключ
          // incoterm больше не пишем — API принимает код)
          incotermCode: incotermCode || null,
          hsCode: hsCode.trim() || null,
        }),
      })
      const data = await readApiResponse<{
        order: { id: string }
        message?: string
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось конвертировать')
      toast({ title: data.message || 'Заявка создана' })
      setConvertOpen(false)
      // Сразу к свежей заявке: там этапы и статус — следить удобно
      router.push(`/admin/orders/${data.order.id}`)
    } catch (e) {
      toast({
        title: 'Ошибка конвертации',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setConverting(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openConvert} disabled={!canConvert}>
          Конвертировать в заявку
        </Button>
        {!canConvert && (
          <span className="text-sm text-muted-foreground">
            Выберите вариант расчёта — на нём построятся условия заявки
          </span>
        )}
      </div>

      {/* Диалог: конвертация в заявку (В4) */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Конвертировать в заявку</DialogTitle>
            <DialogDescription>
              Клиент найдётся или родится из контактов запроса, договор пары
              клиент+юрлицо и заявка с обязательными этапами создадутся
              автоматически. Повторная конвертация невозможна.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Наше юрлицо</Label>
              <Select value={legalEntityId} onValueChange={setLegalEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Юрлицо договора" />
                </SelectTrigger>
                <SelectContent>
                  {legalEntities.map((le) => (
                    <SelectItem key={le.id} value={le.id}>
                      {le.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* DF-17: Инкотермс — Combobox справочника с разъяснением (IC-16) */}
              <div className="col-span-2">
                <IncotermPicker
                  value={incotermCode}
                  onPick={(pick: RefPick) => setIncotermCode(pick && pick.code ? pick.code : '')}
                  label="Условия поставки (Инкотермс) — не обязательно"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cv-hs">Код ТН ВЭД</Label>
                <Input
                  id="cv-hs"
                  placeholder="Необязательно"
                  value={hsCode}
                  onChange={(e) => setHsCode(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doConvert} disabled={converting}>
              {converting && <Loader2 className="size-4 animate-spin" />}
              Создать заявку
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
