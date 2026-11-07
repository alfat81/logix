import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import { documentEventAudience } from '@/lib/audience'
import { getStorage } from '@/lib/storage'
import { resolveFileMime } from '@/lib/file-signature'
import {
  DOC_PUBLIC_FIELDS,
  DOC_VERSION_PUBLIC_FIELDS,
  type DocActor,
  type DocumentDealTarget,
  type DocumentRow,
  type DocumentVersionRow,
} from '@/lib/documents'
import { DOC_SIGNATURE_ERROR, maxUploadBytes, uploadSizeError } from '@/lib/document-upload'
import { linkPermitRequirements, reopenPermitsForDocument } from '@/lib/permits-db'

// ─── DF-11: подтверждение загрузки (шаг 3 после presigned PUT) ───────
// Сервер читает ПЕРВЫЕ байты и размер объекта (не весь файл): проверяет
// сигнатуру против заявленного MIME и лимит files.max_mb. При несовпадении
// объект удаляется, запись pending тоже (400 — с внятной формулировкой).
// Права проверяет роут ДО вызова: чужая версия — единый 404 до любого
// обращения к хранилищу (паттерн И1, карточка DF-11).

export async function loadVersionForConfirm(versionId: string) {
  return db.documentVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      documentId: true,
      status: true,
      storageKey: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      version: true,
      comment: true,
      authorType: true,
      authorId: true,
      authorName: true,
      createdAt: true,
      document: {
        select: { id: true, title: true, isInternal: true, leadId: true, orderId: true, currentVersion: true },
      },
    },
  })
}

export type PendingVersionForConfirm = NonNullable<
  Awaited<ReturnType<typeof loadVersionForConfirm>>
>

export type ConfirmOutcome =
  | { ok: true; version: DocumentVersionRow; document: DocumentRow; permitIds: string[] }
  | { ok: false; status: number; error: string }

/** Сигнал «неудача confirm» без исключений: роут маппит в ответ. */
class ConfirmRejected extends Error {
  constructor(
    public outcome: { status: number; error: string },
  ) {
    super(outcome.error)
  }
}

export async function confirmDocumentVersion(
  pending: PendingVersionForConfirm,
  actor: DocActor,
  opts: { permitRequirementId?: string; permitRequirementIds?: string[] },
): Promise<ConfirmOutcome> {
  if (pending.status !== 'pending') {
    return { ok: false, status: 409, error: 'Загрузка уже подтверждена' }
  }
  const key = pending.storageKey
  if (!key) {
    return { ok: false, status: 409, error: 'Загрузка не начата — повторите загрузку файла' }
  }

  const storage = getStorage()
  try {
    const maxBytes = await maxUploadBytes()
    const headInfo = await storage.head(key)
    if (!headInfo) {
      return { ok: false, status: 400, error: 'Файл не загружен — повторите загрузку' }
    }
    if (headInfo.size === 0) {
      await storage.deleteObject(key)
      return { ok: false, status: 400, error: 'Прикрепите непустой файл' }
    }
    if (headInfo.size > maxBytes) {
      await storage.deleteObject(key)
      return { ok: false, status: 400, error: uploadSizeError(headInfo.size, maxBytes) }
    }
    const head = await storage.readRange(key, 0, 1023)
    if (resolveFileMime(pending.mimeType, pending.fileName, head) !== pending.mimeType) {
      await storage.deleteObject(key)
      return { ok: false, status: 400, error: DOC_SIGNATURE_ERROR }
    }

    const deal: DocumentDealTarget = pending.document.orderId
      ? { orderId: pending.document.orderId }
      : { leadId: pending.document.leadId! }

    // DF-26 волна 2 (§6.4 п. 1): один документ может закрывать несколько
    // требований (permitRequirementIds); одиночное поле — прежний контракт.
    const permitIds = [
      ...(opts.permitRequirementId ? [opts.permitRequirementId] : []),
      ...(opts.permitRequirementIds ?? []),
    ]
    const versionNumber = pending.version
    // Новое содержимое у документа связанного ПРИНЯТОГО требования
    // возвращает его в submitted (§6.4 п. 4б) — только для версий > 1
    // (первая загрузка переоткрывать нечего).
    const isNewVersion = versionNumber > 1

    const result = await db.$transaction(async (tx) => {
      // Защита от гонки двух confirm: готовит версию только тот вызов,
      // который застал её в pending (updateMany с фильтром статуса).
      const flipped = await tx.documentVersion.updateMany({
        where: { id: pending.id, status: 'pending' },
        data: { status: 'ready', fileSize: headInfo.size },
      })
      if (flipped.count === 0) {
        throw new ConfirmRejected({ status: 409, error: 'Загрузка уже подтверждена' })
      }

      if (permitIds.length > 0) {
        await linkPermitRequirements(tx, {
          permitIds,
          deal,
          actor,
          documentId: pending.documentId,
        })
      }
      if (isNewVersion) {
        // §5.4/§6.4 п. 4: авто-возврат ПО КАЖДОМУ принятому требованию
        // (только received; submitted не трогается) — в той же транзакции.
        await reopenPermitsForDocument(tx, {
          documentId: pending.documentId,
          documentTitle: pending.document.title,
          actor,
          reason: `загружена версия ${versionNumber} документа «${pending.document.title}»`,
        })
      }

      // currentVersion — максимальный подтверждённый номер: версии
      // создаются pending с номером current+1, подтверждаться могут не по
      // порядку — берём max, а не присвоение.
      const cur = await tx.document.findUnique({
        where: { id: pending.documentId },
        select: { currentVersion: true },
      })
      await tx.document.update({
        where: { id: pending.documentId },
        data: { currentVersion: Math.max(cur?.currentVersion ?? 1, versionNumber) },
      })

      const version = await tx.documentVersion.findUnique({
        where: { id: pending.id },
        select: DOC_VERSION_PUBLIC_FIELDS,
      })
      const document = await tx.document.findUnique({
        where: { id: pending.documentId },
        select: DOC_PUBLIC_FIELDS,
      })
      if (!version || !document) {
        throw new ConfirmRejected({ status: 500, error: 'Не удалось подтвердить загрузку' })
      }

      // Событие в той же транзакции (DoD 9): откат данных откатывает событие.
      await emitEvent(tx, {
        target: deal,
        actor,
        type: versionNumber === 1 ? 'document_created' : 'document_version_added',
        description:
          versionNumber === 1
            ? `Документ «${document.title}» (версия 1)${pending.comment ? `: ${pending.comment}` : ''}`
            : `Версия ${versionNumber} документа «${document.title}»${pending.comment ? `: ${pending.comment}` : ''}`,
        documentId: document.id,
        audience: documentEventAudience(document.isInternal),
      })

      return { version, document, permitIds }
    })

    return { ok: true, ...result }
  } catch (e) {
    if (e instanceof ConfirmRejected) return { ok: false, ...e.outcome }
    throw e
  }
}

// ─── Разбор тела confirm: привязка требований (§6.4 п. 1) ───────────
// Гард IC-14: общий для трёх кабинетов (admin/broker/client) парсер
// тела confirm — одиночное поле (прежний контракт) и массив.
export type ConfirmPermitOpts = { permitRequirementId?: string; permitRequirementIds?: string[] }

export function parseConfirmPermitOpts(body: unknown): ConfirmPermitOpts {
  const opts: ConfirmPermitOpts = {}
  if (body && typeof body === 'object') {
    const b = body as { permitRequirementId?: unknown; permitRequirementIds?: unknown }
    if ('permitRequirementId' in b && b.permitRequirementId) {
      opts.permitRequirementId = String(b.permitRequirementId)
    }
    if (Array.isArray(b.permitRequirementIds)) {
      opts.permitRequirementIds = b.permitRequirementIds.map(String)
    }
  }
  return opts
}
