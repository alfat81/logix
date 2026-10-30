// Маппинг статусов домена на варианты бейджей BRANDBOOK §3.2
// (v1.3, DF-20: цвет несёт точка 8px, текст тёмный; РАСЧЁТ/
// СОГЛАСОВАНИЕ — нейтральная пара review; сплошной красный critical —
// только ТРЕБУЕТ РЕШЕНИЯ/ПРОСРОЧЕНО — придёт с DF-05/DF-16).
// Файл БЕЗ серверных зависимостей — как status-machine.ts: типы
// статусов импортируются из констант-модулей, тексты берут те же
// *_STATUS_LABELS, меняется только визуальный вариант.
import type { LeadStatus } from '@/lib/leads'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'
import type { ContractorLeadStatus } from '@/lib/contractors'
import type { PermitStatus } from '@/lib/permits'

export type StatusBadgeVariant =
  | 'transit' // В ПУТИ/В РАБОТЕ/НА ПРОВЕРКЕ — движение (точка Action-icon §3.2)
  | 'delay' // ЗАДЕРЖКА — сплошной Coral, текст Ink (v1.3: 6,09 вместо 2,36)
  | 'delivered' // ДОСТАВЛЕНО/ЗАВЕРШЕНО/ФИНАЛЬНЫЙ — успех (Success-strong §3.2)
  | 'pending' // ОЖИДАНИЕ — ждёт действия (пара движения с точкой Action-icon; потребители — DF-05)
  | 'review' // РАСЧЁТ/СОГЛАСОВАНИЕ — нейтральная пара с точкой Muted (v1.3, DF-20)
  | 'critical' // ТРЕБУЕТ РЕШЕНИЯ/ПРОСРОЧЕНО — единственный сплошной красный (v1.3; DF-05/DF-16)
  | 'version' // V x.y — нейтральное состояние (пара V-бейджа §3.2)

// Лид: new/calculated — ждём расчёта/выбора (нейтральная пара review,
// v1.3), won — сделка состоялась, lost — не состоялась (отказ — норма
// воронки, нейтрально; Brick-«ошибку» в визе не рисуем — это не сбой).
export const LEAD_BADGE_VARIANTS: Record<LeadStatus, StatusBadgeVariant> = {
  new: 'review',
  calculated: 'review',
  won: 'delivered',
  lost: 'version',
}

// Заявка: расчёт и согласование — нейтральная пара review (v1.3 §3.2),
// в работе — движение, завершена — успех, отменена — нейтрально
// (терминальный «не состоялся»).
export const ORDER_BADGE_VARIANTS: Record<OrderStatus, StatusBadgeVariant> = {
  calculating: 'review',
  confirmed: 'review',
  in_progress: 'transit',
  completed: 'delivered',
  cancelled: 'version',
}

// Этап: не начат — нейтрально, в работе — движение, готов — успех,
// проблема — задержка (Coral-заливка с текстом Ink v1.3; критичное
// семейство §5.3).
export const STAGE_BADGE_VARIANTS: Record<StageStatus, StatusBadgeVariant> = {
  not_started: 'version',
  in_progress: 'transit',
  done: 'delivered',
  problem: 'delay',
}

// Кандидат в подрядчики (Г1): новый — ожидание расчёта (review),
// на проверке — движение, договор — успех, отказ — нейтрально.
export const CONTRACTOR_LEAD_BADGE_VARIANTS: Record<
  ContractorLeadStatus,
  StatusBadgeVariant
> = {
  new: 'review',
  qualifying: 'transit',
  contracted: 'delivered',
  rejected: 'version',
}

// Разрешительный (DF-16): ожидается — ждёт действия (пара движения,
// как DF-05), получен — успех, не требуется — нейтрально. Красный
// critical строке красит ПОТРЕБИТЕЛЬ: блокирующая и просроченная
// (§3.3 — красный только срочное; окно «за N дней» — скан писем,
// интерфейс красит по факту просрочки).
export const PERMIT_BADGE_VARIANTS: Record<PermitStatus, StatusBadgeVariant> = {
  pending: 'pending',
  received: 'delivered',
  waived: 'version',
}
