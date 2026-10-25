'use client'

import { useState } from 'react'
import { Loader2, Plus, ShieldCheck, ShieldOff } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'

// v0.5.0 (P1-22): диалог создания этапа каталога — выезд из
// StageCatalogList.tsx (резка под лимит 300, RULES 2.14). Логика 1:1:
// новый этап в конец списка; флаг обязательности — только мастер
// (кнопка заблокирована с подписью, не спрятана).
export function StageCreateDialog({
  isMaster,
  onCreated,
}: {
  isMaster: boolean
  onCreated: () => void
}) {
  const { toast } = useToast()

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createCode, setCreateCode] = useState('')
  const [createMandatory, setCreateMandatory] = useState(false)

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
      onCreated()
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
  )
}
