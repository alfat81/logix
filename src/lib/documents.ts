import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { EmployeeActor, ClientActor, BrokerActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { documentEventAudience } from '@/lib/audience'

// ─── Документооборот (Дорожка Е, роадмап 5): серверное ядро ────────
// Этот модуль тянет db и activity — из клиентских компонентов импорт
// запрещён (клиент-безопасные константы — document-constants.ts).
// Роуты трёх кабинетов (админ, клиент, брокер) отвечают за авторизацию
// и видимость сделки. Механика двухфазной загрузки (DF-11) — в
// document-upload.ts (шаг 1: pending-запись и presigned PUT) и
// document-confirm.ts (шаг 3: проверка объекта и перевод в ready);
// здесь — проекции списков, удаление и правила видимости.

// ── Акторы и цели документооборота ──────────────────────────────────
// deal — ровно одна цель (инвариант enforced типом, как ActivityTarget).
// actor — сотрудник / клиент / брокер (подрядчика в контуре Е нет).
// DF-02A (Блок 4): у клиента/брокера authorId = id ПОЛЬЗОВАТЕЛЯ
// (CustomerUser/BrokerUser), authorName — снимок КОМПАНИИ; отображаемое
// имя собирается при чтении (lib/actor-name.ts) по роли читателя.

export type DocActor = EmployeeActor | ClientActor | BrokerActor

export type DocumentDealTarget = { leadId: string } | { orderId: string }

// ── Проекции для списков (без fileData!) ────────────────────────────
// fileData не должен покидать сервер в списочных ответах: байты живут
// в БД/хранилище до единственного авторизующего роута скачивания.
// DF-11: pending-версии в списках не показываются — загрузка либо
// подтвердилась (ready), либо её ещё нет.

export const DOC_VERSION_PUBLIC_FIELDS = {
  id: true,
  version: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  status: true,
  comment: true,
  authorType: true,
  // DF-02A (Блок 4): id пользователя — ключ проекции имени при чтении
  // (lib/actor-name.ts); непрозрачен (cuid), наружу не персональные
  // данные, но стабильная ссылка на автора версии.
  authorId: true,
  authorName: true,
  createdAt: true,
} as const

export const DOC_VERSION_READY_WHERE = { status: 'ready' } as const

// Фильтр списков документов: карточка без ни одной готовой версии
// (заброшенная загрузка) спискам не показывается; уборка —
// pruneAbandonedUploads (document-upload.ts).
export const DOC_LIST_READY_WHERE = { versions: { some: { status: 'ready' } } } as const

export const DOC_PUBLIC_FIELDS = {
  id: true,
  type: true,
  title: true,
  isInternal: true,
  currentVersion: true,
  createdAt: true,
  updatedAt: true,
  versions: {
    where: DOC_VERSION_READY_WHERE,
    select: DOC_VERSION_PUBLIC_FIELDS,
    orderBy: { version: 'desc' as const },
    // Страховка от «документ-обожно»: история версий в интерфейсе —
    // окно, а не бесконечная лента (полная история — в БД).
    take: 50,
  },
} as const

export type DocumentRow = Prisma.DocumentGetPayload<{ select: typeof DOC_PUBLIC_FIELDS }>
export type DocumentVersionRow = Prisma.DocumentVersionGetPayload<{
  select: typeof DOC_VERSION_PUBLIC_FIELDS
}>

// ── Удаление документа (только менеджер) ────────────────────────────
// Вся история версий уходит каскадом; след остаётся в ленте сделки.
// DF-11: объекты версий в хранилище удаляются вместе со строками
// (best-effort: осиротевший объект в приватном бакете не утечка).
export async function deleteDocument(
  documentId: string,
  actor: DocActor,
): Promise<{ title: string } | null> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      leadId: true,
      orderId: true,
      isInternal: true,
      versions: { select: { storageKey: true } },
    },
  })
  if (!doc) return null

  await db.document.delete({ where: { id: documentId } })

  const { getStorage } = await import('@/lib/storage')
  const storage = getStorage()
  for (const { storageKey } of doc.versions) {
    if (!storageKey) continue
    try {
      await storage.deleteObject(storageKey)
    } catch (e) {
      console.error('storage delete failed on document delete', e)
    }
  }

  // DF-16: разрешительный, закрытый этим документом, возвращается в
  // ожидание (плашка и «у кого мяч» восстанавливаются, пересчёт внутри).
  const { revertPermitDocument } = await import('@/lib/permits-db')
  await revertPermitDocument(documentId)

  const deal: DocumentDealTarget = doc.orderId
    ? { orderId: doc.orderId }
    : { leadId: doc.leadId! }
  await emitEvent(db, {
    target: deal,
    actor,
    type: 'document_deleted',
    description: `Документ «${doc.title}» удалён`,
    documentId: doc.id,
    audience: documentEventAudience(doc.isInternal),
  })
  return { title: doc.title }
}

// ── Видимость документа для внешних кабинетов ────────────────────────
// Единая точка правил для роутов версий (клиент/брокер) и скачивания.
// Возврат null = «не существует или не ваше» → 404 у вызывающего:
// факт существования чужого/внутреннего документа не раскрываем
// (паттерн И1: чужая заявка — 404, не 403).

export type VisibleDocument = {
  id: string
  title: string
  isInternal: boolean
  leadId: string | null
  orderId: string | null
}

export async function documentVisibleToClient(
  documentId: string,
  clientId: string,
): Promise<VisibleDocument | null> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      isInternal: true,
      leadId: true,
      orderId: true,
      lead: { select: { customerId: true } },
      order: { select: { customerId: true } },
    },
  })
  if (!doc || doc.isInternal) return null

  if (doc.order) {
    return doc.order.customerId === clientId ? doc : null
  }
  if (doc.lead) {
    return doc.lead.customerId === clientId ? doc : null
  }
  return null
}

export async function documentVisibleToBroker(
  documentId: string,
  brokerId: string,
): Promise<VisibleDocument | null> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      isInternal: true,
      leadId: true,
      orderId: true,
      // Лид с заявкой (won) скрыт от брокера целиком (Д: «сделка
      // живёт заявкой») — документы на таком лиде видны через заявку,
      // а прямой доступ к «хвосту» на лиде закрыт.
      lead: {
        select: {
          order: { select: { id: true } },
          brokers: { where: { brokerId }, select: { id: true } },
        },
      },
      order: {
        select: { brokers: { where: { brokerId }, select: { id: true } } },
      },
    },
  })
  if (!doc || doc.isInternal) return null

  if (doc.order) {
    return doc.order.brokers.length > 0 ? doc : null
  }
  if (doc.lead && !doc.lead.order) {
    return doc.lead.brokers.length > 0 ? doc : null
  }
  return null
}

// ── Перенос при конвертации (В4): лид → заявка ──────────────────────
// Документы, рождённые на лида (предварительный инвойс для расчёта
// пошлины — роадмап 5), переезжают на заявку вместе со сделкой.
// Идемпотентно (updateMany с фильтром), связь с лидом через
// order.lead остаётся у самой сделки — документы ей не нужны.
export async function carryDocumentsToOrder(
  leadId: string,
  orderId: string,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = tx ?? db
  const res = await client.document.updateMany({
    where: { leadId, orderId: null },
    data: { orderId, leadId: null },
  })
  return res.count
}
