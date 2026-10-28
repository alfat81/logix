import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveFileMime } from '@/lib/file-signature'
import { db } from '@/lib/db'
import {
  type EmployeeActor,
  type ClientActor,
  type BrokerActor,
} from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { documentEventAudience } from '@/lib/audience'
import {
  DOC_ALLOWED_MIME,
  DOC_COMMENT_MAX_LENGTH,
  DOC_FILE_MAX_BYTES,
  DOC_TITLE_MAX_LENGTH,
  DOCUMENT_TYPES,
  formatDocSize,
} from '@/lib/document-constants'

// ─── Документооборот (Дорожка Е, роадмап 5): серверное ядро ────────
// Этот модуль тянет db и activity — из клиентских компонентов импорт
// запрещён (клиент-безопасные константы — document-constants.ts).
// Роуты трёх кабинетов (админ, клиент, брокер) отвечают за авторизацию
// и видимость сделки, а вся механика «создать документ с версией 1 /
// добавить версию без гонок / удалить» живёт здесь — один раз.

// ── Валидация метаданных из multipart-формы ──────────────────────────

export const DocumentMetaSchema = z.object({
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
})
export type DocumentMetaInput = z.infer<typeof DocumentMetaSchema>

export const DocumentVersionMetaSchema = z.object({
  comment: z
    .string()
    .trim()
    .max(DOC_COMMENT_MAX_LENGTH, `Комментарий — не длиннее ${DOC_COMMENT_MAX_LENGTH} символов`)
    .optional(),
})

// Чекбокс из FormData: значения — строки 'true'/'on' либо отсутствие.
// z.coerce.boolean() здесь ловушка ('false' → true), поэтому разбор
// ручной и один.
export function formBool(v: FormDataEntryValue | null): boolean {
  return v === 'true' || v === 'on'
}

// ── Разбор multipart-форм (общий для шести create- и трёх
// version-роутов) ────────────────────────────────────────────────────
// Одинаковые ответы на битые формы во всех кабинетах: 400 с внятной
// формулировкой, а не 500 на неожиданном типе.

export type ParsedDocumentForm =
  | { ok: true; meta: DocumentMetaInput; file: DocFilePayload }
  | { ok: false; response: NextResponse }

export async function parseDocumentCreateForm(
  req: NextRequest,
): Promise<ParsedDocumentForm> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Некорректные данные формы' }, { status: 400 }),
    }
  }

  const parsed = DocumentMetaSchema.safeParse({
    type: form.get('type'),
    title: form.get('title'),
    comment: form.get('comment') || undefined,
    isInternal: formBool(form.get('isInternal')),
  })
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      ),
    }
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Прикрепите файл' }, { status: 400 }),
    }
  }
  const fileErr = docFileError(file)
  if (fileErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: fileErr }, { status: 400 }),
    }
  }

  const payload = await readDocFile(file)
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json({ error: DOC_SIGNATURE_ERROR }, { status: 400 }),
    }
  }
  return { ok: true, meta: parsed.data, file: payload }
}

export type ParsedVersionForm =
  | { ok: true; comment: string | undefined; file: DocFilePayload }
  | { ok: false; response: NextResponse }

export async function parseDocumentVersionForm(
  req: NextRequest,
): Promise<ParsedVersionForm> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Некорректные данные формы' }, { status: 400 }),
    }
  }

  const parsed = DocumentVersionMetaSchema.safeParse({
    comment: form.get('comment') || undefined,
  })
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      ),
    }
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Прикрепите файл' }, { status: 400 }),
    }
  }
  const fileErr = docFileError(file)
  if (fileErr) {
    return {
      ok: false,
      response: NextResponse.json({ error: fileErr }, { status: 400 }),
    }
  }

  const payload = await readDocFile(file)
  if (!payload) {
    return {
      ok: false,
      response: NextResponse.json({ error: DOC_SIGNATURE_ERROR }, { status: 400 }),
    }
  }
  return { ok: true, comment: parsed.data.comment, file: payload }
}

// ── Валидация и чтение файла ─────────────────────────────────────────

export type DocFilePayload = {
  fileName: string
  mimeType: string
  fileSize: number
  // Uint8Array (не Buffer): тип аргумента у Prisma Bytes — узкий
  // Uint8Array<ArrayBuffer>, Buffer<ArrayBufferLike> ему не присваивается.
  fileData: Uint8Array<ArrayBuffer>
}

// Санитизация имени: без каталогов, без управляющих символов, без
// пустоты и без монструозной длины. Кириллицу сохраняем — браузеры
// корректно отдают её в Content-Disposition.
export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim()
  if (!cleaned) return 'file'
  return cleaned.length > 120 ? cleaned.slice(-120) : cleaned
}

export function docFileError(file: File): string | null {
  if (!file || file.size === 0) return 'Прикрепите непустой файл'
  if (file.size > DOC_FILE_MAX_BYTES) {
    return `Файл больше ${formatDocSize(DOC_FILE_MAX_BYTES)} — уменьшите файл или пришлите менеджеру напрямую`
  }
  const declared = file.type && file.type !== 'application/octet-stream' ? file.type : ''
  if (declared && !(DOC_ALLOWED_MIME as readonly string[]).includes(declared)) {
    return `Формат «${file.type || 'неизвестен'}» не поддерживается. Разрешены: PDF, PNG, JPEG, WebP, DOC/DOCX, XLS/XLSX, ZIP`
  }
  return null
}

export const DOC_SIGNATURE_ERROR =
  'Содержимое файла не совпадает с его форматом. Разрешены: PDF, PNG, JPEG, WebP, DOC/DOCX, XLS/XLSX, ZIP'

/** Читает файл и проверяет сигнатуру. null — содержимое не прошло проверку. */
export async function readDocFile(file: File): Promise<DocFilePayload | null> {
  const fileData = new Uint8Array(await file.arrayBuffer())
  const fileName = sanitizeFileName(file.name)
  const mimeType = resolveFileMime(file.type, fileName, fileData)
  if (!mimeType) return null
  return { fileName, mimeType, fileSize: file.size, fileData }
}

// ── Проекции для списков (без fileData!) ────────────────────────────
// fileData не должен покидать сервер в списочных ответах: байты живут
// в БД до единственного авторизующего роута скачивания.

export const DOC_VERSION_PUBLIC_FIELDS = {
  id: true,
  version: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  comment: true,
  authorType: true,
  // DF-02A (Блок 4): id пользователя — ключ проекции имени при чтении
  // (lib/actor-name.ts); непрозрачен (cuid), наружу не персональные
  // данные, но стабильная ссылка на автора версии.
  authorId: true,
  authorName: true,
  createdAt: true,
} as const

export const DOC_PUBLIC_FIELDS = {
  id: true,
  type: true,
  title: true,
  isInternal: true,
  currentVersion: true,
  createdAt: true,
  updatedAt: true,
  versions: {
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

// ── Создание документа на сделке (лид ИЛИ заявка) ────────────────────
// deal — ровно одна цель (инвариант enforced типом, как ActivityTarget).
// actor — сотрудник / клиент / брокер (подрядчика в контуре Е нет).
// DF-02A (Блок 4): у клиента/брокера authorId = id ПОЛЬЗОВАТЕЛЯ
// (CustomerUser/BrokerUser), authorName — снимок КОМПАНИИ; отображаемое
// имя собирается при чтении (lib/actor-name.ts) по роли читателя.
// allowInternal: false у внешних порталов — клиент и брокер внутренние
// документы создавать не могут, флаг принудительно гасится.

export type DocActor = EmployeeActor | ClientActor | BrokerActor

export type DocumentDealTarget = { leadId: string } | { orderId: string }

export async function createDocumentOnDeal(
  deal: DocumentDealTarget,
  actor: DocActor,
  meta: DocumentMetaInput,
  file: DocFilePayload,
): Promise<DocumentRow> {
  const isInternal = actor.type === 'employee' ? (meta.isInternal ?? false) : false

  // Документ + версия 1 одной записью (вложенный create), затем чтение
  // полной строки: select create-арга не принимает orderBy/take внутри
  // связи — а спискам нужен ровно вид DOC_PUBLIC_FIELDS.
  const created = await db.document.create({
    data: {
      ...deal,
      type: meta.type,
      title: meta.title,
      isInternal,
      currentVersion: 1,
      versions: {
        create: {
          version: 1,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          fileData: file.fileData,
          comment: meta.comment || null,
          authorType: actor.type,
          authorId: actor.id,
          authorName: actor.name,
        },
      },
    },
    select: { id: true },
  })
  const document = await db.document.findUnique({
    where: { id: created.id },
    select: DOC_PUBLIC_FIELDS,
  })
  if (!document) {
    throw new Error('документ создан, но не читается — рассинхрон схемы')
  }

  // Ж2: событие в ленту сделки (DF-01 — через emitEvent, единственная
  // точка записи). documentId связывает событие с документом (DF-12);
  // о внутреннем документе — только внутренняя запись: внешний кабинет
  // не должен даже узнать о факте его существования.
  await emitEvent(db, {
    target: deal,
    actor,
    type: 'document_created',
    description: `Документ «${document.title}» (версия 1)${meta.comment ? `: ${meta.comment}` : ''}`,
    documentId: document.id,
    audience: documentEventAudience(isInternal),
  })

  return document
}

// ── Добавление версии (без гонок, паттерн retry Б4) ─────────────────
// Две одновременные загрузки читают currentVersion=1 → обе строят v2 →
// уникальность [documentId, version] ловит вторую → повтор с v3.
// Возврат: созданная версия в публичной проекции + обновлённый документ.

const VERSION_RETRY_ATTEMPTS = 4

export async function addDocumentVersion(
  documentId: string,
  actor: DocActor,
  file: DocFilePayload,
  comment: string | undefined,
): Promise<{ version: DocumentVersionRow; document: DocumentRow } | null> {
  for (let attempt = 0; attempt < VERSION_RETRY_ATTEMPTS; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const doc = await tx.document.findUnique({
          where: { id: documentId },
          select: { id: true, currentVersion: true },
        })
        if (!doc) return null

        const next = doc.currentVersion + 1
        const version = await tx.documentVersion.create({
          data: {
            documentId,
            version: next,
            fileName: file.fileName,
            mimeType: file.mimeType,
            fileSize: file.fileSize,
            fileData: file.fileData,
            comment: comment || null,
            authorType: actor.type,
            authorId: actor.id,
            authorName: actor.name,
          },
          select: DOC_VERSION_PUBLIC_FIELDS,
        })
        await tx.document.update({
          where: { id: documentId },
          data: { currentVersion: next },
        })

        const document = await tx.document.findUnique({
          where: { id: documentId },
          select: DOC_PUBLIC_FIELDS,
        })
        if (!document) return null
        return { version, document }
      })
    } catch (e) {
      // Гонка номеров версий — просто повторяем; прочее — наверх.
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

// Событие о новой версии — отдельно от транзакции (лента — наблюдение,
// а не бизнес-данные): роут зовёт после успешного addDocumentVersion,
// когда знает, что документ доступен актёру (внешние — только не
// внутренним документам).
export async function logDocumentVersionAdded(
  deal: DocumentDealTarget,
  actor: DocActor,
  docTitle: string,
  version: number,
  comment: string | undefined,
  opts?: { isInternal?: boolean; documentId?: string | null },
): Promise<void> {
  await emitEvent(db, {
    target: deal,
    actor,
    type: 'document_version_added',
    description: `Версия ${version} документа «${docTitle}»${comment ? `: ${comment}` : ''}`,
    documentId: opts?.documentId ?? null,
    audience: documentEventAudience(opts?.isInternal ?? false),
  })
}

// ── Удаление документа (только менеджер) ────────────────────────────
// Вся история версий уходит каскадом; след остаётся в ленте сделки.
export async function deleteDocument(
  documentId: string,
  actor: DocActor,
): Promise<{ title: string } | null> {
  const doc = await db.document.findUnique({
    where: { id: documentId },
    select: { id: true, title: true, leadId: true, orderId: true, isInternal: true },
  })
  if (!doc) return null

  await db.document.delete({ where: { id: documentId } })

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
