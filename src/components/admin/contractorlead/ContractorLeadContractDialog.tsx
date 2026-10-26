'use client'

import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { TRANSPORT_TYPES } from '@/lib/leads'
import {
  mergeTransportChips,
  readInfoString,
  readTransportChips,
} from '@/lib/contractors'
import { TransportChips } from './TransportChips'
import type { ContractorLeadRow } from './types'

// ─── Форма перевода в пул (рождение подрядчика, Г2) ────────────────
// v0.5.0 (P1-22): выезд из ContractorLeadsSection.tsx (резка под
// лимит 300, RULES 2.14). Логика 1:1: предзаполнение из анкеты
// кандидата (телефон — будущий логин ЛК, чипы — из transportTypes,
// чужие значения merge сохранит), валидация телефона и пароля.
export type ContractForm = {
  phone: string
  password: string
  transports: string[]
  directions: string
  contractNumber: string
  contractSignedAt: string
  comment: string
}

const EMPTY_CONTRACT_FORM: ContractForm = {
  phone: '',
  password: '',
  transports: [],
  directions: '',
  contractNumber: '',
  contractSignedAt: '',
  comment: '',
}

const toggleChip = (v: string, arr: string[], set: (next: string[]) => void) =>
  set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

// D31 (DF-00C): при заморозке кабинета пароль подрядчику никто не передаёт,
// но API рождения подрядчика требует пароль (сервер хранит хэш). Клиент
// генерирует случайный самостоятельно — войти с ним нельзя до разморозки
// (портал отвечает 404), переиспользование логики API сохраняется.
function generateHiddenPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export function ContractorLeadContractDialog({
  lead,
  portalEnabled,
  onClose,
  patchLead,
  onContractorBorn,
}: {
  lead: ContractorLeadRow | null
  // D31 (DF-00C): кабинет заморожен — поле стартового пароля скрыто,
  // вместо него клиент сам генерирует случайный (API и e2e не меняются)
  portalEnabled: boolean
  onClose: () => void
  patchLead: (lead: ContractorLeadRow, body: Record<string, unknown>) => Promise<boolean>
  onContractorBorn?: () => void
}) {
  const { toast } = useToast()

  const [contractForm, setContractForm] = useState<ContractForm>({ ...EMPTY_CONTRACT_FORM })
  const [contracting, setContracting] = useState(false)

  // Предзаполнение из анкеты при каждом открытии (lead/open меняются
  // вместе — диалог открывается только для конкретного кандидата)
  useEffect(() => {
    if (!lead) return
    const raw = lead.rawInfo ?? {}
    setContractForm({
      ...EMPTY_CONTRACT_FORM,
      phone: readInfoString(raw.phone),
      // D31: при заморозке пароль не выдаётся — случайный вместо вводимого
      password: portalEnabled ? '' : generateHiddenPassword(),
      transports: readTransportChips(raw.transportTypes).filter((t) =>
        (TRANSPORT_TYPES as readonly string[]).includes(t)
      ),
      directions: readInfoString(raw.directions),
    })
  }, [lead, portalEnabled])

  const handleContract = async () => {
    if (!lead) return
    const f = contractForm
    if (!f.phone.trim()) {
      toast({ title: 'Укажите телефон — это логин подрядчика в ЛК', variant: 'destructive' })
      return
    }
    if (f.password.length < 6) {
      toast({ title: 'Стартовый пароль — минимум 6 символов', variant: 'destructive' })
      return
    }
    setContracting(true)
    const ok = await patchLead(lead, {
      status: 'contracted',
      phone: f.phone.trim(),
      password: f.password,
      competencies: {
        transportModes: mergeTransportChips(lead.rawInfo?.transportTypes, f.transports),
        ...(f.directions.trim() ? { directions: f.directions.trim() } : {}),
      },
      ...(f.contractNumber.trim() ? { contractNumber: f.contractNumber.trim() } : {}),
      ...(f.contractSignedAt ? { contractSignedAt: f.contractSignedAt } : {}),
      ...(f.comment.trim() ? { comment: f.comment.trim() } : {}),
    })
    setContracting(false)
    if (ok) {
      onClose()
      // Родился подрядчик — пул на этой же странице должен его
      // увидеть без ручного дерганья фильтра (страница даёт сигнал).
      onContractorBorn?.()
    }
  }

  return (
    <Dialog open={lead !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Перевести в пул — {lead?.companyName}</DialogTitle>
          {portalEnabled ? (
            <DialogDescription>
              Рождается подрядчик со входом в урезанный ЛК. Телефон — логин (нормализуется
              сервером), пароль передайте подрядчику.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Кабинет подрядчика заморожен (D31): вход не выдаётся, пароль будет сгенерирован
              автоматически. Телефон — контакт и будущий логин на случай разморозки.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Телефон (логин ЛК)</Label>
              <Input
                type="tel"
                placeholder="+7 900 000-00-00"
                value={contractForm.phone}
                onChange={(e) => setContractForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            {/* D31 (DF-00C): поле выдачи пароля — только при включённом кабинете */}
            {portalEnabled && (
              <div className="grid gap-1.5">
                <Label>Стартовый пароль</Label>
                <Input
                  type="text"
                  placeholder="Минимум 6 символов"
                  value={contractForm.password}
                  onChange={(e) => setContractForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Компетенции — виды транспорта</Label>
            <TransportChips
              selected={contractForm.transports}
              onToggle={(v) =>
                toggleChip(v, contractForm.transports, (next) =>
                  setContractForm((f) => ({ ...f, transports: next }))
                )
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Зоны работы</Label>
            <Input
              placeholder="Например: Китай — РФ, СНГ"
              value={contractForm.directions}
              onChange={(e) => setContractForm((f) => ({ ...f, directions: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Номер договора — не обязателен</Label>
              <Input
                placeholder="Например: 0105/1-СВ"
                value={contractForm.contractNumber}
                onChange={(e) => setContractForm((f) => ({ ...f, contractNumber: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Дата договора</Label>
              <Input
                type="date"
                value={contractForm.contractSignedAt}
                onChange={(e) => setContractForm((f) => ({ ...f, contractSignedAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Комментарий — не обязателен</Label>
            <Textarea
              rows={2}
              placeholder="Заметка менеджера о подрядчике"
              value={contractForm.comment}
              onChange={(e) => setContractForm((f) => ({ ...f, comment: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleContract} disabled={contracting}>
            {contracting && <Loader2 className="size-4 animate-spin" />}
            Создать подрядчика и перевести в пул
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
