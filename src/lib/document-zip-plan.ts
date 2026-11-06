import {
  resolveDocumentKind,
  type DocumentKind,
} from '@/lib/document-constants'
import { zipFolderForKind } from '@/lib/document-phases'
import { packageEntryName, packageFolderName } from '@/lib/document-package'
import type { DocumentRow } from '@/lib/documents'

// ─── DF-26 §8: план ZIP «все доступные» / «выбранные» ────────────────
// Чистый модуль (unit-тест §13.1): структура папок по фазам (§8.2),
// исходные имена файлов, безопасные суффиксы коллизий « (vN)» → « (2)»,
// счётчики предупреждения «все доступные» из ОДНОГО списка с составом
// архива (расхождение исключено по построению — замечание 6 ред. 1.3).
// Чтение БД, хранилище и zipSync — в document-package-server.ts.

export type ZipScopeItem = {
  documentId: string
  kind: string | null
  type: string
  isInternal: boolean
  title: string
  status: string
  // Последняя ГОТОВАЯ версия документа (§8.1.3 — не finalVersion ?? current;
  // у возвращённого в работу документа в архив уходит актуальная версия).
  versionId: string
  version: number
  fileName: string
  fileSize: number
}

export type ZipScopePlan = {
  entries: Array<{
    /** Полный путь в архиве: <номер заявки>/<фаза>/<имя файла>. */
    path: string
    /** Имя для фолбэка-списка (относительно папки заявки). */
    name: string
    item: ZipScopeItem
  }>
  totalBytes: number
  nonFinalDrafts: number
  nonFinalReview: number
}

/**
 * План архива: папка фазы — по PHASE_OF_KIND (misc — в корень), имя
 * файла — фактический вид (BL не путается с CMR, §4.3.5). Коллизии
 * имени в одной папке — суффикс « (vN)» по номеру версии, при повторе
 * « (2)», « (3)» (§8.2.2).
 */
export function planScopeZip(
  orderNumber: string,
  items: readonly ZipScopeItem[],
): ZipScopePlan {
  const folder = packageFolderName(orderNumber)
  const used = new Set<string>()
  const entries: ZipScopePlan['entries'] = []
  let nonFinalDrafts = 0
  let nonFinalReview = 0
  let totalBytes = 0

  for (const item of items) {
    if (item.status === 'draft') nonFinalDrafts += 1
    if (item.status === 'in_review') nonFinalReview += 1
    totalBytes += item.fileSize

    // Виды логического типа «Транспортная накладная» — каждый в своей
    // строке реестра и в имени файла (агрегирует слот, не ZIP-папка).
    const kind = resolveDocumentKind({
      kind: item.kind,
      type: item.type,
      isInternal: item.isInternal,
    }) as DocumentKind
    const base = packageEntryName(kind, item.title, item.version, item.fileName)
    const phaseFolder = zipFolderForKind(item.kind)
    const rel = phaseFolder ? `${phaseFolder}/${base}` : base

    let name = rel
    if (used.has(`${folder}/${name}`)) {
      const dot = rel.lastIndexOf('.')
      const stem = dot > 0 ? rel.slice(0, dot) : rel
      const ext = dot > 0 ? rel.slice(dot) : ''
      name = `${stem} (v${item.version})${ext}`
      let n = 2
      while (used.has(`${folder}/${name}`)) {
        name = `${stem} (${n})${ext}`
        n += 1
      }
    }
    used.add(`${folder}/${name}`)
    entries.push({ path: `${folder}/${name}`, name, item })
  }

  return { entries, totalBytes, nonFinalDrafts, nonFinalReview }
}

/** Выбор последней готовой версии из проекции документа (DOC_PUBLIC_FIELDS). */
export function lastReadyVersion(doc: DocumentRow): {
  id: string
  version: number
  fileName: string
  fileSize: number
} | null {
  for (const v of doc.versions) {
    // versions отсортированы по version desc (проекция списков) —
    // pending-версии в списке не показываются (DOC_VERSION_READY_WHERE).
    return { id: v.id, version: v.version, fileName: v.fileName, fileSize: v.fileSize }
  }
  return null
}
