'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListTabs } from '@/components/admin/ListTabs'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { REF_DIRS, REF_DIR_LABELS, incotermMetaOf, type RefDir } from '@/lib/ref'
import { RefDialog } from './RefDialog'
import type { RefDialogSave, RefRow, RatesData } from './ref-types'

// ─── Экран справочников (DF-17, /admin/references) ──────────────────
// Табы по dir (ListTabs — BRANDBOOK §4.2), поиск, включённость, правка
// подписей, добавление записей. Права: чтение — любой сотрудник,
// изменения — write:true (API отдаёт 403 без права; интерфейс для
// мастера и менеджера). Код записи НЕ редактируется (API отвергает —
// карточка DF-17: «код нельзя менять после использования»). Диалог —
// RefDialog.tsx, общие типы — ref-types.ts (лимит 300, RULES 2.14).
//
// IC-16: для каждого справочника показан источник и условия
// использования (коротко здесь, полностью — docs/REFERENCES-SOURCES.md).
//
// v0.7.10 (DF-22): шапка — по эталону «Юрлица» (заголовок+подпись
// слева, действия справа); строка справочника — анатомия §4.3-lite:
// строка 1 — код + атрибутные бейджи (пары §3.2: «Отключено» и
// «Правила — черновик» — нейтральная version-пара; amber вне
// палитры брендбука), строка 2 — название semibold, строка 3 —
// английское название muted; правый блок — курс и «Править» outline.

// Источники и условия использования (IC-16) — полные записи в
// docs/REFERENCES-SOURCES.md; здесь — краткие пометки на экране.
const SOURCE_NOTES: Record<RefDir, string> = {
  country: 'ISO 3166-1 (alpha-2). Русские названия по умолчанию из Intl.DisplayNames, переопределяются здесь.',
  currency: 'ISO 4217; курсы — официальный экспорт ЦБ РФ (XML_daily.asp, бесплатно).',
  packaging: 'Рекомендация 21 ЕЭК ООН, ред. 4 (коды видов упаковки); включены ходовые виды, остальные — по запросу.',
  incoterm: 'Incoterms 2020 (11 терминов). Названия терминов — ICC; разъяснения — собственные формулировки, правила расчёта — черновик до утверждения брокером (O-12).',
}

function fmtRate(value: string): string {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 4 }) : value
}

export function ReferencesScreen({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast()
  const [dir, setDir] = useState<RefDir>('country')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<RefRow[] | null>(null)
  const [rates, setRates] = useState<RatesData>(null)
  const [editing, setEditing] = useState<RefRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ dir })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/admin/references?${params}`)
      const body = await readApiResponse<{ items: RefRow[]; rates: RatesData; error?: string }>(res)
      if (!res.ok) throw new Error(body.error || 'Ошибка загрузки')
      setRows(body.items)
      setRates(body.rates ?? null)
    } catch (e) {
      toast({
        title: 'Не удалось загрузить справочник',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    }
  }, [dir, q, toast])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const rateByCode = useMemo(() => {
    const m = new Map<string, { nominal: number; value: string }>()
    for (const r of rates?.items ?? []) m.set(r.code, { nominal: r.nominal, value: r.value })
    return m
  }, [rates])

  const save = useCallback(
    async (row: RefDialogSave) => {
      setSaving(true)
      try {
        const res = await fetch(
          row.id ? `/api/admin/references/${row.id}` : '/api/admin/references',
          {
            method: row.id ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              row.id
                ? { name: row.name, nameEn: row.nameEn, isActive: row.isActive, sortOrder: row.sortOrder }
                : { dir: row.dir, code: row.code, name: row.name, nameEn: row.nameEn, sortOrder: row.sortOrder }
            ),
          }
        )
        const body = await readApiResponse<{ error?: string }>(res)
        if (!res.ok) throw new Error(body.error || 'Ошибка сохранения')
        toast({ title: row.id ? 'Запись сохранена' : 'Запись добавлена' })
        setEditing(null)
        setCreating(false)
        await load()
      } catch (e) {
        toast({
          title: 'Не удалось сохранить запись',
          description: e instanceof Error ? e.message : '',
          variant: 'destructive',
        })
      } finally {
        setSaving(false)
      }
    },
    [load, toast]
  )

  const tabs = REF_DIRS.map((d) => ({ key: d, label: REF_DIR_LABELS[d] }))

  return (
    <div className="grid gap-4">
      {/* Шапка по эталону «Юрлица» (§4.2, DF-22): заголовок+подпись слева,
          действия справа */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Справочники</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Страны, валюты, упаковка и условия поставки — единый источник выбора во всех формах.
            Код записи неизменяем; подписи можно править, запись — отключить (исчезнет из форм, старые
            сделки сохранят снимок). Источники и условия использования —{' '}
            <span className="font-mono text-xs">docs/REFERENCES-SOURCES.md</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="size-4" />
            Обновить
          </Button>
          {canWrite && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Добавить
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ListTabs tabs={tabs} active={dir} onChange={(d) => setDir(d as RefDir)} />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по коду или названию…"
          className="h-8 w-56 text-sm"
          aria-label="Поиск по справочнику"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Источник: {SOURCE_NOTES[dir]}
      </p>

      {dir === 'currency' && (
        <p className="text-xs text-muted-foreground">
          {rates
            ? `Последний курс ЦБ: на ${rates.date} (${rates.items.length} валют). Импорт — ежедневным проходом диспетчера.`
            : 'Курсов пока нет — импорт выполнится ближайшим проходом диспетчера (раз в сутки).'}
        </p>
      )}

      {rows === null ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-16 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Загрузка…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ничего не найдено. Справочник наполняется сидом при релизе; отдельные записи можно добавить вручную.
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((row) => {
            const meta = dir === 'incoterm' ? incotermMetaOf(row.meta) : null
            const rate = rateByCode.get(row.code)
            return (
              <Card key={row.id} className="p-4">
                {/* Анатомия §4.3-lite (эталон — «Юрлица», DF-22) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-14 shrink-0 font-mono text-muted-foreground tabular-nums">{row.code}</span>
                      {!row.isActive && <Badge variant="version">Отключено</Badge>}
                      {meta?.draft && <Badge variant="version">Правила — черновик (O-12)</Badge>}
                    </div>
                    <div className="mt-0.5 truncate font-semibold">{row.name}</div>
                    {row.nameEn && (
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">{row.nameEn}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {rate && (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        курс: {rate.nominal !== 1 && `${rate.nominal} ед. = `}
                        {fmtRate(rate.value)} ₽
                      </div>
                    )}
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={rate ? 'mt-1' : undefined}
                        onClick={() => setEditing(row)}
                      >
                        <Pencil className="size-4" />
                        Править
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Диалог правки (код неизменяем) / добавления */}
      <RefDialog
        open={editing !== null || creating}
        dir={dir}
        row={editing}
        saving={saving}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            setCreating(false)
          }
        }}
        onSave={save}
      />
    </div>
  )
}
