'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { useToast } from '@/hooks/use-toast'

// ─── Каталог этапов (Ж6б) ──────────────────────────────────────
// Справочник типовых этапов заявки. Три операции прямо из формули-
// ровки задачи: создание, порядок (стрелками — обмен с соседом),
// флаг обязательности. Права: всё, кроме флага, доступно любому
// сотруднику; флаг обязательности — ТОЛЬКО МАСТЕР, и UI честно это
// показывает (кнопка заблокирована с подписью), а не прячет.
//
// Предупреждение при смене флага (тоже из формулировки): защита
// «обязательное нельзя удалить» в УЖЕ СОЗДАННЫХ заявках сверяется с
// каталогом живым lookup'ом при каждом запросе — смена флага пересчи-
// тывается для всех заявок сразу. Ретроактивной подстановки нет: в
// существующие заявки этап сам не добавится, он подставляется только
// в новые. Поэтому смена требует явного подтверждения.
//
// Порядок и имя тоже про «живой справочник»: порядок задаёт подста-
// новку обязательных в новые заявки и список добавления этапа; имя
// читается заявками lookup'ом — правка названия отразится во всех
// существующих заявках сразу (без пересчёта их sequence).

type StageRow = {
  id: string
  code: string
  name: string
  order: number
  isMandatory: boolean
}

// Текст предупреждения — один и для кнопки в диалоге правки, и для
// блока подтверждения (чтобы формулировка не расползалась).
const MANDATORY_WARNING =
  'Защита пересчитывается по текущему значению справочника: обязательные этапы станет нельзя удалить из всех существующих заявок, снятие обязательности — разрешит удаление. В уже созданные заявки новый обязательный этап сам не добавится: он подставляется только в новые.'

export function StageCatalogList({ isMaster }: { isMaster: boolean }) {
  const { toast } = useToast()

  const [stages, setStages] = useState<StageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const reqId = useRef(0)

  // ── Диалог создания
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createCode, setCreateCode] = useState('')
  const [createMandatory, setCreateMandatory] = useState(false)

  // ── Диалог правки
  const [editRow, setEditRow] = useState<StageRow | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [editName, setEditName] = useState('')
  // Подтверждение смены флага: показывается в диалоге правки вместо
  // мгновенного PATCH — предупреждение из формулировки задачи.
  const [confirmFlag, setConfirmFlag] = useState(false)
  const [savingFlag, setSavingFlag] = useState(false)

  const reload = useCallback(() => {
    const id = ++reqId.current
    setLoading(true)
    fetch('/api/admin/stage-catalog')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        return data
      })
      .then((data: { catalog: StageRow[] }) => {
        if (id !== reqId.current) return
        setStages(data.catalog)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        toast({
          title: 'Не удалось загрузить каталог этапов',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false)
      })
  }, [toast])

  useEffect(() => {
    reload()
  }, [reload, version])

  // ── Перестановка (обмен с соседом) ───────────────────────────
  const handleMove = async (row: StageRow, move: 'up' | 'down') => {
    setMovingId(row.id)
    try {
      const res = await fetch(`/api/admin/stage-catalog/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ move }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось переместить этап')
      setVersion((v) => v + 1)
    } catch (e) {
      toast({
        title: 'Ошибка перемещения',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setMovingId(null)
    }
  }

  // ── Создание ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createName.trim()) {
      toast({ title: 'Укажите название этапа', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/stage-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          ...(createCode.trim() ? { code: createCode.trim() } : {}),
          ...(createMandatory ? { isMandatory: true } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось создать этап')

      toast({
        title: `Этап «${data.stage.name}» создан`,
        description: `Код: ${data.stage.code} · новый этап в конце списка`,
      })
      setCreateOpen(false)
      setCreateName('')
      setCreateCode('')
      setCreateMandatory(false)
      setVersion((v) => v + 1)
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

  // ── Правка имени ──────────────────────────────────────────────
  const openEdit = (row: StageRow) => {
    setEditRow(row)
    setEditName(row.name)
    setConfirmFlag(false)
  }

  const handleSaveName = async () => {
    if (!editRow) return
    if (!editName.trim()) {
      toast({ title: 'Укажите название этапа', variant: 'destructive' })
      return
    }
    if (editName.trim() === editRow.name) {
      setEditRow(null)
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/admin/stage-catalog/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить этап')

      toast({
        title: `Этап переименован в «${data.stage.name}»`,
        description: 'Название читается заявками из справочника — обновится во всех карточках.',
      })
      setEditRow(null)
      setVersion((v) => v + 1)
    } catch (e) {
      toast({
        title: 'Ошибка сохранения',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSavingName(false)
    }
  }

  // ── Смена флага обязательности (мастер, с подтверждением) ─────
  const handleToggleMandatory = async () => {
    if (!editRow) return
    setSavingFlag(true)
    try {
      const res = await fetch(`/api/admin/stage-catalog/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMandatory: !editRow.isMandatory }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить флаг')

      toast({
        title: data.stage.isMandatory
          ? `Этап «${data.stage.name}» теперь обязательный`
          : `С обязательности «${data.stage.name}» снят флаг`,
        description: MANDATORY_WARNING,
      })
      setEditRow(null)
      setVersion((v) => v + 1)
    } catch (e) {
      toast({
        title: 'Ошибка изменения флага',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSavingFlag(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Этапы</h1>
          <p className="text-sm text-muted-foreground">
            Типовые этапы заявки · порядок задаёт подстановку в новые заявки · название
            меняется во всех заявках сразу
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Новый этап
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Новый этап каталога</DialogTitle>
              <DialogDescription>
                Новый этап добавляется в конец списка (порядок потом меняется стрелками)
                и становится доступен менеджерам для добавления в заявки.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="stage-name">Название</Label>
                <Input
                  id="stage-name"
                  placeholder="Например: Сертификация товара"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stage-code">Код</Label>
                <Input
                  id="stage-code"
                  placeholder="оставьте пустым — сгенерируем"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Технический идентификатор для связи с заявками: латиница, цифры и
                  подчёркивание (например, warehouse_storage). После создания не меняется.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Обязательность</Label>
                <Button
                  type="button"
                  variant={createMandatory ? 'default' : 'outline'}
                  aria-pressed={createMandatory}
                  disabled={!isMaster}
                  onClick={() => setCreateMandatory((v) => !v)}
                  className="justify-start"
                >
                  {createMandatory ? (
                    <ShieldCheck className="size-4" />
                  ) : (
                    <ShieldOff className="size-4" />
                  )}
                  {createMandatory ? 'Обязательный — подставится в каждую новую заявку' : 'Необязательный — добавляется вручную'}
                </Button>
                {!isMaster && (
                  <p className="text-xs text-muted-foreground">
                    Обязательным этап делает только мастер — сразу при создании или позже.
                  </p>
                )}
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
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : stages.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Каталог пуст — добавьте первый этап.
        </Card>
      ) : (
        <div className="grid gap-2">
          {stages.map((row, i) => (
            <Card key={row.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Переместить «${row.name}» выше`}
                  disabled={i === 0 || movingId !== null}
                  onClick={() => handleMove(row, 'up')}
                >
                  {movingId === row.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Переместить «${row.name}» ниже`}
                  disabled={i === stages.length - 1 || movingId !== null}
                  onClick={() => handleMove(row, 'down')}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
              <div className="min-w-40 flex-1">
                <div className="font-medium flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                  {row.name}
                  {row.isMandatory && (
                    <Badge title={MANDATORY_WARNING}>Обязательный</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate">{row.code}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                <Pencil className="size-4" />
                Править
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* ── Диалог правки: имя + флаг обязательности ── */}
      <Dialog open={editRow !== null} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="sm:max-w-md">
          {editRow && (
            <>
              <DialogHeader>
                <DialogTitle>Правка этапа</DialogTitle>
                <DialogDescription>
                  Код <span className="font-mono">{editRow.code}</span> неизменен — по нему
                  заявки ссылаются на этап.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="stage-edit-name">Название</Label>
                  <Input
                    id="stage-edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Отражается во всех существующих заявках (справочник читается живым
                    lookup'ом, не снимком).
                  </p>
                </div>

                <div className="grid gap-2 rounded-md border p-3">
                  <Label>Обязательность</Label>
                  {!confirmFlag ? (
                    <>
                      <Button
                        variant="outline"
                        disabled={!isMaster}
                        onClick={() => setConfirmFlag(true)}
                        className="justify-start"
                      >
                        {editRow.isMandatory ? (
                          <ShieldOff className="size-4" />
                        ) : (
                          <ShieldCheck className="size-4" />
                        )}
                        {editRow.isMandatory
                          ? 'Снять обязательность'
                          : 'Сделать обязательным'}
                      </Button>
                      {!isMaster ? (
                        <p className="text-xs text-muted-foreground">
                          Флаг обязательности меняет только мастер.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{MANDATORY_WARNING}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm">{MANDATORY_WARNING}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setConfirmFlag(false)}
                          disabled={savingFlag}
                        >
                          Отмена
                        </Button>
                        <Button onClick={handleToggleMandatory} disabled={savingFlag}>
                          {savingFlag && <Loader2 className="size-4 animate-spin" />}
                          Подтвердить
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSaveName} disabled={savingName || savingFlag}>
                  {savingName && <Loader2 className="size-4 animate-spin" />}
                  Сохранить название
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
