'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

// ─── Настройки системы (DF-00D, D32) — экран мастера ────────────────
// Один экран на весь реестр SETTINGS: группы, подписи и подсказки
// приходят из реестра (сервер), экран ничего не знает о конкретных
// ключах — новый ключ реестра появляется здесь сам (IC-15: «каждый
// ключ показан на экране»). Право защищает API; компонент рендерится
// только мастеру (страница отдаёт менеджеру заглушку ShieldOff).
//
// Брендбук §1–§5: токены (White-карточки, Ink-текст, muted-подписи),
// новых hex нет; сохранение — основное действие, сброс — вторичное.
// Типы повторяют ответ API локально: lib/settings.ts серверный
// (тянет db), импорт из клиентского компонента запрещён.

type SettingEntry = {
  key: string
  group: string
  uiType: 'time' | 'time_list' | 'number' | 'string' | 'text' | 'string_list'
  label: string
  hint: string
  defaultValue: string | number | string[]
  value: string | number | string[]
  isModified: boolean
  updatedByName: string | null
  updatedAt: string | null
}

type SettingsPageData = {
  groups: Record<string, string>
  settings: SettingEntry[]
}

// Значение → черновик поля: списки в строку (time_list через запятую,
// string_list построчно), число в строку.
function toDraft(v: string | number | string[], uiType: SettingEntry['uiType']): string {
  if (Array.isArray(v)) return uiType === 'time_list' ? v.join(', ') : v.join('\n')
  return String(v)
}

// Черновик → тело запроса. Пустые пункты списков выбрасываются;
// нечисловой мусор числа уходит строкой — валидатор API ответит
// понятным сообщением (экран не дублирует валидаторы, D32: реестр
// один, проверки в нём).
function fromDraft(d: string, uiType: SettingEntry['uiType']): unknown {
  if (uiType === 'time_list') return d.split(',').map((s) => s.trim()).filter(Boolean)
  if (uiType === 'string_list') return d.split('\n').map((s) => s.trim()).filter(Boolean)
  if (uiType === 'number') {
    const t = d.trim()
    if (!t) return t
    const n = Number(t)
    return Number.isFinite(n) ? n : t
  }
  return d
}

function fmt(v: string | number | string[]): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  return String(v)
}

export function SettingsPanel() {
  const { toast } = useToast()
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [entries, setEntries] = useState<SettingEntry[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const applyEntry = useCallback((next: SettingEntry) => {
    setEntries((list) => list.map((x) => (x.key === next.key ? next : x)))
    setDrafts((d) => ({ ...d, [next.key]: toDraft(next.value, next.uiType) }))
  }, [])

  useEffect(() => {
    let stale = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/settings')
        const data = (await res.json()) as SettingsPageData & { error?: string }
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
        if (stale) return
        setGroups(data.groups)
        setEntries(data.settings)
        setDrafts(Object.fromEntries(data.settings.map((e) => [e.key, toDraft(e.value, e.uiType)])))
      } catch (e) {
        if (!stale) toast({ title: e instanceof Error ? e.message : 'Не удалось загрузить настройки', variant: 'destructive' })
      } finally {
        if (!stale) setLoading(false)
      }
    })()
    return () => {
      stale = true
    }
  }, [toast])

  const grouped = useMemo(() => {
    const map = new Map<string, SettingEntry[]>()
    for (const e of entries) {
      const list = map.get(e.group) ?? []
      list.push(e)
      map.set(e.group, list)
    }
    return [...map.entries()]
  }, [entries])

  const request = useCallback(
    async (method: 'PATCH' | 'DELETE', entry: SettingEntry, value?: unknown) => {
      setSaving((s) => ({ ...s, [entry.key]: true }))
      try {
        const res = await fetch('/api/admin/settings', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: entry.key, value }),
        })
        const data = (await res.json()) as { setting?: SettingEntry; error?: string }
        if (!res.ok || !data.setting) {
          toast({ title: data.error || 'Не удалось сохранить настройку', variant: 'destructive' })
          return
        }
        applyEntry(data.setting)
        toast({ title: method === 'PATCH' ? 'Настройка сохранена' : 'Возвращено значение по умолчанию' })
      } catch {
        toast({ title: 'Не удалось сохранить настройку', variant: 'destructive' })
      } finally {
        setSaving((s) => ({ ...s, [entry.key]: false }))
      }
    },
    [applyEntry, toast]
  )

  if (loading) {
    return <p className="text-sm text-muted-foreground">Загрузка настроек…</p>
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>
        <p className="text-sm text-muted-foreground">
          Бизнес-параметры системы: окна рассылок, лимиты, пороги, подписи. Изменение действует
          сразу, без выката (кэш чтения — до минуты); каждое изменение пишется в журнал событий.
        </p>
      </div>
      {grouped.map(([group, list]) => (
        <Card key={group} className="grid gap-4 p-5">
          <h2 className="text-lg font-semibold">{groups[group] ?? group}</h2>
          {list.map((entry) => {
            const draft = drafts[entry.key] ?? ''
            const dirty = draft !== toDraft(entry.value, entry.uiType)
            const busy = Boolean(saving[entry.key])
            const multiline = entry.uiType === 'text' || entry.uiType === 'string_list'
            return (
              <div key={entry.key} className="grid gap-1.5">
                <Label htmlFor={entry.key} className="text-sm font-medium">
                  {entry.label}
                </Label>
                <p className="text-xs text-muted-foreground">{entry.hint}</p>
                {multiline ? (
                  <Textarea
                    id={entry.key}
                    rows={entry.uiType === 'string_list' ? 4 : 2}
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [entry.key]: e.target.value }))}
                    disabled={busy}
                    className="max-w-xl"
                  />
                ) : (
                  <Input
                    id={entry.key}
                    type={entry.uiType === 'number' ? 'number' : 'text'}
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [entry.key]: e.target.value }))}
                    disabled={busy}
                    placeholder={entry.uiType === 'time' ? 'ЧЧ:ММ' : entry.uiType === 'time_list' ? '09:00, 16:00' : undefined}
                    className="max-w-xs"
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => request('PATCH', entry, fromDraft(draft, entry.uiType))} disabled={!dirty || busy}>
                    Сохранить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => request('DELETE', entry)}
                    disabled={busy || (!entry.isModified && !dirty)}
                  >
                    Сбросить
                  </Button>
                  <span className="text-xs text-muted-foreground">По умолчанию: {fmt(entry.defaultValue)}</span>
                </div>
                {entry.isModified && (
                  <p className="text-xs text-muted-foreground">Изменено: {entry.updatedByName}</p>
                )}
              </div>
            )
          })}
        </Card>
      ))}
    </div>
  )
}
