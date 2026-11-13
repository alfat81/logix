'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { DOCUMENT_KIND_GROUPS } from '@/lib/document-phases'
import {
  DOCUMENT_KIND_LABELS,
  type DocumentKind,
  type DocProvider,
} from '@/lib/document-constants'
import { STAGE_DOC_PROVIDER_LABELS } from '@/lib/stage-doc-requirements'
import type { StageRow } from './types'
import { ProviderSelect } from './ProviderSelect'

// ─── DF-14: чек-лист документов этапа ───────────────────────────────
// Какие виды нужны для этапа, кто предоставляет, блокирует ли
// завершение. Читать могут все сотрудники, править ТОЛЬКО мастер (API
// проверяет независимо). Пара этап+вид уникальна — смена вида = удалить
// и создать заново (ключ чек-листа неизменяем).

type ReqRow = {
  id: string
  stageCode: string
  stageName: string
  kind: DocumentKind | string
  kindLabel: string
  providedBy: DocProvider
  isBlocking: boolean
}

export function StageRequirementsDialog({
  row,
  isMaster,
  onClose,
}: {
  row: StageRow | null
  isMaster: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ReqRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [newKind, setNewKind] = useState<DocumentKind | ''>('')
  const [newProvider, setNewProvider] = useState<DocProvider>('client')
  const [newBlocking, setNewBlocking] = useState(false)

  const load = useCallback(async (code: string) => {
    setRows(null)
    try {
      const res = await fetch(`/api/admin/stage-catalog/requirements?stageCode=${encodeURIComponent(code)}`)
      const data = await readApiResponse<{ requirements?: ReqRow[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setRows(data.requirements ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить чек-лист этапа',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      setRows([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (row) {
      setNewKind('')
      setNewProvider('client')
      setNewBlocking(false)
      void load(row.code)
    }
  }, [row, load])

  if (!row) return null

  const call = async (
    method: string,
    url: string,
    body?: unknown,
    okTitle = 'Готово'
  ): Promise<boolean> => {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method,
        ...(body !== undefined
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      })
      const data = await readApiResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Не удалось выполнить операцию')
      toast({ title: okTitle })
      await load(row.code)
      return true
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    if (!newKind) return
    const ok = await call(
      'POST',
      '/api/admin/stage-catalog/requirements',
      { stageCode: row.code, kind: newKind, providedBy: newProvider, isBlocking: newBlocking },
      'Требование добавлено'
    )
    if (ok) setNewKind('')
  }

  const availableKinds = (DOCUMENT_KIND_GROUPS.flatMap((g) => g.kinds) as readonly DocumentKind[]).filter(
    (k) => !(rows ?? []).some((r) => r.kind === k)
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Документы этапа — {row.name}
          </DialogTitle>
          <DialogDescription>
            Чек-лист документов этапа (DF-14). Блокирующее требование не даёт завершить этап без
            финального документа вида; обход — мастер с комментарием в журнале заявки.
            {!isMaster && ' Правка — только мастер.'}
          </DialogDescription>
        </DialogHeader>

        {rows === null ? (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Загрузка…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Чек-лист пуст — этап завершается без документов.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium text-sm">{r.kindLabel}</span>
                    {r.isBlocking ? (
                      <Badge variant="version" className="text-xs">
                        блокирует завершение
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        рекомендуется
                      </Badge>
                    )}
                  </div>
                  {isMaster && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Удалить требование «${r.kindLabel}»`}
                      disabled={busy}
                      onClick={() => void call('DELETE', `/api/admin/stage-catalog/requirements/${r.id}`, undefined, 'Требование удалено')}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-muted-foreground">предоставляет:</span>
                  {isMaster ? (
                    <ProviderSelect
                      value={r.providedBy}
                      onValue={(v) =>
                        void call(
                          'PATCH',
                          `/api/admin/stage-catalog/requirements/${r.id}`,
                          { providedBy: v },
                          'Поставщик обновлён'
                        )
                      }
                      disabled={busy}
                      className="h-8 w-36"
                    />
                  ) : (
                    <span>{STAGE_DOC_PROVIDER_LABELS[r.providedBy]}</span>
                  )}
                  {isMaster && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={r.isBlocking}
                        disabled={busy}
                        onChange={(e) =>
                          void call(
                            'PATCH',
                            `/api/admin/stage-catalog/requirements/${r.id}`,
                            { isBlocking: e.target.checked },
                            e.target.checked ? 'Требование блокирует завершение' : 'Требование — рекомендуется'
                          )
                        }
                      />
                      блокирует завершение
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isMaster && (
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium">Добавить документ</p>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="grid gap-1.5 min-w-44 flex-1">
                <Label>Вид документа</Label>
                <Select value={newKind} onValueChange={(v) => setNewKind(v as DocumentKind)}>
                  <SelectTrigger aria-label="Вид требования" className="h-9">
                    <SelectValue placeholder="Выберите вид" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_KIND_GROUPS.map((g) => {
                      const items = availableKinds.filter((k) => (g.kinds as readonly string[]).includes(k))
                      if (items.length === 0) return null
                      return (
                        <SelectGroup key={g.code}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {items.map((k) => (
                            <SelectItem key={k} value={k}>
                              {DOCUMENT_KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Предоставляет</Label>
                <ProviderSelect value={newProvider} onValue={setNewProvider} className="h-9 w-36" />
              </div>
              <Button size="sm" onClick={() => void add()} disabled={busy || !newKind}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Добавить
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4"
                checked={newBlocking}
                onChange={(e) => setNewBlocking(e.target.checked)}
              />
              блокирует завершение этапа без финального документа
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
