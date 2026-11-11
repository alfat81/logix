// Статусная машина лида и заявки (P1-05). Файл БЕЗ серверных
// зависимостей (db и т.п.): импортируется API-роутами, unit-тестами
// (vitest) и будущим UI — кнопки переходов рендерятся по тем же
// таблицам, которые проверяет сервер (правило «UI показывает только
// допустимые переходы», роадмап 8.1).
//
// Здесь только ТОПОЛОГИЯ переходов. Бизнес-условия поверх матрицы
// живут в роутах: у лида — «new→calculated только при ≥1 варианте»
// и «lost→new только мастеру»; у заявки — «completed только при
// готовых обязательных этапах» (lib/orders.ts) и роль исполнителя.

import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from '@/lib/order-constants'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import {
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
} from '@/lib/document-constants'

// ─── Заявка: Расчёт → Согласование → В работе → Завершена ─────
// • «Отменена» — из любого не-терминального статуса.
// • calculating→in_progress — осознанное «перепрыгивание» согласования:
//   ручная заявка (Б3) может стартовать в работе без формального
//   подтверждения (проверено e2e «возврат … в in_progress»).
// • completed/cancelled — терминальные: из них разрешён только
//   возврат в «В работе», и это прерогатива мастера с причиной
//   (роль и причина проверяются в роуте PATCH, журнал пишет туда же).
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  calculating: ['confirmed', 'in_progress', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['in_progress'],
  cancelled: ['in_progress'],
}

// Терминальные статусы заявки: переход «из них» — только мастеру
// с причиной (роадмап P1-05). Полностью закрытых статусов у заявки нет.
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['completed', 'cancelled']

// ─── Лид: Новый → Рассчитан → Согласован → Выигран / Отказ ─────
// • won — строго терминальный: проставляется ТОЛЬКО конвертацией
//   в заявку (В4), вручную не ставится и назад не открывается.
// • client_approved (поток A, BL) — в таблице только отказ (lost):
//   сам переход в client_approved выполняют выделенные confirm-API
//   (select-option/confirm) напрямую — симметрия с won, который
//   ставится только конвертацией. Ручной PATCH его не принимает.
//   Сброс согласования («Изменить условия») тоже выделенный API —
//   он уходит из статуса напрямую, без строки в таблице.
//   DF-27 волна 2 (Р-1, D75): правка анкеты при активном согласовании
//   атомарно сбрасывает его в той же транзакции сохранения (снимок
//   остаётся в истории) — новый статус считает expectedLeadStatus
//   (needs_data либо calculated); это тоже выделенный переход мимо
//   матрицы — как у ручного сброса.
// • lost — терминальный с одной веткой: lost→new — только мастеру,
//   с записью причины отказа в журнал (роут В2).
// • calculated→new нет: расчёт сделан — лид уже двигается; возврат
//   из отказа проходит путь lost→new→calculated (варианты при отказе
//   не удаляются, порог «≥1 вариант» на этом пути выполняется).
//   Удаление вариантов статус тоже не откатывает — expectedLeadStatus
//   предложил бы new, но автомата пропускать переходы, которых нет
//   в матрице (см. lead-auto-status.ts).
// • needs_data (DF-27 волна 2, §6.4/D75) — автоматический статус
//   неполной анкеты: назначает и снимает ТОЛЬКО сервер в транзакциях
//   сохранения анкеты и операций с вариантами (expectedLeadStatus);
//   вручную — только закрытие lost (из needs_data) и никакой ручной
//   переход ВНУТРЬ (validateStatusChange).
export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ['needs_data', 'calculated', 'lost'],
  needs_data: ['new', 'calculated', 'lost'],
  calculated: ['needs_data', 'lost'],
  client_approved: ['lost'],
  won: [],
  lost: ['new'],
}

// ─── DF-27 волна 2 (§6.4, D75): единственный автомат статуса ──────
// Детерминированная функция целевого статуса по полноте анкеты:
//   • won/lost — автоматикой не трогаются (терминальные);
//   • client_approved не меняется фоновым пересчётом — его снятие
//     делает только явная правка анкеты (Р-1) или ручной сброс;
//   • анкета неполна → needs_data;
//   • иначе есть варианты → calculated;
//   • иначе → new.
// Вызов ОБЯЗАН получать optionsCount и missingCount ПОСЛЕ применения
// правки (состояние-после), а не до. Применение перехода —
// lead-auto-status.ts (проверка матрицы + запись в той же транзакции).
export function expectedLeadStatus(
  current: LeadStatus,
  optionsCount: number,
  missingCount: number
): LeadStatus {
  if (current === 'won' || current === 'lost' || current === 'client_approved') {
    return current
  }
  if (missingCount > 0) return 'needs_data'
  if (optionsCount > 0) return 'calculated'
  return 'new'
}

export type TransitionResult = { ok: true } | { ok: false; status: number; error: string }

// Повтор статуса — 400 (осознанная ошибка «я думал, что перевёл»,
// тот же контракт, что был в роуте В2); запрещённый переход — 409
// (конфликт с состоянием, а не с синтаксисом тела запроса).
function checkTransition<S extends string>(
  table: Record<S, readonly S[]>,
  labels: Record<S, string>,
  from: S,
  to: S
): TransitionResult {
  if (from === to) {
    return { ok: false, status: 400, error: `Статус уже: ${labels[to]}` }
  }
  const allowed = table[from] ?? []
  if (!allowed.includes(to)) {
    const list = allowed.map((s) => `«${labels[s]}»`).join(', ')
    return {
      ok: false,
      status: 409,
      error: `Переход «${labels[from]}» → «${labels[to]}» не разрешён. Допустимо: ${list || 'статус терминальный, переходов нет'}`,
    }
  }
  return { ok: true }
}

export function checkOrderTransition(from: OrderStatus, to: OrderStatus): TransitionResult {
  return checkTransition(ORDER_TRANSITIONS, ORDER_STATUS_LABELS, from, to)
}

export function checkLeadTransition(from: LeadStatus, to: LeadStatus): TransitionResult {
  return checkTransition(LEAD_TRANSITIONS, LEAD_STATUS_LABELS, from, to)
}

// ─── Документ (DF-12): Черновик/На проверке → Финальный → возврат ──
// • финализировать — из draft и in_review; кто может — решает роут
//   (только сотрудник, requireEmployee), топология переходов — здесь.
// • у final единственный переход — «Вернуть в работу» с обязательной
//   причиной → in_review; повтор «Финальный» по финальному — 400
//   («Статус уже»), как у лида/заявки.
// • черновик → «На проверке» вручную не ставится: статус in_review
//   возникает только возвратом из финала; клиент/брокер загружают
//   версии в draft и in_review, гард финальности — lib/document-upload.ts.
export const DOCUMENT_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  // DF-26: «отправить на проверку» — автор/сотрудник переводит черновик
  // в in_review (событие document_submitted); финализация из черновика
  // остаётся (короткий контур без проверки).
  draft: ['in_review', 'final'],
  in_review: ['final'],
  final: ['in_review'],
}

export function checkDocumentTransition(
  from: DocumentStatus,
  to: DocumentStatus
): TransitionResult {
  return checkTransition(DOCUMENT_TRANSITIONS, DOCUMENT_STATUS_LABELS, from, to)
}

// ─── Проекции для UI (P1-05: показываем только допустимое) ────
// Код + подпись рядом: кнопкам переходов не нужен отдельный словарь.
export type TransitionOption<S extends string> = { status: S; label: string }

function allowedLabeled<S extends string>(
  table: Record<S, readonly S[]>,
  labels: Record<S, string>,
  from: S
): Array<TransitionOption<S>> {
  return (table[from] ?? []).map((status) => ({ status, label: labels[status] }))
}

export function allowedOrderTransitionsLabeled(
  from: OrderStatus
): Array<TransitionOption<OrderStatus>> {
  return allowedLabeled(ORDER_TRANSITIONS, ORDER_STATUS_LABELS, from)
}

export function allowedLeadTransitionsLabeled(
  from: LeadStatus
): Array<TransitionOption<LeadStatus>> {
  return allowedLabeled(LEAD_TRANSITIONS, LEAD_STATUS_LABELS, from)
}
