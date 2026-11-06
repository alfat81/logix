import type { DocumentPhase } from '@/lib/document-phases'
import type { DocRowUi } from './types'

// ─── DF-26: типы реестра документов заявки (§3.3) ───────────────────
// Вынесено из DocumentsRegistrySection (RULES 2.14, G4): строки фаз,
// слоты-ожидания, сводка панели. Списочные проекции без fileData.

export type SlotRowUi = {
  kind: string
  phase: DocumentPhase | string
  status: string
  provider: 'client' | 'broker' | 'staff' | null
  documents: DocRowUi[]
  requiredFor?: Array<{ stageCode: string; stageName: string; blocking: boolean }>
  // DF-26 §4.3: подсказка варианта транспортной накладной (только
  // слотам семейства transport_document).
  suggestedVariant?: string | null
}

export type SummaryUi = {
  requiredDone: number
  requiredInReview: number
  requiredMissing: number
  requiredTotal: number
  permitsPending: number
  permitsSubmitted: number
  currentStageName: string | null
  currentStagePhase: DocumentPhase | string | null
  nextStageBlockers: string[]
  nonFinalDrafts: number
  nonFinalReview: number
}

// Строка разрешительного требования реестра (§3.3.3): внешняя
// проекция без staffNote (PERMIT_EXTERNAL_FIELDS) + stagePhase — фаза,
// куда строка попадает (§11.1; в №21 всегда остаточная группа 07,
// колонка stageCode у требования — волна 2).
export type PermitLiteUi = {
  id: string
  title: string
  providedBy: 'client' | 'broker' | 'staff'
  isBlocking: boolean
  neededBy: string | null
  status: 'pending' | 'received' | 'waived' | string
  documentId: string | null
  receivedAt: string | null
  receivedByName: string | null
  waivedReason: string | null
  createdAt: string
  stagePhase?: DocumentPhase | string
}

export type RegistryFilter = 'all' | 'permits' | 'nonfinal'

// Группа реестра: одна фаза — строки документов + строки-ожидания
// + строки разрешительных требований (§3.3.3: требование — в фазе
// своего этапа по stagePhase; в №21 все — в остаточной группе 07).
export type PhaseGroup = {
  phase: DocumentPhase
  docs: DocRowUi[]
  emptySlots: SlotRowUi[]
  permits: PermitLiteUi[]
}

// Ответ package-роута для реестра (§3.2/§3.3): номер заявки, лимит
// загрузки, слоты, сводка панели и строки разрешительных.
export type RegistryData = {
  orderNumber: string
  maxMb: number
  slots: SlotRowUi[]
  summary: SummaryUi
  permits: PermitLiteUi[]
}
