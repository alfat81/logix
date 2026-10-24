'use client'

import { useEffect, useState } from 'react'
import { FilePlus2, Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { formatPhoneInput, normalizePhone } from '@/lib/phone'
import { CARGO_PROFILES, CARGO_PROFILE_LABELS } from '@/lib/order-constants'

// v0.3.1: диалог создания заявки — выезд из OrdersList.tsx (638 →
// два файла, RULES 2.14 / D15). Логика и тексты 1:1: клиент либо
// существующий (id), либо новый (имя+телефон); договор пары
// клиент+юрлицо находит/создаёт API, обязательные этапы подставляет
// каталог (Б3+Б4).

type CustomerRow = { id: string; name: string; phone: string | null }
type LegalEntityRow = { id: string; name: string }

const INCOTERMS = ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']

export function OrderCreateDialog({
  onCreated,
}: {
  // Успешное создание: родитель сбрасывает список (version) и делает
  // router.refresh() — здесь роутер не трогаем (одна ответственность).
  onCreated: (number: string) => void
}) {
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  // Форма создания: клиент либо существующий (id), либо новый (имя+телефон)
  const [customerId, setCustomerId] = useState<string>('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [isNewCustomer, setIsNewCustomer] = useState(false)
  const [legalEntityId, setLegalEntityId] = useState('')
  const [incoterm, setIncoterm] = useState('none')
  const [hsCode, setHsCode] = useState('')
  const [cargoProfile, setCargoProfile] = useState('standard')

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [legalEntities, setLegalEntities] = useState<LegalEntityRow[]>([])

  // Справочники для диалога — грузим один раз при открытии
  useEffect(() => {
    if (!open || customers.length || legalEntities.length) return
    fetch('/api/admin/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {})
    fetch('/api/admin/legal-entities')
      .then((r) => r.json())
      .then((d) => setLegalEntities(d.legalEntities ?? []))
      .catch(() => {})
  }, [open, customers.length, legalEntities.length])

  const resetForm = () => {
    setCustomerId('')
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setIsNewCustomer(false)
    setIncoterm('none')
    setHsCode('')
    setCargoProfile('standard')
  }

  const handleCreate = async () => {
    if (isNewCustomer && !customerName.trim()) {
      toast({ title: 'Укажите имя клиента', variant: 'destructive' })
      return
    }
    if (!isNewCustomer && !customerId) {
      toast({ title: 'Выберите клиента', variant: 'destructive' })
      return
    }
    if (!legalEntityId) {
      toast({ title: 'Выберите юрлицо', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNewCustomer
            ? {
                customerName: customerName.trim(),
                customerPhone: customerPhone ? normalizePhone(customerPhone) : null,
                customerEmail: customerEmail.trim() || null,
              }
            : { customerId }),
          legalEntityId,
          incoterm: incoterm === 'none' ? null : incoterm,
          hsCode: hsCode.trim() || null,
          cargoProfile,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать заявку')

      toast({
        title: `Заявка ${data.order.number} создана`,
        description: 'Обязательные этапы подставлены автоматически',
      })
      setOpen(false)
      resetForm()
      onCreated(data.order.number)
    } catch (e) {
      toast({
        title: 'Ошибка создания',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FilePlus2 />
          Новая заявка
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новая заявка</DialogTitle>
          <DialogDescription>
            Договор пары клиент+юрлицо подставится автоматически, обязательные
            этапы — из каталога.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Клиент</Label>
            {isNewCustomer ? (
              <div className="grid gap-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Название или имя"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsNewCustomer(false)}
                  >
                    Из списка
                  </Button>
                </div>
                <Input
                  type="tel"
                  placeholder="Телефон +7 (…) — не обязателен"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(formatPhoneInput(e.target.value))}
                />
                <Input
                  type="email"
                  placeholder="Email — не обязателен"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите клиента" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="max-h-64 overflow-y-auto">
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` · ${c.phone}` : ''}
                        </SelectItem>
                      ))}
                    </div>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsNewCustomer(true)
                    setCustomerId('')
                  }}
                >
                  <Users className="size-4" />
                  Новый
                </Button>
              </div>
            )}
          </div>

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
            <div className="grid gap-2">
              <Label>Инкотермс</Label>
              <Select value={incoterm} onValueChange={setIncoterm}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {INCOTERMS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Груз</Label>
              <Select value={cargoProfile} onValueChange={setCargoProfile}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CARGO_PROFILES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {CARGO_PROFILE_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="hsCode">Код ТН ВЭД</Label>
            <Input
              id="hsCode"
              placeholder="Например, 8703 — необязательно"
              value={hsCode}
              onChange={(e) => setHsCode(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
