'use client'

import { useState } from 'react'
import { Loader2, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { NOTE_MAX_LENGTH } from '@/lib/note-constants'

// ─── Форма внутренней заметки (Ж3) ─────────────────────────────────
// Одна и та же форма на карточках заявки и лида: заметка пишется в
// общий журнал (type note_added, isInternal: true) и сразу попадает в
// ленту под формой. Подрядчику и клиенту заметки не видны — флаг
// isInternal держат внешние read-контексты (ACTIVITY_EXTERNAL_WHERE).

export function NoteForm({
  targetType,
  targetId,
  onAdded,
}: {
  targetType: 'order' | 'lead'
  targetId: string
  onAdded: () => void
}) {
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed) {
      toast({ title: 'Напишите текст заметки', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const base = targetType === 'order' ? 'orders' : 'leads'
      const res = await fetch(`/api/admin/${base}/${targetId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      })
      const data = await readApiResponse<{ message?: string; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения')
      toast({ title: data.message || 'Заметка добавлена' })
      setText('')
      onAdded()
    } catch (e) {
      toast({
        title: 'Не удалось сохранить заметку',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <StickyNote className="size-4 text-muted-foreground" />
          Внутренняя заметка
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Textarea
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Видна только сотрудникам — например: договор согласовывается с юристом, ждать до пятницы"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Подрядчику и клиенту заметки не видны
          </span>
          <Button size="sm" onClick={submit} disabled={saving || !text.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Добавить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
