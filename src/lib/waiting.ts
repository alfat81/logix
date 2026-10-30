// ─── DF-05 «У кого мяч»: чистые правила ожидания ─────────────────────
// Каждая сделка отвечает на вопрос «чего она ждёт и от кого»
// (карточка DF-05): waitingOnKind (manager|client|broker|contractor|none),
// причина-код, id держателя мяча и waitingSince. Правила — таблица
// приоритетов из карточки: побеждает ПЕРВОЕ сработавшее правило.
//
// Файл БЕЗ серверных зависимостей (как status-machine.ts): импортируется
// lib/waiting-db.ts (пересчёт в транзакции), unit-тестами и UI
// (подписи для плашки «Ждёт: …»). Запись в БД — ТОЛЬКО waiting-db.ts.
//
// D31 (заморозка кабинета): kind 'contractor' — маркер для СОТРУДНИКОВ
// («Ждём перевозчика» в списках и Пульсе), NOT кабинет и NOT уведомление:
// статус этапа вносит менеджер, поэтому просрочка (6б) выносит мяч
// менеджеру. Клиенту kind не отдаётся вообще (нейтральный текст решает
// клиентский роут, см. проекции API).
//
// Глоссарий RULES 2.6: Contractor в UI — «перевозчик», не «подрядчик».

import { businessDaysElapsed } from '@/lib/business-days'

// ─── Кто держит мяч ───────────────────────────────────────────────────

export const WAITING_KINDS = [
  'manager',
  'client',
  'broker',
  'contractor',
  'none',
] as const
export type WaitingKind = (typeof WAITING_KINDS)[number]

// Подписи для плашки «Ждёт: …» (родительный падеж). В UI сотрудника.
export const WAITING_KIND_LABELS: Record<WaitingKind, string> = {
  manager: 'менеджера',
  client: 'клиента',
  broker: 'брокера',
  contractor: 'перевозчика',
  none: '—',
}

// ─── Причины (коды — в БД, подписи — в UI сотрудника) ────────────────
// Коды awaiting_permit (DF-16) и awaiting_document (DF-14) появятся
// вместе со своими карточками — мёртвых кодов заранее не заводим (G4).

export const WAITING_REASONS = [
  'stage_problem',
  'calculating',
  'awaiting_client_approval',
  'awaiting_broker_estimate',
  'stage_unassigned',
  'stage_overdue_followup',
  'stage_in_progress',
  'stage_not_started',
  'awaiting_proforma',
  'no_quote',
  'awaiting_client_choice',
] as const
export type WaitingReason = (typeof WAITING_REASONS)[number]

export const WAITING_REASON_LABELS: Record<WaitingReason, string> = {
  stage_problem: 'Проблема на этапе',
  calculating: 'Готовим расчёт',
  awaiting_client_approval: 'Согласование клиентом',
  awaiting_broker_estimate: 'Ожидаем оценку брокера',
  stage_unassigned: 'Исполнитель не назначен',
  stage_overdue_followup: 'Этап просрочен — связаться',
  stage_in_progress: 'Этап в работе',
  stage_not_started: 'Этап ещё не начат',
  awaiting_proforma: 'Ждём проформу/описание товара',
  no_quote: 'Вариант расчёта не готов',
  awaiting_client_choice: 'Ждём выбор варианта расчёта',
}

// Нейтральные формулировки для клиента (кабинет клиента показывает
// плашку ТОЛЬКО когда мяч у клиента; никаких «менеджер/брокер/этап»).
// awaiting_client_choice здесь НЕТ: варианты живут на запросе, а
// waiting запроса наружу не отдаётся (клиент выбирает вне системы,
// D45) — код нужен только сотрудникам.
export const WAITING_CLIENT_LABELS: Partial<Record<WaitingReason, string>> = {
  awaiting_client_approval: 'Ожидает вашего подтверждения',
  awaiting_proforma: 'Ожидаем проформу-инвойс или описание товара',
}

// ─── D45: эскалация «клиент не выбрал расчёт» ────────────────────────
// Решение владельца (D45, вариант (б) из отчёта 0.7.2): если на запросе
// НЕСКОЛЬКО вариантов расчёта (≥2) и выбранного нет — мяч у клиента;
// если выбор не сделан 2 РАБОЧИХ ДНЯ (пн–пт, МСК) — менеджеру плашка
// «уточнить, видел ли клиент расчёт». До пороги — обычная плашка
// «Ждёт: клиента»; после — текст-действие (бейдж и секция внимания).
export const CHOICE_FOLLOWUP_BUSINESS_DAYS = 2

export function isChoiceFollowupDue(sinceUtc: Date, nowUtc: Date): boolean {
  return businessDaysElapsed(sinceUtc, nowUtc) >= CHOICE_FOLLOWUP_BUSINESS_DAYS
}

// Короткий хвост плашки на карточке: «Ждёт: клиента · 3 дн. — уточнить расчёт».
export const WAITING_CHOICE_FOLLOWUP_SHORT = 'уточнить расчёт'

// Полный текст-действие (секция «Ждут дольше N часов», tooltip бейджа).
export const WAITING_CHOICE_FOLLOWUP_ACTION =
  'Уточнить, видел ли клиент расчёт, и согласовать дальнейшие действия'

// Возраст мяча одним значением: «N ч» до суток, далее «N дн.» — общий
// формат плашки «Ждёт: …» (WaitingBadge) и сводки владельцу (DF-08),
// чтобы возраст в письме и на карточке не расходился.
export function formatWaitingHours(hours: number): string {
  return hours < 24 ? `${hours} ч` : `${Math.floor(hours / 24)} дн.`
}

// Результат правила: kind 'none' — мяча нет (id/reason пустые).
export type WaitingOutcome = {
  kind: WaitingKind
  reason: WaitingReason | null
  // Держатель мяча: customerId/assignedToId/brokerId/contractorId —
  // по смыслу правила (для Пульса DF-07 и подсветки ответственного).
  onId: string | null
}

export const WAITING_NONE: WaitingOutcome = { kind: 'none', reason: null, onId: null }

// ─── Заявка: снимок для правил ────────────────────────────────────────
// Структуры — плоские данные из Prisma-select (waiting-db.ts собирает),
// чтобы compute оставался чистым и тестируемым без БД.

export type WaitingStageSnapshot = {
  sequence: number
  status: string // not_started | in_progress | done | problem
  contractorId: string | null
  plannedDate: Date | null
}

export type WaitingBrokerSnapshot = {
  brokerId: string
  // Оценка платежей есть (запись BrokerEstimate, черновик или отправка).
  hasEstimate: boolean
}

export type WaitingOrderSnapshot = {
  status: string // calculating | confirmed | in_progress | completed | cancelled
  customerId: string | null
  assignedToId: string | null
  stages: WaitingStageSnapshot[]
  brokers: WaitingBrokerSnapshot[]
}

export type WaitingLeadSnapshot = {
  status: string // new | calculated | won | lost
  customerId: string | null
  // Описание товара (cargoInfo.cargoName) — сигнал «клиент дал описание».
  cargoName: string | null
  // На лиде есть инвойс/проформа (Document.type = 'invoice').
  hasInvoiceDoc: boolean
  brokers: WaitingBrokerSnapshot[]
  optionsCount: number
  // Выбранный вариант есть (QuoteOption.isSelected, инвариант «ровно
  // один» на уровне API В3) — D45: правило 4 смотрит на «выбранного нет».
  hasSelectedOption: boolean
}

// «Просрочка» плана этапа — ТА ЖЕ семантика, что на «Требует внимания»
// (Ж5) и в списке заявок Ж4: план на сегодня — НЕ просрочка, просрочка
// с завтра; даты — UTC-полночь из UI. todayUtc — начало текущего
// UTC-дня (Date.UTC-срез), передаётся параметром для чистоты тестов.
export function isStageOverdue(
  stage: WaitingStageSnapshot,
  todayUtc: Date
): boolean {
  return stage.plannedDate !== null && stage.plannedDate.getTime() < todayUtc.getTime()
}

// Ближайший незавершённый этап = первый по sequence со статусом != done
// (определение Ж4; включая «проблему» — её ловит правило 2 раньше).
export function nearestUnfinishedStage(
  stages: WaitingStageSnapshot[]
): WaitingStageSnapshot | null {
  const unfinished = stages.filter((s) => s.status !== 'done')
  if (unfinished.length === 0) return null
  return unfinished.reduce((a, b) => (a.sequence <= b.sequence ? a : b))
}

// ─── Правила заявки (приоритет сверху вниз, первое сработавшее) ──────

export function computeWaitingOrder(
  snap: WaitingOrderSnapshot,
  todayUtc: Date
): WaitingOutcome {
  // 1. Терминальные статусы — мяча нет (завершена/отменена).
  if (snap.status === 'completed' || snap.status === 'cancelled') return WAITING_NONE
  // 2. Любой этап в статусе «проблема» — мяч у менеджера.
  if (snap.stages.some((s) => s.status === 'problem')) {
    return { kind: 'manager', reason: 'stage_problem', onId: snap.assignedToId }
  }
  // 3. Расчёт — готовит менеджер.
  if (snap.status === 'calculating') {
    return { kind: 'manager', reason: 'calculating', onId: snap.assignedToId }
  }
  // 4. Согласование — ждём подтверждения клиента.
  if (snap.status === 'confirmed') {
    return { kind: 'client', reason: 'awaiting_client_approval', onId: snap.customerId }
  }
  // 5. Подключённый брокер без оценки платежей — ждём брокера.
  //    Оценки живут на связях лида (LeadBroker → BrokerEstimate); у
  //    ручной заявки (без лида) оценить их не из чего — правило не
  //    применяется (решение зафиксировано в отчёте DF-05).
  const brokerWithoutEstimate = snap.brokers.find((b) => !b.hasEstimate)
  if (brokerWithoutEstimate) {
    return {
      kind: 'broker',
      reason: 'awaiting_broker_estimate',
      onId: brokerWithoutEstimate.brokerId,
    }
  }
  // 6/6б/7 — правила БЛИЖАЙШЕГО незавершённого этапа.
  const nearest = nearestUnfinishedStage(snap.stages)
  if (nearest) {
    // 6. Исполнитель не назначен — мяч у менеджера.
    if (!nearest.contractorId) {
      return { kind: 'manager', reason: 'stage_unassigned', onId: snap.assignedToId }
    }
    // 6б. Просрочен план — менеджеру связаться с исполнителем (D31:
    // статусы ведёт менеджер, поэтому просрочка — его мяч).
    if (isStageOverdue(nearest, todayUtc)) {
      return { kind: 'manager', reason: 'stage_overdue_followup', onId: snap.assignedToId }
    }
    // 7. Этап у перевозчика в срок — мяч у перевозчика (маркер только
    // для сотрудников; клиенту ничего не отдаётся).
    return {
      kind: 'contractor',
      reason: nearest.status === 'in_progress' ? 'stage_in_progress' : 'stage_not_started',
      onId: nearest.contractorId,
    }
  }
  // Активная заявка без этапов (ручная Б3 до наполнения) — правила нет,
  // мяча нет. Зафиксировано в отчёте DF-05 как осознанный фолбэк.
  return WAITING_NONE
}

// ─── Правила запроса (фаза расчёта, карточка DF-05) ──────────────────

export function computeWaitingLead(snap: WaitingLeadSnapshot): WaitingOutcome {
  // won/lost — терминальные (won ставит только конвертация В4).
  if (snap.status === 'won' || snap.status === 'lost') return WAITING_NONE
  // 1. Ни проформы-инвойса (Document.type='invoice'), ни описания
  //    товара (cargoInfo.cargoName) — ждём материалы от клиента.
  if (!snap.cargoName && !snap.hasInvoiceDoc) {
    return { kind: 'client', reason: 'awaiting_proforma', onId: snap.customerId }
  }
  // 2. Подключённый брокер без оценки — ждём брокера.
  const brokerWithoutEstimate = snap.brokers.find((b) => !b.hasEstimate)
  if (brokerWithoutEstimate) {
    return {
      kind: 'broker',
      reason: 'awaiting_broker_estimate',
      onId: brokerWithoutEstimate.brokerId,
    }
  }
  // 3. Вариантов расчёта нет — мяч у менеджера.
  if (snap.optionsCount === 0) {
    return { kind: 'manager', reason: 'no_quote', onId: null }
  }
  // 4. Вариантов НЕСКОЛЬКО (≥2) и выбранного нет → мяч у КЛИЕНТА
  //    (D45 — открытый вопрос карточки закрыт вариантом (б) из отчёта
  //    0.7.2: выбор клиент сообщает менеджеру вне системы; фиксирует
  //    менеджер PATCH /api/admin/options/[id]). Один вариант не покрыт
  //    осознанно — по букве D45 («несколько расчётов»). Эскалация
  //    менеджеру через 2 рабочих дня — isChoiceFollowupDue (UI-слой:
  //    WaitingBadge и секция внимания), состояние здесь от времени
  //    НЕ зависит (см. waiting-db.ts).
  if (snap.optionsCount >= 2 && !snap.hasSelectedOption) {
    return { kind: 'client', reason: 'awaiting_client_choice', onId: snap.customerId }
  }
  return WAITING_NONE
}
