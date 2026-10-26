'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { TransportChips } from '@/components/admin/contractorlead/TransportChips'
import {
  COMPETENCIES_DIRECTIONS_KEY,
  COMPETENCIES_TRANSPORT_KEY,
  mergeTransportChips,
  readInfoString,
  readTransportChips,
} from '@/lib/contractors'
import { TRANSPORT_TYPES } from '@/lib/leads'
import { ContractorPoolToggleDialog } from './ContractorPoolToggleDialog'
import type { ContractorRow, PoolForm } from './types'

// v0.5.0 (P1-22): диалог правки профиля подрядчика + подтверждение
// исключения/возврата — выезд из ContractorPoolSection.tsx (резка под
// лимит 300, RULES 2.14). Логика 1:1: телефон = логин ЛК (нормализация
// и занятость — на сервере, 409 при коллизии), компетенции — чипы
// TRANSPORT_TYPES, договорные поля/комментарий пустой строкой
// осознанно очищаются (паттерн incoterm Б3); исключение — МЯГКОЕ
// (isActive=false), диалог остаётся открытым для немедленного отката.
export function ContractorPoolEditDialog({
  contractor,
  portalEnabled,
  onClose,
  onSaved,
  onReloaded,
  onRowFresh,
  onContractorChanged,
}: {
  contractor: ContractorRow | null
  // D31 (DF-00C): кабинет заморожен — поле смены пароля скрыто
  portalEnabled: boolean
  onClose: () => void
  onSaved: () => void
  onReloaded: () => void
  onRowFresh: (row: ContractorRow) => void
  onContractorChanged?: () => void
}) {
  const { toast } = useToast()

  const [toggleOpen, setToggleOpen] = useState(false)
  const [form, setForm] = useState<PoolForm | null>(null)
  const [saving, setSaving] = useState(false)

  const toggleChip = (v: string, arr: string[], set: (next: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  // Форма наполняется заново при каждом открытии (contractor изменился)
  useEffect(() => {
    if (!contractor) {
      setForm(null)
      return
    }
    const comps = contractor.competencies ?? {}
    setForm({
      companyName: contractor.companyName,
      phone: contractor.phone,
      password: '',
      // Чипы — только известные значения TRANSPORT_TYPES; чужие значения
      // mergeTransportChips при сохранении не потеряет.
      transports: readTransportChips(comps[COMPETENCIES_TRANSPORT_KEY]).filter((t) =>
        (TRANSPORT_TYPES as readonly string[]).includes(t)
      ),
      directions: readInfoString(comps[COMPETENCIES_DIRECTIONS_KEY]),
      contractNumber: contractor.contractNumber ?? '',
      contractSignedAt: contractor.contractSignedAt ? contractor.contractSignedAt.slice(0, 10) : '',
      comment: contractor.comment ?? '',
    })
  }, [contractor])

  const handleSave = async () => {
    if (!contractor || !form) return
    if (!form.companyName.trim()) {
      toast({ title: 'Укажите название компании', variant: 'destructive' })
      return
    }
    if (form.password && form.password.length < 6) {
      toast({ title: 'Новый пароль — минимум 6 символов', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const comps = contractor.competencies ?? {}
      const res = await fetch(`/api/admin/contractors/${contractor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          // Телефон/пароль отправляем только заполненными: пустое поле
          // в форме = «не менять», а не «очистить» (логин не бывает пустым)
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.password ? { password: form.password } : {}),
          competencies: {
            transportModes: mergeTransportChips(comps[COMPETENCIES_TRANSPORT_KEY], form.transports),
            ...(form.directions.trim() ? { directions: form.directions.trim() } : {}),
          },
          // Договорные поля/комментарий: пустая строка осознанно ОЧИЩАЕТ
          // (сервер приводит '' к null, паттерн incoterm Б3)
          contractNumber: form.contractNumber.trim(),
          contractSignedAt: form.contractSignedAt ? form.contractSignedAt : null,
          comment: form.comment.trim(),
        }),
      })
      const data = await readApiResponse<{ contractor?: ContractorRow; message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить')
      toast({ title: data.message || 'Сохранено' })
      onSaved()
      // Правка профиля видна и в воронке (карточка кандидата показывает
      // родившегося подрядчика) — даём странице сигнал перечитать.
      onContractorChanged?.()
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open={!!contractor && !!form} onOpenChange={(open) => !open && onClose()}>
        {contractor && form && (
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {contractor.companyName}
                {contractor.isActive ? (
                  <Badge variant="delivered">
                    в пуле
                  </Badge>
                ) : (
                  <Badge variant="version">
                    исключён
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Телефон — логин подрядчика в ЛК (нормализует сервер). Договорные поля и
                комментарий очищаются пустой строкой.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Компания</Label>
                  <Input
                    value={form.companyName}
                    onChange={(e) => setForm((f) => f && { ...f, companyName: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Телефон (логин)</Label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => f && { ...f, phone: e.target.value })}
                  />
                </div>
              </div>
              {/* D31 (DF-00C): выдача доступа заморожена — поле видно только
                  при CONTRACTOR_PORTAL_ENABLED=true; пустая форма = «не менять»,
                  поэтому при false пароль просто не отправляется */}
              {portalEnabled && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Новый пароль — заполните только для смены
                  </Label>
                  <Input
                    type="text"
                    placeholder="Минимум 6 символов"
                    value={form.password}
                    onChange={(e) => setForm((f) => f && { ...f, password: e.target.value })}
                  />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Компетенции — виды транспорта</Label>
                <TransportChips
                  selected={form.transports}
                  onToggle={(v) =>
                    toggleChip(v, form.transports, (next) =>
                      setForm((f) => f && { ...f, transports: next })
                    )
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Зоны работы</Label>
                <Input
                  placeholder="Например: Китай — РФ, СНГ"
                  value={form.directions}
                  onChange={(e) => setForm((f) => f && { ...f, directions: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Номер договора</Label>
                  <Input
                    value={form.contractNumber}
                    onChange={(e) => setForm((f) => f && { ...f, contractNumber: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Дата договора</Label>
                  <Input
                    type="date"
                    value={form.contractSignedAt}
                    onChange={(e) => setForm((f) => f && { ...f, contractSignedAt: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Комментарий</Label>
                <Textarea
                  rows={2}
                  placeholder="Заметка менеджера"
                  value={form.comment}
                  onChange={(e) => setForm((f) => f && { ...f, comment: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="flex-wrap gap-2 sm:flex-wrap">
              <Button
                variant={contractor.isActive ? 'destructive' : 'outline'}
                onClick={() => setToggleOpen(true)}
              >
                {contractor.isActive ? (
                  <>
                    <ShieldOff className="size-4" />
                    Исключить из пула
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-4" />
                    Вернуть в пул
                  </>
                )}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Подтверждение мягкого исключения/возврата — отдельный файл */}
      {contractor && (
      <ContractorPoolToggleDialog
        contractor={contractor}
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        onDone={onReloaded}
        onRowFresh={onRowFresh}
        onContractorChanged={onContractorChanged}
      />
      )}
    </>
  )
}