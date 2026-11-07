import { z } from 'zod'

// ─── DF-26 волна 2: проверки ТН ВЭД — чистые правила (SPEC §5.1–5.3, §5.7) ──
// Клиент-безопасный файл (как permits.ts): БЕЗ серверных зависимостей —
// импортируется роутами, UI и unit-тестами. Запись в БД — ТОЛЬКО
// permit-checks-db.ts (серверный модуль).
//
// Проверка — запись о РЕЗУЛЬТЕ по паре (сделка, код ТН ВЭД): все
// позиции с одинаковым кодом получают один ответ. Требование
// (PermitRequirement) система сама не создаёт — auto-запись всегда
// unclear (инвариант 2); требования рождаются явным решением человека
// («Требуется» — ручная проверка или пересмотр §5.7).

// ─── Результат проверки ──────────────────────────────────────────────

export const PERMIT_CHECK_RESULTS = ['required', 'not_required', 'unclear', 'failed'] as const
export type PermitCheckResult = (typeof PERMIT_CHECK_RESULTS)[number]

// Ручная проверка фиксирует required/not_required/failed; unclear —
// состояние auto-записи (человек «требует уточнения» не ставит: это
// «данных недостаточно», а не решение).
export const MANUAL_CHECK_RESULTS = ['required', 'not_required', 'failed'] as const

// ─── Исходы пересмотра (§5.7 п. 3/3а; словари источников и статусов — в CHECK/индексах БД) ──

export const PERMIT_CHECK_REVIEW_OUTCOMES = [
  'requirement_kept',
  'requirement_waived',
  'new_requirement',
  'not_required',
  'unclear_confirmed',
  'mixed',
] as const
export type PermitCheckReviewOutcome = (typeof PERMIT_CHECK_REVIEW_OUTCOMES)[number]

export const PERMIT_CHECK_REVIEW_OUTCOME_LABELS: Record<PermitCheckReviewOutcome, string> = {
  requirement_kept: 'Требование остаётся в силе',
  requirement_waived: 'Требование снято',
  new_requirement: 'Создано новое требование',
  not_required: 'Разрешительный не требуется',
  unclear_confirmed: 'Данных всё ещё недостаточно',
  mixed: 'Часть требований осталась, часть снята/заменена',
}

// Решения по каждому активному требованию позиции (§5.7 п. 3а).
export const PERMIT_CHECK_DECISION_ACTIONS = ['keep', 'waive', 'replace'] as const
export type PermitCheckDecisionAction = (typeof PERMIT_CHECK_DECISION_ACTIONS)[number]

// ─── Лимиты полей ────────────────────────────────────────────────────

export const PERMIT_CHECK_BASIS_MAX = 500
export const PERMIT_CHECK_DICTIONARY_VERSION_MAX = 100
export const PERMIT_CHECK_REVIEW_REASON_MAX = 500

// ─── Схемы API ───────────────────────────────────────────────────────

const hsCode10 = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Код ТН ВЭД — ровно 10 цифр')

// Поля нового требования при result='required' (§5.3): название,
// кто предоставляет, срок, блокирует ли этап и какой.
export const PermitCheckRequirementDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Укажите название документа')
    .max(200, 'Название — не длиннее 200 символов'),
  providedBy: z.enum(['client', 'broker', 'staff'], {
    errorMap: () => ({ message: 'Кто предоставляет: client | broker | staff' }),
  }),
  isBlocking: z.boolean().optional(),
  neededBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Срок — дата в формате ГГГГ-ММ-ДД')
    .nullable()
    .optional(),
  stageCode: z.string().trim().max(40).nullable().optional(),
})

// POST /api/{admin|broker}/{orders|leads}/[id]/permit-checks — фиксация
// результата. Параметра itemId НЕТ (§11.2): охват определяется кодом
// автоматически (все позиции сделки с этим кодом, §5.1 инв. 3).
// result='required' требует черновик требования — по одному на каждую
// охваченную позицию без активного требования по коду; not_required
// требует основание (400 без него).
export const CreatePermitCheckSchema = z
  .object({
    hsCode: hsCode10,
    result: z.enum(MANUAL_CHECK_RESULTS, {
      errorMap: () => ({ message: 'Результат: required | not_required | failed' }),
    }),
    basis: z.string().trim().max(PERMIT_CHECK_BASIS_MAX).nullable().optional(),
    dictionaryVersion: z.string().trim().max(PERMIT_CHECK_DICTIONARY_VERSION_MAX).nullable().optional(),
    requirement: PermitCheckRequirementDraftSchema.optional(),
  })
  .refine((v) => v.result !== 'not_required' || Boolean(v.basis?.trim()), {
    message: 'Для «Не требуется» укажите основание',
    path: ['basis'],
  })
  .refine((v) => v.result !== 'failed' || Boolean(v.basis?.trim()), {
    message: 'Для «Проверка не выполнена» укажите причину',
    path: ['basis'],
  })
  .refine((v) => v.result !== 'required' || Boolean(v.requirement), {
    message: 'Для «Требуется» заполните требование (название, кто предоставляет)',
    path: ['requirement'],
  })
export type CreatePermitCheckInput = z.infer<typeof CreatePermitCheckSchema>

// POST /api/admin/permit-checks/[id]/review — пересмотр при изменении
// кода (§5.7). Краткая форма (позиция с одним активным требованием):
// {outcome, reason?, requirement?}; полная — decisions[] по каждому
// активному требованию позиции (нет решения по активному → 400).
export const PermitCheckDecisionSchema = z.object({
  requirementId: z.string().trim().min(1),
  action: z.enum(PERMIT_CHECK_DECISION_ACTIONS, {
    errorMap: () => ({ message: 'Решение: keep | waive | replace' }),
  }),
  // Причина обязательна для waive/replace (с указанием нового кода).
  reason: z.string().trim().max(PERMIT_CHECK_REVIEW_REASON_MAX).nullable().optional(),
  replacement: PermitCheckRequirementDraftSchema.optional(),
})

export const ReviewPermitCheckSchema = z
  .object({
    outcome: z.enum(PERMIT_CHECK_REVIEW_OUTCOMES, {
      errorMap: () => ({ message: 'Недопустимый исход пересмотра' }),
    }),
    reason: z.string().trim().max(PERMIT_CHECK_REVIEW_REASON_MAX).nullable().optional(),
    // Краткая форма ред. 1.1: единственное активное требование позиции.
    requirement: PermitCheckRequirementDraftSchema.optional(),
    decisions: z.array(PermitCheckDecisionSchema).optional(),
  })
  .refine((v) => v.outcome !== 'requirement_waived' || Boolean(v.reason?.trim() || v.decisions?.some((d) => d.reason?.trim())), {
    message: 'Для снятия требования укажите причину (с новым кодом)',
    path: ['reason'],
  })
  .refine(
    (v) =>
      !v.decisions ||
      v.decisions.every(
        (d) => d.action !== 'waive' && d.action !== 'replace' ? true : Boolean(d.reason?.trim()),
      ),
    { message: 'Для снятия/замены требования укажите причину', path: ['decisions'] },
  )
  .refine((v) => v.outcome !== 'new_requirement' || Boolean(v.requirement || v.decisions?.some((d) => d.replacement)), {
    message: 'Для «нужно новое требование» заполните его поля',
    path: ['requirement'],
  })
export type ReviewPermitCheckInput = z.infer<typeof ReviewPermitCheckSchema>

// ─── Чистые правила ──────────────────────────────────────────────────

// Сводный исход по решениям (§5.7 п. 3а): requirement_kept — все
// остались; requirement_waived — все сняты; new_requirement — хотя бы
// одно заменено новым; mixed — часть осталась, часть снята/заменена.
export function outcomeFromDecisions(
  decisions: { action: PermitCheckDecisionAction }[]
): PermitCheckReviewOutcome {
  const kept = decisions.filter((d) => d.action === 'keep').length
  const waived = decisions.filter((d) => d.action === 'waive').length
  const replaced = decisions.filter((d) => d.action === 'replace').length
  if (replaced > 0) return kept > 0 || waived > 0 ? 'mixed' : 'new_requirement'
  if (kept > 0 && waived > 0) return 'mixed'
  if (kept > 0) return 'requirement_kept'
  if (waived > 0) return 'requirement_waived'
  // Пустой список решений не доходит сюда (сервер отклоняет 400).
  return 'mixed'
}

// Ручная версия справочника для снимка (§5.1): 'manual:<дата>'.
export function manualDictionaryVersion(at: Date = new Date()): string {
  return `manual:${at.toISOString().slice(0, 10)}`
}
