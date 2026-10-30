'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { PERMIT_WAIVED_REASON_MAX } from '@/lib/permits'
import type { PermitRowUi, PermitViewer } from './types'
import { PermitFormFields } from './parts/PermitFormFields'

// ─── DF-16: диалоги строки разрешительного (админ/брокер) ────────────
// Добавление — брокер и сотрудник (createUrl); правка полей и «не
// требуется» с причиной — только сотрудник (PATCH /api/admin/permits/[id]).
// Перевод в received в диалоге НЕТ — строка закрывается загрузкой
// документа (PermitUploadButton), как в API.
// ─── Добавление строки (кнопка «Добавить» в шапке секции) ────────────
export function PermitCreateDialog({
  createUrl,
  viewer,
  onCreated,
}: {
  createUrl: string
  viewer: PermitViewer
  onCreated: () => Promise<void>
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [providedBy, setProvidedBy] = useState('client')
  const [blocking, setBlocking] = useState('no')
  const [neededBy, setNeededBy] = useState('')
  const [staffNote, setStaffNote] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
      setProvidedBy('client')
      setBlocking('no')
      setNeededBy('')
      setStaffNote('')
    }
  }, [open])

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          providedBy,
          isBlocking: blocking === 'yes',
          ...(neededBy ? { neededBy } : {}),
          ...(viewer === 'staff' && staffNote.trim() ? { staffNote: staffNote.trim() } : {}),
        }),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось добавить')
      toast({ title: 'Разрешительный добавлен', description: title.trim() })
      setOpen(false)
      await onCreated()
    } catch (e) {
      toast({
        title: 'Не удалось добавить разрешительный',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Добавить
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Новый разрешительный документ</DialogTitle>
            <DialogDescription>
              Обязательство предоставить документ: кто, что и к какому сроку.
            </DialogDescription>
          </DialogHeader>
          <PermitFormFields
            idPrefix="permit-create"
            title={title}
            onTitle={setTitle}
            providedBy={providedBy}
            onProvidedBy={setProvidedBy}
            blocking={blocking}
            onBlocking={setBlocking}
            neededBy={neededBy}
            onNeededBy={setNeededBy}
            staffNote={staffNote}
            onStaffNote={setStaffNote}
            isStaff={viewer === 'staff'}
          />
          <DialogFooter>
            <Button onClick={() => void submit()} disabled={busy || !title.trim()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Правка строки (только сотрудник; статус через PATCH не меняется) ─
export function PermitEditDialog({
  permit,
  patchUrlFor,
  onSaved,
}: {
  permit: PermitRowUi
  patchUrlFor: (permitId: string) => string
  onSaved: () => Promise<void>
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState(permit.title)
  const [providedBy, setProvidedBy] = useState<string>(permit.providedBy)
  const [blocking, setBlocking] = useState(permit.isBlocking ? 'yes' : 'no')
  const [neededBy, setNeededBy] = useState(permit.neededBy ?? '')
  const [staffNote, setStaffNote] = useState(permit.staffNote ?? '')
  const [waiveReason, setWaiveReason] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(permit.title)
      setProvidedBy(permit.providedBy)
      setBlocking(permit.isBlocking ? 'yes' : 'no')
      setNeededBy(permit.neededBy ?? '')
      setStaffNote(permit.staffNote ?? '')
      setWaiveReason('')
    }
  }, [open, permit])

  const patch = async (body: Record<string, unknown>, okTitle: string) => {
    setBusy(true)
    try {
      const res = await fetch(patchUrlFor(permit.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить')
      toast({ title: okTitle })
      setOpen(false)
      await onSaved()
    } catch (e) {
      toast({
        title: 'Не удалось сохранить',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
        Править
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Правка разрешительного</DialogTitle>
            <DialogDescription>
              Статус «Получен» меняется только загрузкой документа прямо в строке.
            </DialogDescription>
          </DialogHeader>
          <PermitFormFields
            idPrefix="permit-edit"
            title={title}
            onTitle={setTitle}
            providedBy={providedBy}
            onProvidedBy={setProvidedBy}
            blocking={blocking}
            onBlocking={setBlocking}
            neededBy={neededBy}
            onNeededBy={setNeededBy}
            staffNote={staffNote}
            onStaffNote={setStaffNote}
            isStaff
          />
          <div className="grid gap-2 rounded-md border p-3">
            {permit.status === 'waived' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Отмечен не требуемым{permit.waivedReason ? `: ${permit.waivedReason}` : ''}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void patch({ status: 'pending' }, 'Строка вернулась в ожидание')}
                >
                  Вернуть в ожидание
                </Button>
              </>
            ) : (
              <>
                <Label htmlFor="permit-waive-reason">Не требуется — причина</Label>
                <Textarea
                  id="permit-waive-reason"
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                  placeholder="Например: товар не подлежит сертификации"
                  rows={2}
                  maxLength={PERMIT_WAIVED_REASON_MAX}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !waiveReason.trim()}
                  onClick={() =>
                    void patch(
                      { status: 'waived', waivedReason: waiveReason.trim() },
                      'Отмечено: не требуется'
                    )
                  }
                >
                  Отметить не требуемым
                </Button>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                void patch(
                  {
                    title: title.trim(),
                    providedBy,
                    isBlocking: blocking === 'yes',
                    neededBy: neededBy || null,
                    staffNote: staffNote.trim() || null,
                  },
                  'Сохранено'
                )
              }
              disabled={busy || !title.trim()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
