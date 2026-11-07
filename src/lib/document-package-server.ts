import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { attachRequirements, buildPackageSlots, packageKindsForAudience } from '@/lib/document-package'
import {
  isTransportKind,
  phaseForStage,
  suggestedTransportVariant,
} from '@/lib/document-phases'
import { buildPackageSummary } from '@/lib/document-summary'
import { getSetting } from '@/lib/settings'
import { DOC_LIST_READY_WHERE, DOC_PUBLIC_FIELDS, type DocumentRow } from '@/lib/documents'
import { PERMIT_EXTERNAL_FIELDS } from '@/lib/permits-db'
import { listPermitChecks } from '@/lib/permit-checks-db'
import { projectDocumentAuthors, type ActorNameReader } from '@/lib/actor-name'

// ─── DF-13/DF-26: пакет документов заявки — серверное ядро слотов ───
// Чтение документов пакета и сводка позиций (§3.4). Роуты трёх
// кабинетов делают только auth-guard и зовут общий ответ: резолв
// владения заявкой и видимость внутри (аудитория пакета — тот же
// ActorNameReader, что и проекция имён). Сборка ZIP — в
// document-zip-server.ts (финальные — DF-13; все доступные/выбранные —
// DF-26 §8).

/**
 * Заявка пакета с проверкой владения по кабинету: сотрудник — любой,
 * клиент — своя (customerId), брокер — связь OrderBroker; null → 404
 * (факт существования чужой заявки не раскрываем, паттерн И1).
 * transportType — подсказка варианта транспортной накладной (§4.3).
 */
export async function resolvePackageOrder(
  orderId: string,
  reader: ActorNameReader,
): Promise<{ id: string; number: string; transportType: string | null } | null> {
  if (reader.kind === 'staff') {
    return db.order.findUnique({
      where: { id: orderId },
      select: { id: true, number: true, transportType: true },
    })
  }
  if (reader.kind === 'client') {
    return db.order.findFirst({
      where: { id: orderId, customerId: reader.customerId },
      select: { id: true, number: true, transportType: true },
    })
  }
  const link = await db.orderBroker.findUnique({
    where: { orderId_brokerId: { orderId, brokerId: reader.brokerId } },
    select: { order: { select: { id: true, number: true, transportType: true } } },
  })
  return link?.order ?? null
}

/** Документы заявки для пакета: готовые версии, внутренние — по аудитории. */
export async function loadPackageDocuments(
  orderId: string,
  includeInternal: boolean,
): Promise<DocumentRow[]> {
  return db.document.findMany({
    where: {
      orderId,
      ...DOC_LIST_READY_WHERE,
      ...(includeInternal ? {} : { isInternal: false }),
    },
    select: DOC_PUBLIC_FIELDS,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  })
}

/** Готовый ответ слотов: 404 на чужую, проекция авторов одним резолвом. */
export async function packageSlotsResponse(
  orderId: string,
  reader: ActorNameReader,
  maxMb: number,
): Promise<NextResponse> {
  const order = await resolvePackageOrder(orderId, reader)
  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }
  const includeInternal = reader.kind === 'staff'
  // DF-14: чек-листы этапов ЭТОЙ заявки — подпись «требуется для этапа»
  // в слоте; имена этапов — живой lookup каталога (клиент/брокер видят
  // те же названия в степпере; требований подрядческих видов в их
  // ответе нет вместе со слотами — buildPackageSlots их отрезает).
  // DF-26: разрешительные — для сводки позиций и строк реестра (§3.2,
  // §3.3.3) — ОДИН запрос (полная проекция без staffNote), статусы
  // строк питают и buildPackageSummary, и реестр.
  const [documents, stageRows, requirementRows, permitRows, catalog] = await Promise.all([
    loadPackageDocuments(orderId, includeInternal).then((docs) =>
      projectDocumentAuthors(docs, reader)
    ),
    db.orderStageInstance.findMany({
      where: { orderId },
      select: { stageCode: true, status: true, sequence: true },
      orderBy: { sequence: 'asc' },
    }),
    db.stageDocumentRequirement.findMany({
      select: { stageCode: true, kind: true, isBlocking: true },
    }),
    db.permitRequirement.findMany({
      where: { orderId },
      // DF-26 волна 2: bindingState — только сотрудникам (метка
      // «требует ручной привязки», §5.7 п. 0а); наружу — без него.
      select: { ...PERMIT_EXTERNAL_FIELDS, bindingState: true },
      orderBy: [{ isBlocking: 'desc' }, { createdAt: 'asc' }],
    }),
    db.orderStageCatalog.findMany({ select: { code: true, name: true } }),
  ])
  // DF-26 §3.2/§3.3.3: строки разрешительных для реестра и сводки панели
  // — внешняя проекция (без staffNote), независимо от кабинета.
  // Реестр строится одним запросом + список требований (§11.1).
  // DF-26 §11.1: stagePhase — фаза реестра, куда попадает строка
  // требования (PHASE_OF_STAGE от PermitRequirement.stageCode → остаточная
  // группа 07; требование без stageCode — в 07, блокировка этапа на нём
  // не появляется внезапно, §9). Миграция df_26_docs_center дала колонку
  // — вычисление включено (контракт ответа не менялся).
  const permits = permitRows.map((p) => ({
    ...p,
    stagePhase: (p.stageCode ? phaseForStage(p.stageCode) : null) ?? ('permits' as const),
    ...(reader.kind === 'staff' ? {} : { bindingState: undefined }),
  }))
  const stageNames = new Map(catalog.map((c) => [c.code, c.name]))
  const slots = attachRequirements(
    buildPackageSlots(documents, packageKindsForAudience(includeInternal)),
    stageRows.map((s) => s.stageCode),
    requirementRows,
    stageNames
  )
  // DF-26 §4.3: подсказка варианта транспортной накладной — только
  // слотам семейства (у остальных null), из типа перевозки заявки.
  const suggested = suggestedTransportVariant(order.transportType)
  const slotsUi = slots.map((s) => ({
    ...s,
    suggestedVariant: isTransportKind(s.kind) ? suggested : null,
  }))
  const summary = buildPackageSummary({
    documents,
    stageRequirements: requirementRows,
    stages: stageRows,
    permits: permitRows,
    stageNames,
  })
  // DF-26 волна 2 (§11.1): проверки ТН ВЭД — только admin/broker
  // (клиенту контур проверок не показывается, §7).
  const checks =
    reader.kind === 'staff' || reader.kind === 'broker' ? await listPermitChecks({ orderId }) : []
  // DF-26 волна 2 (§5.5): окно усиленной плашки — из настроек (одна
  // выборка с пакетом; UI не ходит за настройкой отдельным запросом).
  const warnDaysBefore = reader.kind === 'staff' ? await getSetting('permits.warn_days_before') : undefined
  return NextResponse.json({
    orderNumber: order.number,
    maxMb,
    slots: slotsUi,
    summary,
    permits,
    ...(checks.length > 0 ? { checks } : {}),
    ...(warnDaysBefore !== undefined ? { warnDaysBefore } : {}),
  })
}
