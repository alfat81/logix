'use client'

import { useState } from 'react'
import { FileUp, ShieldCheck, ShieldX } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  PERMIT_PROVIDER_LABELS,
  PERMIT_REJECT_REASON_MAX,
  fmtPermitDate,
  permitDaysLeft,
  isPermitAttention,
  type PermitProvider,
} from '@/lib/permits'
import { PERMIT_BADGE_VARIANTS } from '@/lib/status-badges'
import { PermitEditDialog } from '@/components/permits/PermitDialogs'
import type { PermitRowUi } from '@/components/permits/types'
import type { PermitLiteUi } from './registry-types'

// ─── DF-26 §3.3.3 + волна 2 (§5.4/§5.7 п. 0а): строка разрешительного
// требования в анатомии реестра. Требование показывается в фазе своего
// этапа (stagePhase; без stageCode — остаточная группа 07), файл,
// закрывающий требование, показывается один раз — внутри строки.
// Статусы §3.5 (теги ЗАГЛАВНЫМИ): ОЖИДАЕТСЯ / НА ПРОВЕРКЕ / ПОЛУЧЕН /
// НЕ ТРЕБУЕТСЯ; варианты пар — канонический PERMIT_BADGE_VARIANTS (§3.2).
// Волна 2: «Принять/Отклонить» — решение сотрудника по submitted
// (десктоп и 375 — цели ≥44, Р-2/D58); подпись «ранее принята версия N»
// (acceptedVersion не затирается, §6.4); усиленная нейтральная плашка
// «до срока N дн.» внутри окна warn (§5.5, без красного); метка
// «связь с позицией требует подтверждения» — pending_manual, только
// staff (§5.7 п. 0а).

const PERMIT_ROW_LABELS: Record<string, string> = {
  pending: 'ОЖИДАЕТСЯ',
  submitted: 'НА ПРОВЕРКЕ',
  received: 'ПОЛУЧЕН',
  waived: 'НЕ ТРЕБУЕТСЯ',
}

export function RegistryPermitRow({
  permit,
  file,
  patchUrlFor,
  actionUrlFor,
  warnDays,
  bindingState,
  onSaved,
  onUpload,
}: {
  permit: PermitLiteUi
  /** Документ, закрывающий требование (один раз — внутри строки). */
  file?: { fileName: string; currentVersion: number; onOpen: () => void; onNewVersion: () => void } | null
  /** PATCH строки (сотрудник) — триггер «Править» и «Не требуется» */
  patchUrlFor?: (permitId: string) => string
  /** POST accept/reject (сотрудник) — решение по submitted (§5.4) */
  actionUrlFor?: (permitId: string, action: 'accept' | 'reject') => string
  /** Окно усиленной плашки (permits.warn_days_before); нет — плашки нет */
  warnDays?: number
  /** Состояние привязки (только staff; §5.7 п. 0а) */
  bindingState?: string
  onSaved: () => Promise<void>
  onUpload: () => void
}) {
  const { toast } = useToast()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const label = PERMIT_ROW_LABELS[permit.status] ?? permit.status
  const variant = PERMIT_BADGE_VARIANTS[permit.status as keyof typeof PERMIT_BADGE_VARIANTS] ?? 'version'
  const due = permit.neededBy ? new Date(permit.neededBy) : null
  // Чистый рендер: точка сравнения — как в PermitsSection (new Date()
  // в теле компонента, без эффектов)
  const now = new Date()
  const overdueBlocking =
    permit.status === 'pending' && permit.isBlocking && due != null && due.getTime() < now.getTime()
  // Усиленная нейтральная плашка (§5.5): срок внутри окна warn, ещё не прошёл
  const warnAttention =
    due != null && warnDays != null && isPermitAttention(due, now, warnDays)
      ? permitDaysLeft(due, now)
      : null
  // Метка привязки — только staff (bindingState отдаётся сотрудникам)
  const needsRelink = bindingState === 'pending_manual'
  // Подпись прежнего принятия (§6.4): acceptedVersion не затирается
  // при авто-возврате — строка объясняет, какая версия была принята.
  const previouslyAccepted =
    permit.status === 'submitted' && permit.acceptedVersion != null
      ? `ранее принята версия ${permit.acceptedVersion}${
          permit.receivedByName
            ? ` (${permit.receivedByName}${
                permit.receivedAt ? `, ${fmtPermitDate(new Date(permit.receivedAt))}` : ''
              })`
            : ''
        }`
      : null

  const act = async (action: 'accept' | 'reject', rejectReason?: string) => {
    if (!actionUrlFor) return
    setBusy(true)
    try {
      const res = await fetch(actionUrlFor(permit.id, action), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(rejectReason !== undefined ? { body: JSON.stringify({ reason: rejectReason }) } : {}),
      })
      const json = await res.json().catch(() => ({}) as { error?: string })
      if (!res.ok) {
        toast({ title: json.error || 'Ошибка', variant: 'destructive' })
        return
      }
      toast({
        title: action === 'accept' ? 'Документ принят' : 'Документ отклонён — контроль возобновлён',
      })
      setRejectOpen(false)
      setReason('')
      await onSaved()
    } catch {
      toast({ title: 'Сеть недоступна', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 md:py-2 grid gap-1.5 min-w-0 ${
        overdueBlocking ? 'border-destructive/40' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Badge variant={variant} className="text-xs">
          {label}
        </Badge>
        <span className="text-sm font-medium break-words min-w-0">{permit.title}</span>
        {permit.isBlocking && (
          <Badge variant={overdueBlocking ? 'critical' : 'outline'} className="text-xs">
            {overdueBlocking ? 'ПРОСРОЧЕНО' : 'Блокирует'}
          </Badge>
        )}
        {needsRelink && (
          <Badge variant="pending" className="text-xs">
            ТРЕБУЕТ ПРИВЯЗКИ
          </Badge>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {warnAttention != null
            ? `до срока ${warnAttention} дн. (до ${fmtPermitDate(due!)})`
            : due
              ? `до ${fmtPermitDate(due)}`
              : 'без срока'}
        </span>
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span>разрешительное требование</span>
        <span>·</span>
        <span>предоставит: {PERMIT_PROVIDER_LABELS[permit.providedBy as PermitProvider]?.toLowerCase() ?? permit.providedBy}</span>
        {permit.status === 'received' && permit.receivedAt && (
          <>
            <span>·</span>
            <span>
              получен {fmtPermitDate(new Date(permit.receivedAt))}
              {permit.receivedByName ? ` (${permit.receivedByName})` : ''}
            </span>
          </>
        )}
        {previouslyAccepted && (
          <>
            <span>·</span>
            <span>{previouslyAccepted}</span>
          </>
        )}
        {permit.status === 'waived' && permit.waivedReason && (
          <>
            <span>·</span>
            <span>{permit.waivedReason}</span>
          </>
        )}
      </div>
      {/* Файл, закрывающий требование, — внутри строки (§3.3.3), без
          дубля отдельной строкой реестра. */}
      {file && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 min-w-0">
          <button
            type="button"
            onClick={file.onOpen}
            className="text-xs font-medium underline underline-offset-4 hover:text-foreground truncate max-w-56"
            title="История версий"
          >
            {file.fileName}
          </button>
          <span className="text-xs text-muted-foreground">v{file.currentVersion}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={file.onNewVersion}>
            Новая версия
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {permit.status === 'pending' && (
          <Button size="sm" variant="outline" className="h-11 md:h-8" onClick={onUpload}>
            <FileUp className="size-3.5" />
            Загрузить
          </Button>
        )}
        {permit.status === 'submitted' && actionUrlFor && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-11 md:h-8"
              disabled={busy}
              onClick={() => void act('accept')}
            >
              <ShieldCheck className="size-3.5" />
              Принять
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-11 md:h-8"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              <ShieldX className="size-3.5" />
              Отклонить
            </Button>
          </>
        )}
        {patchUrlFor && (
          <PermitEditDialog
            permit={permit as PermitRowUi}
            patchUrlFor={patchUrlFor}
            onSaved={onSaved}
          />
        )}
      </div>

      {/* Отклонение — с обязательной причиной (§5.4); документ остаётся
          в заявке, контроль возобновляется. */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отклонить документ</DialogTitle>
            <DialogDescription>
              Требование «{permit.title}» вернётся в «Ожидается» — контроль и напоминания
              возобновятся. Документ останется в заявке.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина (обязательно) — что не так с документом"
            rows={3}
            maxLength={PERMIT_REJECT_REASON_MAX}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() => void act('reject', reason.trim())}
            >
              Отклонить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
