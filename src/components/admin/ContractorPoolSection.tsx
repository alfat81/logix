'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, ShieldOff, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { TransportChips } from '@/components/admin/ContractorLeadsSection'
import {
  COMPETENCIES_DIRECTIONS_KEY,
  COMPETENCIES_TRANSPORT_KEY,
  mergeTransportChips,
  readInfoString,
  readTransportChips,
} from '@/lib/contractors'
import { TRANSPORT_TYPES } from '@/lib/leads'

// ─── Пул подрядчиков (Г5) ──────────────────────────────────────────
// Справочник Contractor (Г3): GET ?active= витрина пула против
// исключённых. Правка профиля — PATCH (телефон = логин ЛК, нормализация
// и занятость — на сервере, 409 при коллизии), компетенции — чипы
// TRANSPORT_TYPES, договорные поля/комментарий пустой строкой
// осознанно очищаются (паттерн incoterm Б3). Исключение из пула —
// МЯГКОЕ (isActive=false): на новые этапы не назначается, но вход в
// ЛК и текущие назначения живут; DELETE у справочника нет вовсе.

type ContractorRow = {
  id: string
  companyName: string
  phone: string
  competencies: Record<string, unknown> | null
  contactInfo: Record<string, unknown> | null
  contractNumber: string | null
  contractSignedAt: string | null
  isActive: boolean
  comment: string | null
  createdAt: string
  _count: { stages: number }
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : ''

type PoolFilter = 'all' | 'active' | 'excluded'

type PoolForm = {
  companyName: string
  phone: string
  password: string
  transports: string[]
  directions: string
  contractNumber: string
  contractSignedAt: string
  comment: string
}

export function ContractorPoolSection({
  refreshKey = 0,
  onContractorChanged,
}: {
  refreshKey?: number
  onContractorChanged?: () => void
}) {
  const { toast } = useToast()

  const [contractors, setContractors] = useState<ContractorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PoolFilter>('active')

  // Диалог правки профиля
  const [selected, setSelected] = useState<ContractorRow | null>(null)
  const [form, setForm] = useState<PoolForm | null>(null)
  const [saving, setSaving] = useState(false)

  // Исключение/возврат (мягкое, isActive)
  const [toggleOpen, setToggleOpen] = useState(false)
  const [toggling, setToggling] = useState(false)

  const load = useCallback(
    async (f: PoolFilter) => {
      setLoading(true)
      try {
        const url =
          f === 'all'
            ? '/api/admin/contractors'
            : `/api/admin/contractors?active=${f === 'active'}`
        const res = await fetch(url)
        const data = await readApiResponse<{ contractors: ContractorRow[]; error?: string }>(res)
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        setContractors(data.contractors)
      } catch (e) {
        toast({
          title: 'Не удалось загрузить пул',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    load(filter)
  }, [filter, load, refreshKey])

  // Диалогу нужен свежий ряд после мутаций (исключён/возвращён)
  const current = selected ? contractors.find((c) => c.id === selected.id) ?? selected : null

  const openEdit = (c: ContractorRow) => {
    setSelected(c)
    const comps = c.competencies ?? {}
    setForm({
      companyName: c.companyName,
      phone: c.phone,
      password: '',
      // Чипы — только известные значения TRANSPORT_TYPES; чужие значения
      // mergeTransportChips при сохранении не потеряет.
      transports: readTransportChips(comps[COMPETENCIES_TRANSPORT_KEY]).filter((t) =>
        (TRANSPORT_TYPES as readonly string[]).includes(t)
      ),
      directions: readInfoString(comps[COMPETENCIES_DIRECTIONS_KEY]),
      contractNumber: c.contractNumber ?? '',
      contractSignedAt: c.contractSignedAt ? c.contractSignedAt.slice(0, 10) : '',
      comment: c.comment ?? '',
    })
  }

  const handleSave = async () => {
    if (!current || !form) return
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
      const comps = current.competencies ?? {}
      const res = await fetch(`/api/admin/contractors/${current.id}`, {
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
      setSelected(null)
      await load(filter)
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

  // Мягкое исключение/возврат — отдельный PATCH isActive (Г3): тост
  // говорит, что именно произошло, а не «Сохранено».
  const handleToggleActive = async () => {
    if (!current) return
    setToggling(true)
    try {
      const res = await fetch(`/api/admin/contractors/${current.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current.isActive }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить')
      toast({ title: data.message || 'Обновлено' })
      setToggleOpen(false)
      await load(filter)
      // Статус пула (в пуле/исключён) отражается в карточке кандидата —
      // сигнал воронке перечитать список.
      onContractorChanged?.()
      // Диалог остаётся открытым для немедленного отката («Вернуть»),
      // но подрядчик только что ПОКИНУЛ текущий фильтр (в пуле →
      // исключённые) и из перечитанного списка его не достать —
      // добираем свежий ряд напрямую, иначе current откатится к
      // устаревшему selected с бейджем «в пуле».
      const fresh = await fetch('/api/admin/contractors').then((r) =>
        readApiResponse<{ contractors: ContractorRow[] }>(r)
      )
      const me = fresh.contractors?.find((c) => c.id === current.id)
      if (me) setSelected(me)
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setToggling(false)
    }
  }

  const toggleChip = (v: string, arr: string[], set: (next: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Пул</h2>
          <p className="text-sm text-muted-foreground">
            Квалифицированные исполнители. Исключение — мягкое: новые назначения блокируются,
            текущие этапы и вход в ЛК живут
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['active', 'В пуле'],
            ['excluded', 'Исключённые'],
            ['all', 'Все'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : contractors.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {filter === 'active'
            ? 'Пул пуст — переведите первого кандидата в квалификации.'
            : filter === 'excluded'
              ? 'Исключённых подрядчиков нет.'
              : 'Подрядчиков пока нет.'}
        </Card>
      ) : (
        <div className="grid gap-2">
          {contractors.map((c) => {
            const chips = readTransportChips((c.competencies ?? {})[COMPETENCIES_TRANSPORT_KEY])
            const directions = readInfoString((c.competencies ?? {})[COMPETENCIES_DIRECTIONS_KEY])
            return (
              <Card
                key={c.id}
                className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 cursor-pointer transition-colors hover:border-ring"
                onClick={() => openEdit(c)}
              >
                <div className="min-w-44 flex-1">
                  <div className="font-medium truncate">{c.companyName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.phone}
                    {c.contractNumber ? ` · договор № ${c.contractNumber}` : ''}
                    {c.contractSignedAt ? ` от ${fmtDate(c.contractSignedAt)}` : ''}
                  </div>
                  {c.comment && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{c.comment}</div>
                  )}
                </div>
                <div className="min-w-36 flex-1">
                  <div className="flex flex-wrap gap-1">
                    {chips.length ? (
                      chips.map((t) => (
                        <Badge key={t} variant="outline" className="text-xxs">
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">компетенции не указаны</span>
                    )}
                  </div>
                  {directions && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{directions}</div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground whitespace-nowrap">
                  {c._count.stages > 0 ? `${c._count.stages} этап(ов) назначено` : 'без назначений'}
                </div>
                {c.isActive ? (
                  <Badge className="bg-success text-success-foreground border-transparent" variant="outline">
                    в пуле
                  </Badge>
                ) : (
                  <Badge className="bg-destructive text-destructive-foreground border-transparent" variant="outline">
                    исключён
                  </Badge>
                )}
                <Pencil className="size-4 text-muted-foreground" />
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Диалог правки профиля подрядчика ─────────────────────── */}
      <Dialog open={!!current && !!form} onOpenChange={(open) => !open && setSelected(null)}>
        {current && form && (
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {current.companyName}
                {current.isActive ? (
                  <Badge className="bg-success text-success-foreground border-transparent" variant="outline">
                    в пуле
                  </Badge>
                ) : (
                  <Badge className="bg-destructive text-destructive-foreground border-transparent" variant="outline">
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
                variant={current.isActive ? 'destructive' : 'outline'}
                onClick={() => setToggleOpen(true)}
              >
                {current.isActive ? (
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

      {/* ── Подтверждение исключения/возврата ────────────────────── */}
      <Dialog open={toggleOpen} onOpenChange={setToggleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {current?.isActive
                ? `Исключить «${current?.companyName}» из пула?`
                : `Вернуть «${current?.companyName}» в пул?`}
            </DialogTitle>
            <DialogDescription>
              {current?.isActive
                ? 'Мягкое исключение: на новые этапы подрядчик не назначается, но вход в ЛК и текущие назначения живут — сорванные перевозки недопустимы.'
                : 'Подрядчик снова доступен для назначения на этапы.'}
              {current && current.isActive && current._count.stages > 0
                ? ` Сейчас назначено этапов: ${current._count.stages}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleOpen(false)}>
              Отмена
            </Button>
            <Button
              variant={current?.isActive ? 'destructive' : 'default'}
              onClick={handleToggleActive}
              disabled={toggling}
            >
              {toggling && <Loader2 className="size-4 animate-spin" />}
              {current?.isActive ? 'Исключить' : 'Вернуть'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
