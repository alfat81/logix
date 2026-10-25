'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { MANDATORY_WARNING, type StageRow } from './types'

// v0.5.0 (P1-22): диалог правки этапа (имя + флаг обязательности с
// подтверждением) — выезд из StageCatalogList.tsx (резка под лимит
// 300, RULES 2.14). Логика 1:1: код неизменен (по нему заявки ссылаются
// на этап); флаг — только мастер, подтверждение из формулировки задачи;
// смена флага пересчитывается для всех заявок сразу.
export function StageEditDialog({
  row,
  isMaster,
  onClose,
  onSaved,
}: {
  row: StageRow | null
  isMaster: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()

  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)
  // Подтверждение смены флага: показывается в диалоге правки вместо
  // мгновенного PATCH — предупреждение из формулировки задачи.
  const [confirmFlag, setConfirmFlag] = useState(false)
  const [savingFlag, setSavingFlag] = useState(false)

  // Поля наполняются заново при каждом открытии
  useEffect(() => {
    if (row) {
      setEditName(row.name)
      setConfirmFlag(false)
    }
  }, [row])

  const handleSaveName = async () => {
    if (!row) return
    if (!editName.trim()) {
      toast({ title: 'Укажите название этапа', variant: 'destructive' })
      return
    }
    if (editName.trim() === row.name) {
      onClose()
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/admin/stage-catalog/${row.id}`, {
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
      onSaved()
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

  const handleToggleMandatory = async () => {
    if (!row) return
    setSavingFlag(true)
    try {
      const res = await fetch(`/api/admin/stage-catalog/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMandatory: !row.isMandatory }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Не удалось изменить флаг')

      toast({
        title: data.stage.isMandatory
          ? `Этап «${data.stage.name}» теперь обязательный`
          : `С обязательности «${data.stage.name}» снят флаг`,
        description: MANDATORY_WARNING,
      })
      onSaved()
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
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>Правка этапа</DialogTitle>
              <DialogDescription>
                Код <span className="font-mono">{row.code}</span> неизменен — по нему
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
                      {row.isMandatory ? (
                        <ShieldOff className="size-4" />
                      ) : (
                        <ShieldCheck className="size-4" />
                      )}
                      {row.isMandatory
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
  )
}
