import { db } from '@/lib/db'
import { ORDER_ACTIVE_STATUSES } from '@/lib/order-constants'
import { resolveDocumentKind, type DocProvider, type DocumentKind } from '@/lib/document-constants'
import {
  requirementKindLabel,
  requirementSatisfiedBy,
  type RequirementKind,
} from '@/lib/stage-doc-requirements'
import { recomputeWaitingOrder } from '@/lib/waiting-db'

// ─── DF-14: чек-листы этапов — серверные операции ───────────────────
// Чтение БД и пересчёты. Чистая логика (дефолты, missingKinds) — в
// stage-doc-requirements.ts (без серверных импортов, тестируется и в
// UI). Роуты требований — в api/admin/stage-catalog/requirements.

// ── Блокирующий режим: что мешает завершить этап ────────────────────

export type MissingDocRow = {
  kind: RequirementKind
  label: string
  providedBy: DocProvider
}

/** Строка недостающего для 409/override-диалога (объединённый список). */
export type StageBlocker = MissingDocRow & { source: 'doc_requirement' | 'permit' }

/**
 * Блокирующие требования этапа без финального документа этого вида на
 * заявке. Финал любого документа вида закрывает требование (та же
 * семантика, что у слотов пакета DF-13: документы вида — множество,
 * требование — одно). Легаси-строки без kind резолвятся общим
 * resolveDocumentKind.
 */
export async function missingBlockingDocsForStage(
  orderId: string,
  stageCode: string
): Promise<MissingDocRow[]> {
  const reqs = await db.stageDocumentRequirement.findMany({
    where: { stageCode, isBlocking: true },
    select: { kind: true, providedBy: true },
  })
  if (reqs.length === 0) return []
  const docs = await db.document.findMany({
    where: { orderId, status: 'final' },
    select: { kind: true, type: true, isInternal: true },
  })
  // DF-26 §4.3.4: семейство transport_document закрывается любым из
  // четырёх вариантов (requirementSatisfiedBy), подпись — «Транспортная
  // накладная»; требование на конкретный вариант — точным совпадением.
  const finalKinds = new Set<DocumentKind>(docs.map((d) => resolveDocumentKind(d)))
  return reqs
    .filter((r) => !requirementSatisfiedBy(r.kind as RequirementKind, finalKinds))
    .map((r) => ({
      kind: r.kind as RequirementKind,
      label: requirementKindLabel(r.kind as RequirementKind),
      providedBy: r.providedBy as DocProvider,
    }))
}

// ── Требования со stage name (UI справочника) ───────────────────────

export type RequirementRow = {
  id: string
  stageCode: string
  stageName: string
  kind: DocumentKind
  kindLabel: string
  providedBy: DocProvider
  isBlocking: boolean
}

/**
 * Требования чек-листов; stageName — живой lookup по каталогу (строка
 * с несуществующим кодом этапа — теоретически возможна только после
 * ручных правок БД, имя fallback'ом на код: UI не ломается).
 */
export async function loadRequirementRows(stageCode?: string): Promise<RequirementRow[]> {
  const [reqs, catalog] = await Promise.all([
    db.stageDocumentRequirement.findMany({
      ...(stageCode ? { where: { stageCode } } : {}),
      orderBy: [{ stageCode: 'asc' }, { kind: 'asc' }],
    }),
    db.orderStageCatalog.findMany({ select: { code: true, name: true } }),
  ])
  const names = new Map(catalog.map((c) => [c.code, c.name]))
  return reqs.map((r) => ({
    id: r.id,
    stageCode: r.stageCode,
    stageName: names.get(r.stageCode) ?? r.stageCode,
    kind: r.kind as DocumentKind,
    // DF-26: селект справочника показывает и логический тип
    kindLabel: requirementKindLabel(r.kind as RequirementKind),
    providedBy: r.providedBy as DocProvider,
    isBlocking: r.isBlocking,
  }))
}

// ── Пересчёт «у кого мяч» после правки чек-листа ────────────────────
// Требование — настройка КАТАЛОГА: оно влияет на все активные заявки с
// этим этапом. События-цели у правки нет (как у POST/PATCH каталога
// этапов), поэтому пересчёт запускается прямо из роута после мутации —
// иначе мяч на заявках устареет до следующего события по ним.

export async function recomputeActiveOrdersForStage(stageCode: string): Promise<number> {
  const orders = await db.order.findMany({
    where: {
      status: { in: [...ORDER_ACTIVE_STATUSES] },
      stages: { some: { stageCode } },
    },
    select: { id: true },
  })
  for (const o of orders) {
    await recomputeWaitingOrder(db, o.id)
  }
  return orders.length
}

// ── Гард завершения этапа (DF-14 + DF-26 волна 2, критерий приёмки) ─
// Этап нельзя перевести в done, пока (а) для него есть блокирующее
// требование чек-листа без финального документа вида ИЛИ (б) есть
// блокирующее разрешительное требование PermitRequirement со
// stageCode=этот этап в статусе pending|submitted (SPEC §9 п. 2;
// requirements без stageCode блокировку не получают внезапно —
// существующие строки не блокируют). Обход — осознанный: мастер +
// override=true + overrideComment (журнал, прецедент P1-05; лестница
// 403/400 — общий override-guard). Рекомендованные (isBlocking=false)
// не блокируют.

import { assertOverridePermission } from '@/lib/override-guard'

export type StageDoneGuard =
  | { ok: true; missing: StageBlocker[] }
  | { ok: false; status: number; error: string; missing?: StageBlocker[] }

/**
 * Полный список блокеров этапа: чек-листы (вид документа) + разрешительные
 * требования (stageCode, pending|submitted, isBlocking). Не выполняется
 * в одной паре запросов сознательно: оба лёгкие, читаемость важнее.
 */
export async function stageBlockers(orderId: string, stageCode: string): Promise<StageBlocker[]> {
  const [docs, permits] = await Promise.all([
    missingBlockingDocsForStage(orderId, stageCode),
    db.permitRequirement.findMany({
      where: {
        orderId,
        stageCode,
        isBlocking: true,
        status: { in: ['pending', 'submitted'] },
      },
      select: { id: true, title: true, providedBy: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return [
    ...docs.map((m) => ({ ...m, source: 'doc_requirement' as const })),
    ...permits.map((p) => ({
      kind: 'permit_document' as RequirementKind,
      label: p.title,
      providedBy: p.providedBy as DocProvider,
      source: 'permit' as const,
    })),
  ]
}

export async function guardStageDone(opts: {
  orderId: string
  stageCode: string
  override?: boolean
  overrideComment?: string
  isMaster: boolean
}): Promise<StageDoneGuard> {
  const missing = await stageBlockers(opts.orderId, opts.stageCode)
  if (missing.length === 0) return { ok: true, missing: [] }
  const denial = assertOverridePermission({
    override: opts.override,
    overrideComment: opts.overrideComment,
    isMaster: opts.isMaster,
  })
  if (denial) return { ok: false, status: denial.status, error: denial.error, missing }
  if (!opts.override) {
    return {
      ok: false,
      status: 409,
      error: `Этап нельзя завершить: нет документов — ${missing
        .map((m) => `«${m.label}»`)
        .join(', ')}. Мастер может перекрыть: override=true + overrideComment`,
      missing,
    }
  }
  return { ok: true, missing }
}
