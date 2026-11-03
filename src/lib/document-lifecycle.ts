import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import { documentEventAudience } from '@/lib/audience'
import { z } from 'zod'
import {
  DOC_COMMENT_MAX_LENGTH,
  type DocumentStatus,
} from '@/lib/document-constants'
import { checkDocumentTransition } from '@/lib/status-machine'
import { DOC_PUBLIC_FIELDS, type DocActor, type DocumentRow } from '@/lib/documents'

// ─── DF-12: жизненный цикл документа (финализация / возврат) ────────
// Третий серверный модуль документооборота (рядом с document-upload и
// document-confirm): финализировать может только сотрудник — роуты
// admin + requireEmployee; финальная версия — та, что была текущей в
// момент нажатия. Новая версия после финала гардится в
// document-upload.ts (409), единственный путь — «Вернуть в работу» с
// обязательной причиной. События — в той же транзакции (DoD 9).

export const DocumentReopenSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Укажите причину возврата')
    .max(DOC_COMMENT_MAX_LENGTH, `Причина — не длиннее ${DOC_COMMENT_MAX_LENGTH} символов`),
})
export type DocumentReopenInput = z.infer<typeof DocumentReopenSchema>

/** Смысловая ошибка перехода со статусом HTTP (см. apiErrorResponse). */
export class LifecycleError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

async function loadForLifecycle(documentId: string) {
  return db.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      status: true,
      currentVersion: true,
      isInternal: true,
      leadId: true,
      orderId: true,
      // Финализировать нечего, пока документ без единой готовой версии
      // (заброшенная pending-загрузка не становится «финалом»).
      versions: { where: { status: 'ready' }, select: { id: true }, take: 1 },
    },
  })
}

type LifecycleDeal = { orderId: string } | { leadId: string }

function dealOf(doc: { leadId: string | null; orderId: string | null }): LifecycleDeal {
  return doc.orderId ? { orderId: doc.orderId } : { leadId: doc.leadId! }
}

export async function finalizeDocument(
  documentId: string,
  actor: Extract<DocActor, { type: 'employee' }>,
): Promise<DocumentRow | null> {
  const doc = await loadForLifecycle(documentId)
  if (!doc) return null

  // Повтор финализации — 400 «Статус уже: Финальный», запрещённый
  // переход — 409 (контракт checkTransition, как у лида/заявки).
  const transition = checkDocumentTransition(doc.status as DocumentStatus, 'final')
  if (!transition.ok) {
    throw new LifecycleError(transition.error, transition.status)
  }
  if (doc.versions.length === 0) {
    throw new LifecycleError('Нечего финализировать — дождитесь загрузки файла', 409)
  }

  const deal = dealOf(doc)
  return db.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: doc.id },
      data: {
        status: 'final',
        finalizedAt: new Date(),
        finalizedByName: actor.name,
        finalVersion: doc.currentVersion,
      },
    })
    const document = await tx.document.findUnique({
      where: { id: doc.id },
      select: DOC_PUBLIC_FIELDS,
    })
    if (!document) throw new LifecycleError('Не удалось финализировать документ', 500)

    await emitEvent(tx, {
      target: deal,
      actor,
      type: 'document_finalized',
      description: `Документ «${doc.title}» финализирован (версия ${doc.currentVersion})`,
      documentId: doc.id,
      audience: documentEventAudience(doc.isInternal),
    })
    return document
  })
}

export async function reopenDocument(
  documentId: string,
  actor: Extract<DocActor, { type: 'employee' }>,
  input: DocumentReopenInput,
): Promise<DocumentRow | null> {
  const doc = await loadForLifecycle(documentId)
  if (!doc) return null

  const transition = checkDocumentTransition(doc.status as DocumentStatus, 'in_review')
  if (!transition.ok) {
    throw new LifecycleError(transition.error, transition.status)
  }

  const deal = dealOf(doc)
  return db.$transaction(async (tx) => {
    // Снимок финализации (finalizedAt/By/Version) не гасим: он остаётся
    // как «последний финал» до следующего нажатия «Финальный».
    await tx.document.update({
      where: { id: doc.id },
      data: { status: 'in_review' },
    })
    const document = await tx.document.findUnique({
      where: { id: doc.id },
      select: DOC_PUBLIC_FIELDS,
    })
    if (!document) throw new LifecycleError('Не удалось вернуть документ в работу', 500)

    await emitEvent(tx, {
      target: deal,
      actor,
      type: 'document_reopened',
      description: `Документ «${doc.title}» возвращён в работу: ${input.reason}`,
      documentId: doc.id,
      audience: documentEventAudience(doc.isInternal),
    })
    return document
  })
}
