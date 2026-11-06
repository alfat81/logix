import type { DocumentRow } from '@/lib/documents'
import { DOCUMENT_KIND_GROUPS } from '@/lib/document-phases'
import {
  DOCUMENT_KIND_PROVIDERS,
  INTERNAL_ONLY_KINDS,
  resolveDocumentKind,
  type DocProvider,
  type DocumentKind,
  type DocumentStatus,
  type PackageSlotStatus,
} from '@/lib/document-constants'
import { PHASE_OF_KIND, type DocumentPhase } from '@/lib/document-phases'

// ─── DF-13: пакет документов заявки — чистые хелперы ────────────────
// Слоты = строки по видам (D5) со статусом «нет/черновик/на проверке/
// финальный», поставщиком и документами вида. Модуль БЕЗ серверных
// импортов (единственный импорт типов из documents.ts — type-only,
// стирается при компиляции): собирается и в роутах, и в vitest.
// Чтение БД, хранилище и ZIP — в document-package-server.ts.

// ── Порог ZIP ───────────────────────────────────────────────────────
// Карточка DF-13: «проверить ограничения размера ответа на Vercel».
// Serverless-функция Vercel отдаёт максимум 4,5 МБ тела ответа — порог
// 4 МиБ с запасом ниже предела (архив собирается в памяти, store-уровень
// fflate: размер ≈ сумме исходников). Больше — JSON-список ссылок.
export const PACKAGE_ZIP_MAX_TOTAL_BYTES = 4 * 1024 * 1024

// ── Слоты ───────────────────────────────────────────────────────────

// DF-14: требование чек-листа, видимое в слоте («требуется для этапа
// X»). blocking — вариант подписи: «обязательно»/«рекомендуется».
export type SlotRequirement = {
  stageCode: string
  stageName: string
  blocking: boolean
}

export type PackageSlot = {
  kind: DocumentKind
  // DF-26: фаза вида — группировка реестра и структура ZIP (один
  // источник — document-phases.ts).
  phase: DocumentPhase
  status: PackageSlotStatus
  provider: DocProvider | null
  documents: DocumentRow[]
  // DF-14: этапы ЭТОЙ заявки, в чек-листе которых есть вид слота;
  // заполняет attachRequirements (buildPackageSlots ставит пусто).
  requiredFor: SlotRequirement[]
}

// Худший = наименее продвинутый статус (draft < in_review < final).
const STATUS_SEVERITY: Record<DocumentStatus, number> = {
  draft: 1,
  in_review: 2,
  final: 3,
}

export function worstDocumentStatus(statuses: readonly DocumentStatus[]): DocumentStatus {
  let worst: DocumentStatus = 'final'
  for (const s of statuses) {
    if (STATUS_SEVERITY[s] < STATUS_SEVERITY[worst]) worst = s
  }
  return worst
}

// kind — источник истины; страховка чтения — общий resolveDocumentKind
// (DF-14: тот же резолв у чек-листов и правила 8 «у кого мяч»).

// Слоты для аудитории: staff — все виды, клиенту/брокеру подрядческие
// виды не показываются вовсе (их документы всегда внутренние, DF-15 —
// сам факт строки раскрывал бы внутренний контур). Порядок — фазовые
// группы D5 (DOCUMENT_KIND_GROUPS покрывают список полностью, unit-тест).
export function packageKindsForAudience(includeInternal: boolean): readonly DocumentKind[] {
  const ordered = DOCUMENT_KIND_GROUPS.flatMap((g) => g.kinds)
  if (includeInternal) return ordered
  const hidden = new Set<string>(INTERNAL_ONLY_KINDS)
  return ordered.filter((k) => !hidden.has(k))
}

export function buildPackageSlots(
  documents: readonly DocumentRow[],
  kinds: readonly DocumentKind[],
): PackageSlot[] {
  const byKind = new Map<DocumentKind, DocumentRow[]>()
  for (const doc of documents) {
    const kind = resolveDocumentKind(doc)
    const bucket = byKind.get(kind)
    if (bucket) bucket.push(doc)
    else byKind.set(kind, [doc])
  }
  return kinds.map((kind) => {
    const docs = byKind.get(kind) ?? []
    return {
      kind,
      phase: PHASE_OF_KIND[kind],
      status: docs.length === 0 ? 'none' : worstDocumentStatus(docs.map((d) => d.status as DocumentStatus)),
      provider: DOCUMENT_KIND_PROVIDERS[kind],
      documents: docs,
      requiredFor: [],
    }
  })
}

// DF-14: attach требований чек-листов к слотам. Вход — требования
// этапов ЭТОЙ заявки (stageCode ∈ orderStageCodes; имена — живой lookup
// каталога). Слоты видов без требований и виды, которых нет в slots
// (внутренние у внешних читателей), остаются с пустым requiredFor.
export function attachRequirements(
  slots: readonly PackageSlot[],
  orderStageCodes: readonly string[],
  requirements: ReadonlyArray<{ stageCode: string; kind: string; isBlocking: boolean }>,
  stageNames: ReadonlyMap<string, string>
): PackageSlot[] {
  const codes = new Set(orderStageCodes)
  const byKind = new Map<DocumentKind, SlotRequirement[]>()
  for (const r of requirements) {
    if (!codes.has(r.stageCode)) continue
    const list = byKind.get(r.kind as DocumentKind) ?? []
    list.push({
      stageCode: r.stageCode,
      stageName: stageNames.get(r.stageCode) ?? r.stageCode,
      blocking: r.isBlocking,
    })
    byKind.set(r.kind as DocumentKind, list)
  }
  return slots.map((s) => ({ ...s, requiredFor: byKind.get(s.kind) ?? [] }))
}

// Сводка для кнопки ZIP: только финальные документы, размер — по их
// финальной версии (finalVersion ?? текущая; у финального всегда есть).
export function packageFinalSummary(documents: readonly DocumentRow[]): {
  count: number
  totalBytes: number
  zipAvailable: boolean
} {
  let count = 0
  let totalBytes = 0
  for (const doc of documents) {
    if (doc.status !== 'final') continue
    const v = doc.versions.find((x) => x.version === (doc.finalVersion ?? doc.currentVersion))
    count += 1
    totalBytes += v?.fileSize ?? 0
  }
  return { count, totalBytes, zipAvailable: count > 0 && totalBytes <= PACKAGE_ZIP_MAX_TOTAL_BYTES }
}

// ── Имена файлов в ZIP: санитизация + транслитерация ────────────────
// Карточка DF-13: структура <номер заявки>/<вид>-<название>-v<версия>.<расширение>,
// имена санитизируются и транслитерируются — ZIP должен открываться на
// любой файловой системе без битой кириллицы (Windows-архиваторы).

// Практическая транслитерация (ГОСТ-подобная: ж→zh, х→kh, ц→ts…);
// регистр первой буквы сохраняется (Ж→Zh). Ъ/Ь выпадают.
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function transliterateFileName(input: string): string {
  let out = ''
  for (const ch of input) {
    const lower = ch.toLowerCase()
    const mapped = TRANSLIT[lower]
    if (mapped !== undefined) {
      out += ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1)
    } else if (/[a-z0-9._-]/i.test(ch)) {
      out += ch
    } else {
      out += ch.trim() === '' ? '-' : ''
    }
  }
  // Серия разделителей → один дефис, разделители по краям срезать.
  const collapsed = out.replace(/-+/g, '-').replace(/^[-._]+|[-._]+$/g, '')
  if (!collapsed) return 'doc'
  return collapsed.length > 80 ? collapsed.slice(0, 80).replace(/[-.]+$/, '') : collapsed
}

/** Папка внутри ZIP — номер заявки («17-1»), санитизирован. */
export function packageFolderName(orderNumber: string): string {
  return transliterateFileName(orderNumber)
}

/** Имя файла версии в ZIP: <вид>-<название>-v<версия>.<расширение>. */
export function packageEntryName(
  kind: DocumentKind,
  title: string,
  version: number,
  fileName: string,
): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const kindPart = kind.replaceAll('_', '-')
  const titlePart = transliterateFileName(title)
  return `${kindPart}-${titlePart}-v${version}${ext ? `.${ext}` : ''}`
}

/** Имя самого архива для Content-Disposition (DF-26: + scope). */
export function packageZipFileName(orderNumber: string, scope?: string): string {
  const base = `documents-${transliterateFileName(orderNumber)}`
  return scope ? `${base}-${scope}.zip` : `${base}.zip`
}
