import {
  DOCUMENT_KIND_LABELS,
  resolveDocumentKind,
  type DocumentKind,
} from '@/lib/document-constants'
import { PHASE_OF_STAGE, type DocumentPhase } from '@/lib/document-phases'

// ─── DF-26 §3.4: сводка по обязательным позициям (три состояния) ────
// Счётчик считает ОБЯЗАТЕЛЬНЫЕ ДОКУМЕНТНЫЕ ПОЗИЦИИ, а не файлы:
// блокирующие виды чек-листов этапов ЭТОЙ заявки + блокирующие
// разрешительные требования (waived вне счётчика). Позиция ровно в
// одном из трёх состояний: выполнено (финал вида / received), на
// проверке (in_review / submitted), не готово (черновик, файла нет,
// pending). «Загруженное не считается отсутствующим»: позиция с
// файлом на проверке не попадает в «не готово» (замечание 4 ред. 1.3).
// Чистый модуль БЕЗ серверных зависимостей — unit-тест §13.1.
// Вынесен из document-package.ts (RULES 2.14: файл ≤ 300 строк).

export type PackageSummaryCounts = {
  requiredDone: number
  requiredInReview: number
  requiredMissing: number
  requiredTotal: number
  permitsPending: number
  permitsSubmitted: number
  currentStageName: string | null
  currentStagePhase: DocumentPhase | null
  nextStageBlockers: string[]
  nonFinalDrafts: number
  nonFinalReview: number
}

export type SummaryDocInput = {
  status: string
  kind: string | null
  type: string
  isInternal: boolean
}

export function buildPackageSummary(inputs: {
  documents: readonly SummaryDocInput[]
  /** Чек-листы КАТАЛОГА (фильтр по этапам заявки внутри). */
  stageRequirements: ReadonlyArray<{ stageCode: string; kind: string; isBlocking: boolean }>
  /** Этапы ЭТОЙ заявки (порядок = sequence). */
  stages: ReadonlyArray<{ stageCode: string; status: string; sequence: number }>
  permits: ReadonlyArray<{ status: string; isBlocking: boolean }>
  stageNames: ReadonlyMap<string, string>
}): PackageSummaryCounts {
  const kinds = inputs.documents.map((d) => resolveDocumentKind(d))
  const finalKinds = new Set<DocumentKind>()
  const reviewKinds = new Set<DocumentKind>()
  for (let i = 0; i < kinds.length; i++) {
    const status = inputs.documents[i].status
    if (status === 'final') finalKinds.add(kinds[i])
    else if (status === 'in_review') reviewKinds.add(kinds[i])
  }

  const orderStageCodes = new Set(inputs.stages.map((s) => s.stageCode))
  // Позиции-виды: блокирующие требования этапов ЭТОЙ заявки (каждый вид
  // — одна позиция, сколько бы файлов у него ни было).
  const blockingKinds = new Set<DocumentKind>()
  for (const r of inputs.stageRequirements) {
    if (r.isBlocking && orderStageCodes.has(r.stageCode)) {
      blockingKinds.add(r.kind as DocumentKind)
    }
  }
  let done = 0
  let inReview = 0
  let missing = 0
  for (const k of blockingKinds) {
    if (finalKinds.has(k)) done += 1
    else if (reviewKinds.has(k)) inReview += 1
    else missing += 1
  }

  // Позиции-разрешительные: isBlocking, кроме waived. received →
  // выполнено, submitted → на проверке, pending → не готово.
  // permitsPending/permitsSubmitted — счётчик СТРОК по всем
  // разрешительным (waived вне), согласован с состояниями позиций.
  let permitsPending = 0
  let permitsSubmitted = 0
  for (const p of inputs.permits) {
    if (p.status === 'pending') permitsPending += 1
    else if (p.status === 'submitted') permitsSubmitted += 1
    if (!p.isBlocking || p.status === 'waived') continue
    if (p.status === 'received') done += 1
    else if (p.status === 'submitted') inReview += 1
    else missing += 1
  }

  // Текущий этап — первый незавершённый по sequence (§3.2);
  // «Для этапа N нет: …» — блокирующие виды этого этапа без финала.
  const current = [...inputs.stages]
    .sort((a, b) => a.sequence - b.sequence)
    .find((s) => s.status !== 'done')
  let nextStageBlockers: string[] = []
  if (current) {
    nextStageBlockers = inputs.stageRequirements
      .filter(
        (r) =>
          r.isBlocking &&
          r.stageCode === current.stageCode &&
          !finalKinds.has(r.kind as DocumentKind),
      )
      .map((r) => DOCUMENT_KIND_LABELS[r.kind as DocumentKind] ?? r.kind)
  }

  // Предупреждение ZIP «все доступные» — счётчики по статусам
  // документов выборки (§8.1.3: draft → «черновики», in_review →
  // «на проверке»); тот же список, что уходит в архив (§8.1.3).
  let nonFinalDrafts = 0
  let nonFinalReview = 0
  for (const d of inputs.documents) {
    if (d.status === 'draft') nonFinalDrafts += 1
    else if (d.status === 'in_review') nonFinalReview += 1
  }

  return {
    requiredDone: done,
    requiredInReview: inReview,
    requiredMissing: missing,
    requiredTotal: done + inReview + missing,
    permitsPending,
    permitsSubmitted,
    currentStageName: current ? (inputs.stageNames.get(current.stageCode) ?? current.stageCode) : null,
    currentStagePhase: current ? PHASE_OF_STAGE[current.stageCode] ?? null : null,
    nextStageBlockers,
    nonFinalDrafts,
    nonFinalReview,
  }
}
