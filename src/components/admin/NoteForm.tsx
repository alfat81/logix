'use client'

import { useState } from 'react'
import { Loader2, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { NOTE_MAX_LENGTH } from '@/lib/note-constants'
import { cn } from '@/lib/utils'

// ─── Форма заметки (Ж3) ─────────────────────────────────────────────
// Одна и та же форма на карточках заявки и лида: заметка пишется в
// общий журнал (type note_added) и сразу попадает в ленту под формой.
//
// DF-21: переключатель «внутренняя / видна клиенту» (макет экрана
// «Заявки»): внутренняя — staff-only (аудитория ['staff'], как раньше),
// видимая клиенту — ['staff','client']: клиент сделки прочтёт её в
// журнале кабинета, брокеру и подрядчику она не отдаётся
// (eventWhereFor, lib/audience.ts).

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
  // DF-21: false — внутренняя (дефолт и поведение до DF-21)
  const [visibleToClient, setVisibleToClient] = useState(false)
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
        body: JSON.stringify({ text: trimmed, visibleToClient }),
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
          Заметка
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Textarea
          rows={2}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={
            visibleToClient
              ? 'Например: груз принят, ожидаем выхода на таможню — напишем, как пересечём границу'
              : 'Видна только сотрудникам — например: договор согласовывается с юристом, ждать до пятницы'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={saving}
        />
        {/* DF-21: переключатель аудитории — пара кнопок (паттерн фильтра
            списка), без красного (§3.3): это выбор, не сигнал.
            flex-wrap — мин-ширина строки не раздувает панель 320 px
            (узкая панель переносит подсказку на следующую строку). */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Кому видна заметка">
          <Button
            type="button"
            size="sm"
            variant={visibleToClient ? 'outline' : 'default'}
            onClick={() => setVisibleToClient(false)}
            aria-pressed={!visibleToClient}
          >
            Внутренняя
          </Button>
          <Button
            type="button"
            size="sm"
            variant={visibleToClient ? 'default' : 'outline'}
            onClick={() => setVisibleToClient(true)}
            aria-pressed={visibleToClient}
          >
            Видна клиенту
          </Button>
          <span
            className={cn(
              'ml-auto text-xs text-muted-foreground text-right',
              visibleToClient && 'text-foreground',
            )}
          >
            {visibleToClient ? 'Клиент сделки увидит в своём кабинете' : 'Подрядчику, брокеру и клиенту не видна'}
          </span>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={saving || !text.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Добавить
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
