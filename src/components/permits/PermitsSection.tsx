'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { readApiResponse } from '@/lib/api-client'
import { PERMIT_BADGE_VARIANTS } from '@/lib/status-badges'
import {
  PERMIT_STATUS_LABELS,
  fmtPermitDate,
  isPermitOverdue,
  pickMostUrgentPermit,
  providerLabelFor,
} from '@/lib/permits'
import { PermitCreateDialog, PermitEditDialog } from './PermitDialogs'
import { PermitUploadButton } from './PermitUploadButton'
import type { PermitRowUi, PermitViewer } from './types'

// ─── DF-16 «Разрешительные документы»: секция карточки сделки ────────
// ОДИН компонент на три кабинета (как DocumentsSection): различия — в
// правах (createUrl — брокер/сотрудник; patchUrlFor — сотрудник;
// загрузка документа в строке — все трое) и адресах API. Данные: GET
// списка /permits (админ/брокер) либо initialPermits из GET карточки
// (клиент — своего GET списка у него нет). Секция — та самая плашка
// «Ожидается: … — от …, до …» из карточки DF-16: сводка сверху (самая
// срочная строка по pickMostUrgentPermit), строки — анатомия §4.3-lite.
// Красный (§3.3 — только срочное): блокирующая и просроченная.
// «Окно красного» за N дней до срока — забота скана диспетчера
// (permits-scan.ts, письма); в UI не тянем настройку permits.*.

type PermitsSectionProps = {
  viewer: PermitViewer
  /** GET списка (админ/брокер); нет — работаем от initialPermits */
  permitsUrl?: string
  /** Строки из GET карточки (клиент, или когда список уже в руках) */
  initialPermits?: PermitRowUi[]
  /** POST добавления строки (брокер/сотрудник); нет — кнопки «Добавить» нет */
  createUrl?: string
  /** PATCH строки (сотрудник); нет — кнопки «Править» нет */
  patchUrlFor?: (permitId: string) => string
  /** POST загрузки документа в строку (клиент/брокер/сотрудник) */
  documentUrlFor: (permitId: string) => string
  /** Карточка перезагружает мяч/счётчики после изменений */
  onChanged?: () => void
  emptyText?: string
}

export function PermitsSection({
  viewer,
  permitsUrl,
  initialPermits,
  createUrl,
  patchUrlFor,
  documentUrlFor,
  onChanged,
  emptyText = 'Разрешительных нет — добавьте обязательства из расчёта брокера',
}: PermitsSectionProps) {
  const { toast } = useToast()
  const [permits, setPermits] = useState<PermitRowUi[] | null>(initialPermits ?? null)

  const load = useCallback(async () => {
    if (!permitsUrl) {
      // Клиентский режим: обновляет карточка (onChanged перезагружает GET
      // карточки — permitRequirements придут заново).
      await onChanged?.()
      return
    }
    try {
      const res = await fetch(permitsUrl)
      const data = await readApiResponse<{ permits?: PermitRowUi[]; error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки')
      setPermits(data.permits ?? [])
    } catch (e) {
      toast({
        title: 'Не удалось загрузить разрешительные',
        description: e instanceof Error ? e.message : '',
        variant: 'destructive',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitsUrl])

  useEffect(() => {
    if (permitsUrl) void load()
  }, [load, permitsUrl])

  // Клиентский режим (без permitsUrl): карточка перезагружает GET и
  // отдаёт свежие permitRequirements — принимаем их в state (ссылка
  // меняется только после реальной перезагрузки, цикла нет).
  useEffect(() => {
    if (!permitsUrl && initialPermits) setPermits(initialPermits)
  }, [permitsUrl, initialPermits])

  const rows = permits ?? []
  const pending = rows.filter((r) => r.status === 'pending')
  // Сводная плашка — самая срочная ожидающая строка (blocking ↓, срок ↑).
  // pickMostUrgentPermit ждёт даты — строки карточки приходят ISO-строками.
  const headline = pickMostUrgentPermit(
    pending.map((p) => ({
      ...p,
      // neededBy приходит ГГГГ-ММ-ДД (форма) или ISO-строкой (Prisma) —
      // new Date() понимает оба вида; конкатенация ломала ISO (NaN-даты)
      neededBy: p.neededBy ? new Date(p.neededBy) : null,
      createdAt: new Date(p.createdAt),
    }))
  )
  const headlineRest = Math.max(0, pending.length - 1)

  // Чистый рендер: new Date() в рендере — паттерн WaitingBadge (каждая
  // генерация страницы даёт свежую точку сравнения без эффектов)
  const now = new Date()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
          Разрешительные документы
          {pending.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              · {pending.length} в ожидании
            </span>
          )}
        </CardTitle>
        {createUrl && (
          <CardAction>
            <PermitCreateDialog createUrl={createUrl} viewer={viewer} onCreated={load} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* Плашка карточки DF-16: «Ожидается: … — от …, до …» у всех
            сторон; красная — блокирующая и просроченная */}
        {headline && (
          <div
            className={
              headline.isBlocking && headline.neededBy && isPermitOverdue(headline.neededBy, now)
                ? 'rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm'
                : 'rounded-md border bg-muted/50 px-3 py-2 text-sm'
            }
          >
            Ожидается: {headline.title} — от {providerLabelFor(headline.providedBy, viewer)}
            {headline.neededBy ? `, до ${fmtPermitDate(headline.neededBy)}` : ''}
            {headlineRest > 0 && (
              <span className="text-muted-foreground"> · ещё {headlineRest}</span>
            )}
          </div>
        )}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
        <div className="grid gap-2">
          {rows.map((p) => (
            <PermitRow
              key={p.id}
              permit={p}
              viewer={viewer}
              patchUrlFor={patchUrlFor}
              documentUrlFor={documentUrlFor}
              onChanged={load}
              now={now}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function PermitRow({
  permit,
  viewer,
  patchUrlFor,
  documentUrlFor,
  onChanged,
  now,
}: {
  permit: PermitRowUi
  viewer: PermitViewer
  patchUrlFor?: (permitId: string) => string
  documentUrlFor: (permitId: string) => string
  onChanged: () => Promise<void>
  now: Date
}) {
  // Строка 1 — срок (tabular-nums) + атрибутные бейджи; строка 2 —
  // название; строка 3 — подпись (§4.3-lite, эталон «Юрлица»).
  // neededBy — ГГГГ-ММ-ДД (форма) или ISO (Prisma); new Date() понимает оба
  const due = permit.neededBy ? new Date(permit.neededBy) : null
  const overdueBlocking = permit.status === 'pending' && permit.isBlocking && due != null && isPermitOverdue(due, now)
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2">
      <div className="grid gap-0.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {due ? `до ${fmtPermitDate(due)}` : 'без срока'}
          </span>
          <Badge variant={PERMIT_BADGE_VARIANTS[permit.status]} className="text-xs">
            {PERMIT_STATUS_LABELS[permit.status]}
          </Badge>
          {permit.isBlocking && (
            <Badge variant={overdueBlocking ? 'critical' : 'outline'} className="text-xs">
              Блокирует
            </Badge>
          )}
        </div>
        <div className="font-medium break-words">{permit.title}</div>
        <div className="text-sm text-muted-foreground">
          Предоставит: {providerLabelFor(permit.providedBy, viewer)}
          {permit.status === 'received' &&
            permit.receivedAt &&
            ` · получен ${fmtPermitDate(new Date(permit.receivedAt))}${permit.receivedByName ? ` (${permit.receivedByName})` : ''}`}
          {permit.status === 'waived' && permit.waivedReason && ` · ${permit.waivedReason}`}
        </div>
        {viewer === 'staff' && permit.staffNote && (
          <div className="text-xs text-muted-foreground">Заметка: {permit.staffNote}</div>
        )}
      </div>
      {permit.status === 'pending' && (
        <div className="flex flex-wrap items-center gap-2">
          <PermitUploadButton permit={permit} documentUrl={documentUrlFor} onUploaded={onChanged} />
          {patchUrlFor && <PermitEditDialog permit={permit} patchUrlFor={patchUrlFor} onSaved={onChanged} />}
        </div>
      )}
    </div>
  )
}
