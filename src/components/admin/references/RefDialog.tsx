'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { REF_DIR_LABELS, type RefDir } from '@/lib/ref'
import type { RefDialogSave, RefRow } from './ref-types'

// ─── DF-17: диалог правки/добавления записи справочника ─────────────
// Вынесен из ReferencesScreen (лимит 300 строк компонента, RULES 2.14).
// Код записи при правке НЕ показывается и не редактируется (API
// отвергает код — карточка DF-17: «код нельзя менять после использования»);
// при добавлении код обязателен и берётся из источника справочника.
export function RefDialog({
  open,
  dir,
  row,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean
  dir: RefDir
  row: RefRow | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (row: RefDialogSave) => void
}) {
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [code, setCode] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Синхронизация формы с выбранной строкой при каждом открытии
  useEffect(() => {
    if (open) {
      setName(row?.name ?? '')
      setNameEn(row?.nameEn ?? '')
      setCode(row?.code ?? '')
      setIsActive(row?.isActive ?? true)
    }
  }, [open, row])

  const submit = () => {
    onSave({
      ...(row ? { id: row.id } : {}),
      dir,
      ...(row ? {} : { code }),
      name: name.trim(),
      nameEn: nameEn.trim() || null,
      isActive,
      sortOrder: row?.sortOrder ?? 100,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? `Правка записи ${row.code}` : `Добавить в «${REF_DIR_LABELS[dir]}»`}</DialogTitle>
          <DialogDescription>
            {row
              ? 'Код записи неизменяем — на него ссылаются сделки. Подписи и включённость можно менять.'
              : 'Код — из источника справочника (не с потолка); дубль кода будет отклонён.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {!row && (
            <div className="grid gap-1.5">
              <Label htmlFor="ref-code">Код</Label>
              <Input
                id="ref-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Например: BX"
                className="font-mono"
                maxLength={10}
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="ref-name">Название (рус.)</Label>
            <Input id="ref-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ref-name-en">Название (англ.) — не обязательно</Label>
            <Input id="ref-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4"
            />
            Включено (видно в формах)
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !name.trim() || (!row && !code.trim())}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
