'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { StageCreateDialog } from './stagecatalog/StageCreateDialog'
import { StageEditDialog } from './stagecatalog/StageEditDialog'
import { MANDATORY_WARNING, type StageRow } from './stagecatalog/types'

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
//
// v0.5.0 (P1-22): диалоги создания/правки — выезд в stagecatalog/
// (резка под лимит 300, RULES 2.14).
//
// v0.7.10 (DF-22): карточка этапа — анатомия §4.3-lite по эталону
// «Юрлица» (LegalEntityCard): строка 1 — номер + бейдж атрибута
// (нейтральная пара version §3.2 — сплошной Coral-бейдж вне таблицы
// статусов запрещён: красный только для срочного), строка 2 —
// название semibold, строка 3 — код; «Править» — outline справа.
export function StageCatalogList({ isMaster }: { isMaster: boolean }) {
  const { toast } = useToast()

  const [stages, setStages] = useState<StageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const reqId = useRef(0)

  // Диалог правки (форма живёт в диалоге)
  const [editRow, setEditRow] = useState<StageRow | null>(null)

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
        <StageCreateDialog isMaster={isMaster} onCreated={() => setVersion((v) => v + 1)} />
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
            <Card key={row.id} className="p-4">
              {/* Анатомия §4.3-lite (эталон — «Юрлица», DF-22): строка 1 —
                  номер + бейдж обязательности (нейтральная пара §3.2 —
                  красный только для срочного), строка 2 — название
                  semibold, строка 3 — код; стрелки порядка слева,
                  «Править» справа, как в правом блоке юрлица */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex shrink-0 flex-col gap-1">
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
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                      {row.isMandatory && (
                        <Badge variant="version" title={MANDATORY_WARNING}>
                          Обязательный
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate font-semibold">{row.name}</div>
                    <div className="mt-0.5 truncate text-sm text-muted-foreground font-mono">{row.code}</div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditRow(row)}>
                  <Pencil className="size-4" />
                  Править
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <StageEditDialog
        row={editRow}
        isMaster={isMaster}
        onClose={() => setEditRow(null)}
        onSaved={() => {
          setEditRow(null)
          setVersion((v) => v + 1)
        }}
      />
    </div>
  )
}
