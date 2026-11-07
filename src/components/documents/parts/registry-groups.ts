import {
  DOCUMENT_PHASES,
  isTransportKind,
  suggestedTransportVariant,
  type DocumentPhase,
} from '@/lib/document-phases'
import type { DocRowUi } from './types'
import type {
  PermitLiteUi,
  PhaseGroup,
  RegistryFilter,
  SlotRowUi,
} from './registry-types'

// ─── DF-26 §3.3: разрезка реестра по фазам — чистые хелперы (T21-03).
// Документы и слоты — по фазе вида; строки разрешительных требований —
// по stagePhase из package-роута (§11.1; в №21 — остаточная группа 07).
// Файл, закрывающий требование, в строку реестра не дублируется
// (§3.3.3 — показывается один раз, внутри строки требования).

type RegistrySlotsInput = {
  slots: SlotRowUi[]
  permits?: PermitLiteUi[]
}

/**
 * Группы фаз реестра. filter 'permits' — только остаточная группа 07;
 * 'nonfinal' — строки без финального статуса. Пустые фазы не выводятся
 * (принцип DF-13: пустые показываются свёрнутыми — решает аккордеон
 * секции; здесь — только непустые группы).
 */
export function buildPhaseGroups(
  data: RegistrySlotsInput,
  filter: RegistryFilter,
  transportType?: string | null,
): PhaseGroup[] {
  const suggested = suggestedTransportVariant(transportType)
  const transportPresent = data.slots.some(
    (s) => isTransportKind(s.kind) && s.documents.length > 0,
  )
  // Файл закрытого требования — внутри строки требования (§3.3.3):
  // отдельной строкой реестра не дублируется.
  const linkedDocIds = new Set(
    (data.permits ?? []).map((p) => p.documentId).filter((x): x is string => Boolean(x)),
  )
  const permitsByPhase = new Map<string, PermitLiteUi[]>()
  for (const p of data.permits ?? []) {
    const ph = (p.stagePhase as string | undefined) ?? 'permits'
    const list = permitsByPhase.get(ph) ?? []
    list.push(p)
    permitsByPhase.set(ph, list)
  }

  // DF-26 волна 2: требования со stageCode живут в фазах СВОИХ этапов
  // (§3.3.3), остаточная группа 07 — только для требований без этапа и
  // проверок. Фильтр «Разрешительные» показывает фазу 07 И фазы, где
  // есть строки требований (иначе строки «терялись» при фильтре).
  const phasesWithPermits = new Set(permitsByPhase.keys())
  const result: PhaseGroup[] = []
  for (const phase of DOCUMENT_PHASES) {
    if (filter === 'permits' && phase !== 'permits' && !phasesWithPermits.has(phase)) continue
    const phaseSlots = data.slots.filter((s) => s.phase === phase)
    const docs = phaseSlots.flatMap((s) => s.documents)
    const visibleDocs =
      filter === 'nonfinal'
        ? docs.filter((d) => d.status !== 'final')
        : docs.filter((d) => !(phase === 'permits' && linkedDocIds.has(d.id)))
    const emptySlots = phaseSlots.filter(
      (s) =>
        s.documents.length === 0 &&
        ((s.requiredFor?.length ?? 0) > 0 ||
          // Логический слот накладной: одна строка на семейство, пока
          // нет ни одного варианта (подсказка — по типу перевозки).
          (isTransportKind(s.kind) && s.kind === (suggested ?? 'bill_of_lading') && !transportPresent)),
    )
    const phasePermits = permitsByPhase.get(phase) ?? []
    if (visibleDocs.length === 0 && emptySlots.length === 0 && phasePermits.length === 0) continue
    result.push({ phase, docs: visibleDocs, emptySlots, permits: phasePermits })
  }
  return result
}

/**
 * Счётчик в заголовке фазы. Фаза 07 несёт сводку по разрешительным
 * (§3.3.3/§3.4): «ожидаются A · на проверке B» — те же числа, что в
 * сводке панели и чипе фильтра; иначе — всего строк; иначе — счётчик
 * документов фазы.
 */
export function phaseHeaderCount(
  phase: DocumentPhase,
  docs: readonly DocRowUi[],
  emptySlots: readonly SlotRowUi[],
  permits: readonly PermitLiteUi[],
  summary?: { permitsPending: number; permitsSubmitted: number } | null,
): string {
  if (phase === 'permits') {
    const pending = summary?.permitsPending ?? 0
    const review = summary?.permitsSubmitted ?? 0
    if (pending + review > 0) {
      return [
        pending > 0 ? `ожидаются ${pending}` : null,
        review > 0 ? `на проверке ${review}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    }
    if (permits.length > 0) return `всего ${permits.length}`
  }
  return docs.length + emptySlots.length === 0
    ? 'пусто'
    : `${docs.length} / ${docs.length + emptySlots.length}`
}
