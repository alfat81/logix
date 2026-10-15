// Константы статусов и справочники заявок/этапов — файл БЕЗ серверных
// зависимостей (db, crypto и т.п.): его импортируют и API-роуты, и
// КЛИЕНТСКИЕ компоненты UI (списки статусов, подписи бейджей).
// Значения — разделы 3 и 9 LOGISTICS-ROADMAP.md. Серверная логика
// (создание заявки, retry-петли) живёт отдельно в lib/orders.ts.

// Верхнеуровневый статус заявки — ручной, менеджер переводит осознанно
// (роадмап 8.1), этапы его не диктуют автоматически.
export const ORDER_STATUSES = [
  'calculating',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  calculating: 'Расчёт',
  confirmed: 'Согласование',
  in_progress: 'В работе',
  completed: 'Завершена',
  cancelled: 'Отменена',
}

// Статус этапа внутри заявки (роадмап, раздел 3): не начат → в работе →
// завершён, плюс «проблема» для контроля.
export const STAGE_STATUSES = ['not_started', 'in_progress', 'done', 'problem'] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  not_started: 'Не начат',
  in_progress: 'В работе',
  done: 'Завершён',
  problem: 'Проблема',
}

// Профиль груза (роадмап, раздел 6: негабарит/опасные — глубже в Phase 2).
export const CARGO_PROFILES = ['standard', 'oversized', 'dangerous'] as const
export type CargoProfile = (typeof CARGO_PROFILES)[number]

export const CARGO_PROFILE_LABELS: Record<CargoProfile, string> = {
  standard: 'Стандартный',
  oversized: 'Негабарит',
  dangerous: 'Опасный',
}
