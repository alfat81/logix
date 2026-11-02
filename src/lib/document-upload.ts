import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { mimeForFileName } from '@/lib/file-signature'
import { getSetting } from '@/lib/settings'
import { buildDocStorageKey, getStorage, type UploadTicket } from '@/lib/storage'
import {
  DOC_ALLOWED_MIME,
  DOC_COMMENT_MAX_LENGTH,
  DOC_MIME_ALIASES,
  DOC_TITLE_MAX_LENGTH,
  DOCUMENT_TYPES,
  formatDocSize,
  sanitizeFileName,
} from '@/lib/document-constants'
import {
  DOC_PUBLIC_FIELDS,
  DOC_VERSION_PUBLIC_FIELDS,
  type DocActor,
  type DocumentDealTarget,
  type DocumentRow,
  type DocumentVersionRow,
} from '@/lib/documents'

// ─── DF-11: двухфазная загрузка документов (create → PUT → confirm) ──
// Байты больше не идут через серверную функцию: сервер создаёт запись
// pending и отдаёт presigned PUT (aws4fetch), браузер грузит файл
// напрямую в хранилище, confirm проверяет размер и сигнатуру первых
// байтов и переводит версию в ready (document-confirm.ts). Лимит —
// настройка files.max_mb (D32), по умолчанию 25 МБ.

export const DOC_SIGNATURE_ERROR =
  'Содержимое файла не совпадает с его форматом. Разрешены: PDF, PNG, JPEG, WebP, DOC/DOCX, XLS/XLSX, ZIP'

const DOC_MIME_UNSUPPORTED =
  'Формат «%s» не поддерживается. Разрешены: PDF, PNG, JPEG, WebP, DOC/DOCX, XLS/XLSX, ZIP'

// ── Валидация метаданных двухфазной загрузки ────────────────────────

const fileMetaShape = {
  fileName: z.string().min(1, 'Прикрепите файл').max(255),
  mimeType: z.string().max(100).optional().default(''),
  size: z
    .number({ invalid_type_error: 'Размер файла передан некорректно' })
    .int()
    .positive('Прикрепите непустой файл'),
}

export const DocumentCreateUploadSchema = z.object({
  type: z.enum(DOCUMENT_TYPES, {
    errorMap: () => ({ message: 'Неизвестный тип документа' }),
  }),
  title: z
    .string()
    .trim()
    .min(1, 'Укажите название документа')
    .max(DOC_TITLE_MAX_LENGTH, `Название — не длиннее ${DOC_TITLE_MAX_LENGTH} символов`),
  isInternal: z.boolean().optional(),
  comment: z.string().trim().max(DOC_COMMENT_MAX_LENGTH).optional(),
  ...fileMetaShape,
})
export type DocumentCreateUploadInput = z.infer<typeof DocumentCreateUploadSchema>

export const DocumentVersionUploadSchema = z.object({
  comment: z
    .string()
    .trim()
    .max(DOC_COMMENT_MAX_LENGTH, `Комментарий — не длиннее ${DOC_COMMENT_MAX_LENGTH} символов`)
    .optional(),
  ...fileMetaShape,
})
export type DocumentVersionUploadInput = z.infer<typeof DocumentVersionUploadSchema>

// Загрузка документа в строку разрешительных (DF-16 × DF-11): тип всегда
// 'permit', название по умолчанию — название строки (роут подставляет).
export const PermitDocumentUploadSchema = z.object({
  title: z.string().trim().max(DOC_TITLE_MAX_LENGTH).optional(),
  comment: z.string().trim().max(DOC_COMMENT_MAX_LENGTH).optional(),
  ...fileMetaShape,
})

/** Читает JSON-тело; null — битое тело (роут отвечает 400). */
export async function readJsonBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

/** JSON-тело + zod-схема одним шагом: битое тело/схема — готовый 400 (IC-14: одна точка). */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  const body = await readJsonBody(req)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      ),
    }
  }
  return { ok: true, data: parsed.data }
}

// ── Лимит из настроек (D32) и служебные проверки ─────────────────────

export async function maxUploadBytes(): Promise<number> {
  const mb = await getSetting('files.max_mb')
  return mb * 1024 * 1024
}

export function uploadSizeError(size: number, maxBytes: number): string {
  return `Файл больше ${formatDocSize(maxBytes)} — уменьшите файл или пришлите менеджеру напрямую`
}

/** Итоговый заявленный MIME: пустой/octet-stream уточняется расширением,
 *  браузерные псевдонимы (x-zip-compressed, image/jpg) сводятся к канону;
 *  null — вне белого списка. */
export function normalizeUploadMime(mimeType: string | undefined, fileName: string): string | null {
  const canonical = (mimeType && DOC_MIME_ALIASES.get(mimeType)) || mimeType || ''
  const resolved = !canonical || canonical === 'application/octet-stream' ? mimeForFileName(fileName) : canonical
  if (!(DOC_ALLOWED_MIME as readonly string[]).includes(resolved)) {
    return null
  }
  return resolved
}

function mimeUnsupportedResponse(mimeType: string): NextResponse {
  return NextResponse.json(
    { error: DOC_MIME_UNSUPPORTED.replace('%s', mimeType || 'неизвестен') },
    { status: 400 }
  )
}

// ── Уборка заброшенных загрузок (pending старше суток) ───────────────
// Пользователь закрыл диалог после create — pending-строка остаётся
// невидимой (списки показывают только ready) и вычищается при следующей
// загрузке в этой сделке: объект в хранилище удаляется, строка — тоже.
const PENDING_TTL_MS = 24 * 60 * 60 * 1000

async function deleteObjectsBestEffort(keys: Array<string | null | undefined>): Promise<void> {
  const storage = getStorage()
  for (const key of keys) {
    if (!key) continue
    try {
      await storage.deleteObject(key)
    } catch (e) {
      // Осиротевший объект в приватном бакете не утечка; не блокируем уборку.
      console.error('storage delete failed during prune', e)
    }
  }
}

export async function pruneAbandonedUploads(deal: DocumentDealTarget): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MS)
  const stale = await db.documentVersion.findMany({
    where: {
      status: 'pending',
      createdAt: { lt: cutoff },
      document: 'orderId' in deal ? { orderId: deal.orderId } : { leadId: deal.leadId },
    },
    select: { id: true, storageKey: true, status: true },
    take: 50,
  })
  for (const row of stale) {
    // Повторная проверка статуса: confirm мог успеть отработать между
    // выборкой и уборкой — у готовой версии объект удалять нельзя.
    const fresh = await db.documentVersion.findUnique({ where: { id: row.id }, select: { status: true } })
    if (!fresh || fresh.status !== 'pending') continue
    await deleteObjectsBestEffort([row.storageKey])
    await db.documentVersion.delete({ where: { id: row.id } })
  }
  // Документы, у которых не осталось ни одной версии, — тоже в утиль.
  await db.document.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      ...( 'orderId' in deal ? { orderId: deal.orderId } : { leadId: deal.leadId }),
      versions: { none: {} },
    },
  })
}

// ── Шаг 1: создание документа/версии в статусе pending ───────────────

export type PendingUploadView = {
  version: DocumentVersionRow
  document: DocumentRow
  upload: UploadTicket
}

export async function createPendingDocument(
  deal: DocumentDealTarget,
  actor: DocActor,
  input: DocumentCreateUploadInput,
): Promise<PendingUploadView> {
  await pruneAbandonedUploads(deal)

  const maxBytes = await maxUploadBytes()
  if (input.size > maxBytes) {
    throw new UploadValidationError(uploadSizeError(input.size, maxBytes))
  }
  const mimeType = normalizeUploadMime(input.mimeType, input.fileName)
  if (!mimeType) {
    throw new UploadValidationError(DOC_MIME_UNSUPPORTED.replace('%s', input.mimeType || 'неизвестен'))
  }
  const fileName = sanitizeFileName(input.fileName)
  const isInternal = actor.type === 'employee' ? (input.isInternal ?? false) : false

  // Ключ строится до создания записи: id документа ещё не существует,
  // уникальность даёт uuid внутри префикса сделки.
  const dealId = 'orderId' in deal ? deal.orderId : deal.leadId
  const storageKey = buildDocStorageKey(dealId, fileName)

  // create нельзя читать через DOC_PUBLIC_FIELDS: их where status=ready
  // скрывает только что созданную pending-версию — версия читается
  // отдельно по уникальному ключу [documentId, version].
  const created = await db.document.create({
    data: {
      ...deal,
      type: input.type,
      title: input.title,
      isInternal,
      currentVersion: 1,
      versions: {
        create: {
          version: 1,
          fileName,
          mimeType,
          fileSize: input.size,
          storageKey,
          status: 'pending',
          comment: input.comment || null,
          authorType: actor.type,
          authorId: actor.id,
          authorName: actor.name,
        },
      },
    },
    select: { id: true },
  })
  const [version, document] = await Promise.all([
    db.documentVersion.findUnique({
      where: { documentId_version: { documentId: created.id, version: 1 } },
      select: DOC_VERSION_PUBLIC_FIELDS,
    }),
    db.document.findUnique({ where: { id: created.id }, select: DOC_PUBLIC_FIELDS }),
  ])
  if (!version || !document) throw new Error('версия создана, но не читается — рассинхрон схемы')
  const upload = await getStorage().presignPut(storageKey, { contentType: mimeType })
  return { version, document, upload }
}

export async function createPendingVersion(
  documentId: string,
  actor: DocActor,
  input: DocumentVersionUploadInput,
): Promise<PendingUploadView | null> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { id: true, leadId: true, orderId: true },
  })
  if (!doc) return null

  const maxBytes = await maxUploadBytes()
  if (input.size > maxBytes) {
    throw new UploadValidationError(uploadSizeError(input.size, maxBytes))
  }
  const mimeType = normalizeUploadMime(input.mimeType, input.fileName)
  if (!mimeType) {
    throw new UploadValidationError(DOC_MIME_UNSUPPORTED.replace('%s', input.mimeType || 'неизвестен'))
  }
  const fileName = sanitizeFileName(input.fileName)
  const dealId = doc.orderId ?? doc.leadId
  if (!dealId) return null
  const storageKey = buildDocStorageKey(dealId, fileName)

  // Гонка номеров версий — тот же паттерн retry Б4, что и раньше:
  // уникальность [documentId, version] ловит вторую, повторяем.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const fresh = await tx.document.findUnique({
          where: { id: documentId },
          select: { currentVersion: true },
        })
        if (!fresh) return null
        const next = fresh.currentVersion + 1
        const version = await tx.documentVersion.create({
          data: {
            documentId,
            version: next,
            fileName,
            mimeType,
            fileSize: input.size,
            storageKey,
            status: 'pending',
            comment: input.comment || null,
            authorType: actor.type,
            authorId: actor.id,
            authorName: actor.name,
          },
          select: DOC_VERSION_PUBLIC_FIELDS,
        })
        const document = await tx.document.findUnique({ where: { id: documentId }, select: DOC_PUBLIC_FIELDS })
        if (!document) return null
        const upload = await getStorage().presignPut(storageKey, { contentType: mimeType })
        return { version, document, upload }
      })
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        (e.meta?.target as string[] | undefined)?.includes('version')
      ) {
        continue
      }
      throw e
    }
  }
  return null
}

// Валидация ввода вне zod (динамический лимит настроек): Error со
// statusCode 4xx apiErrorResponse превращает в честный ответ 400.
export class UploadValidationError extends Error {
  readonly statusCode = 400
}
