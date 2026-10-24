// Маппинг статусов домена на варианты бейджей BRANDBOOK §3.2
// (P1-19, этап C; D24 — ЗАВЕРШЕНО/ОЖИДАНИЕ из брендбука v1.2).
// Файл БЕЗ серверных зависимостей — как status-machine.ts: типы
// статусов импортируются из констант-модулей, тексты берут те же
// *_STATUS_LABELS, меняется только визуальная пара (фон/текст).
import type { LeadStatus } from '@/lib/leads'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'
import type { ContractorLeadStatus } from '@/lib/contractors'

export type StatusBadgeVariant =
  | 'transit' // В ПУТИ — движение (тёплая пара «В ПУТИ» §3.2)
  | 'delay' // ЗАДЕРЖКА — проблема/просрочка (сплошной Coral §3.2)
  | 'delivered' // ДОСТАВЛЕНО/ЗАВЕРШЕНО — успех (Success-пара §3.2)
  | 'pending' // ОЖИДАНИЕ — ждёт действия (v1.2, D24; см. §8.6)
  | 'version' // V x.y — нейтральное состояние (пара V-бейджа §3.2)

// Лид: new/calculated — ждём (расчёт, выбор клиента), won — сделка
// состоялась, lost — не состоялась (отказ — норма воронки, нейтрально;
// Brick-«ошибку» в визе не рисуем — это не сбой).
export const LEAD_BADGE_VARIANTS: Record<LeadStatus, StatusBadgeVariant> = {
  new: 'pending',
  calculated: 'pending',
  won: 'delivered',
  lost: 'version',
}

// Заявка: расчёт и согласование — ожидание, в работе — движение,
// завершена — успех, отменена — нейтрально (терминальный «не состоялся»).
export const ORDER_BADGE_VARIANTS: Record<OrderStatus, StatusBadgeVariant> = {
  calculating: 'pending',
  confirmed: 'pending',
  in_progress: 'transit',
  completed: 'delivered',
  cancelled: 'version',
}

// Этап: не начат — нейтрально, в работе — движение, готов — успех,
// проблема — задержка (Brick/Coral-семейство §5.3: критичные задержки).
export const STAGE_BADGE_VARIANTS: Record<StageStatus, StatusBadgeVariant> = {
  not_started: 'version',
  in_progress: 'transit',
  done: 'delivered',
  problem: 'delay',
}

// Кандидат в подрядчики (Г1): новый — ожидание, на проверке — движение,
// договор — успех, отказ — нейтрально.
export const CONTRACTOR_LEAD_BADGE_VARIANTS: Record<
  ContractorLeadStatus,
  StatusBadgeVariant
> = {
  new: 'pending',
  qualifying: 'transit',
  contracted: 'delivered',
  rejected: 'version',
}
