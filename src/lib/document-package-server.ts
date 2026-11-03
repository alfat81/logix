import { zipSync } from 'fflate'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getStorage } from '@/lib/storage'
import {
  PACKAGE_ZIP_MAX_TOTAL_BYTES,
  buildPackageSlots,
  packageEntryName,
  packageFolderName,
  packageKindsForAudience,
  packageZipFileName,
  type PackageSlot,
} from '@/lib/document-package'
import type { DocumentKind } from '@/lib/document-constants'
import {
  DOC_LIST_READY_WHERE,
  DOC_PUBLIC_FIELDS,
  type DocumentRow,
} from '@/lib/documents'
import { projectDocumentAuthors, type ActorNameReader } from '@/lib/actor-name'

// ─── DF-13: пакет документов заявки — серверное ядро ────────────────
// Чтение документов пакета, сборка финальных версий в ZIP (fflate —
// зависимость, разрешённая роадмапом для DF-13) и ответ-фолбэк списком
// ссылок, когда суммарный размер финальных версий выше порога ответа
// serverless-функции Vercel (4,5 МБ, порог 4 МиБ — document-package.ts).
// Роуты трёх кабинетов делают только auth-guard и зовут один из двух
// общих ответов: резолв владения заявкой и видимость внутри — здесь
// (аудитория пакета — тот же ActorNameReader, что и проекция имён).

// ── Слоты пакета ────────────────────────────────────────────────────

/**
 * Заявка пакета с проверкой владения по кабинету: сотрудник — любой,
 * клиент — своя (customerId), брокер — связь OrderBroker; null → 404
 * (факт существования чужой заявки не раскрываем, паттерн И1).
 */
async function resolvePackageOrder(
  orderId: string,
  reader: ActorNameReader,
): Promise<{ id: string; number: string } | null> {
  if (reader.kind === 'staff') {
    return db.order.findUnique({ where: { id: orderId }, select: { id: true, number: true } })
  }
  if (reader.kind === 'client') {
    return db.order.findFirst({
      where: { id: orderId, customerId: reader.customerId },
      select: { id: true, number: true },
    })
  }
  const link = await db.orderBroker.findUnique({
    where: { orderId_brokerId: { orderId, brokerId: reader.brokerId } },
    select: { order: { select: { id: true, number: true } } },
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
  const documents = await projectDocumentAuthors(
    await loadPackageDocuments(orderId, includeInternal),
    reader,
  )
  const slots = buildPackageSlots(documents, packageKindsForAudience(includeInternal))
  return NextResponse.json({ orderNumber: order.number, maxMb, slots })
}

// ── Финальные версии → ZIP ──────────────────────────────────────────

type FinalFile = {
  versionId: string
  version: number
  fileName: string
  fileSize: number
  storageKey: string | null
  // Prisma 6 отдаёт Bytes как Uint8Array (легаси-версии до 4 МБ).
  fileData: Uint8Array<ArrayBuffer> | null
  entryName: string
}

/** Ссылка скачивания отдельной версии — существующий авторизующий роут (DF-11). */
function versionUrl(versionId: string): string {
  return `/api/document-versions/${versionId}/file`
}

async function collectFinalFiles(
  orderId: string,
  includeInternal: boolean,
): Promise<FinalFile[]> {
  // fileData в select сознательно: это финальный ZIP-путь, легаси-версии
  // (< 4 МБ) читаются из БД; списочные проекции fileData по-прежнему не
  // отдают (DOC_VERSION_PUBLIC_FIELDS без байтов).
  const docs = await db.document.findMany({
    where: {
      orderId,
      status: 'final',
      ...(includeInternal ? {} : { isInternal: false }),
    },
    // Порядок как в списках — детерминированные имена/порядок в ZIP.
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: {
      kind: true,
      title: true,
      finalVersion: true,
      currentVersion: true,
      versions: {
        where: { status: 'ready' },
        select: {
          id: true,
          version: true,
          fileName: true,
          fileSize: true,
          storageKey: true,
          fileData: true,
        },
      },
    },
  })
  const files: FinalFile[] = []
  for (const doc of docs) {
    const want = doc.finalVersion ?? doc.currentVersion
    const v = doc.versions.find((x) => x.version === want)
    if (!v) continue
    files.push({
      versionId: v.id,
      version: v.version,
      fileName: v.fileName,
      fileSize: v.fileSize,
      storageKey: v.storageKey,
      fileData: v.fileData,
      entryName: packageEntryName(doc.kind as DocumentKind, doc.title, v.version, v.fileName),
    })
  }
  return files
}

async function readVersionBytes(file: FinalFile): Promise<Uint8Array<ArrayBuffer>> {
  if (file.fileData) return file.fileData
  if (!file.storageKey) throw new Error(`версия ${file.versionId} без байтов (ни БД, ни хранилище)`)
  // Размер из метаданных БД: confirm пишет фактический размер объекта.
  return getStorage().readRange(file.storageKey, 0, file.fileSize - 1)
}

/** ZIP пакета (папка = номер заявки): null — пусто или выше порога. */
export async function buildOrderPackageZip(
  orderId: string,
  orderNumber: string,
  includeInternal: boolean,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const files = await collectFinalFiles(orderId, includeInternal)
  const totalBytes = files.reduce((sum, f) => sum + f.fileSize, 0)
  if (files.length === 0 || totalBytes > PACKAGE_ZIP_MAX_TOTAL_BYTES) return null

  // Структура из карточки: <номер заявки>/<вид>-<название>-v<версия>.<расширение>.
  // level 0 (store): pdf/офис/картинки уже сжаты — CPU на пересжатие
  // не тратим, размер архива ≈ сумме исходников.
  const folder = packageFolderName(orderNumber)
  const entries: Record<string, [Uint8Array<ArrayBuffer>, { level: 0 }]> = {}
  for (const file of files) {
    entries[`${folder}/${file.entryName}`] = [await readVersionBytes(file), { level: 0 }]
  }
  return zipSync(entries, { level: 0 })
}

/** Фолбэк вместо ZIP: подписанные роутом ссылки на отдельные версии. */
export async function packageFallbackPayload(
  orderId: string,
  includeInternal: boolean,
): Promise<{
  zip: false
  reason: 'size'
  maxBytes: number
  totalBytes: number
  files: Array<{ name: string; url: string; size: number }>
} | null> {
  const files = await collectFinalFiles(orderId, includeInternal)
  if (files.length === 0) return null
  const totalBytes = files.reduce((sum, f) => sum + f.fileSize, 0)
  return {
    zip: false,
    reason: 'size',
    maxBytes: PACKAGE_ZIP_MAX_TOTAL_BYTES,
    totalBytes,
    files: files.map((f) => ({ name: f.entryName, url: versionUrl(f.versionId), size: f.fileSize })),
  }
}

// ── Ответ ZIP-роута (общий для трёх кабинетов) ──────────────────────
// Пустой финальный пакет — 400 с внятным текстом (проверка e2e);
// порог превышен — 200 JSON со списком ссылок (content-type json);
// иначе — binary ZIP (store: исходники уже сжатые pdf/офис/картинки).

export async function packageZipResponse(
  orderId: string,
  reader: ActorNameReader,
): Promise<NextResponse> {
  const order = await resolvePackageOrder(orderId, reader)
  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }
  const includeInternal = reader.kind === 'staff'
  const fallback = await packageFallbackPayload(orderId, includeInternal)
  if (!fallback) {
    return NextResponse.json(
      { error: 'В пакете нет финальных документов — объявите документ финальным и повторите' },
      { status: 400 },
    )
  }
  if (fallback.totalBytes > PACKAGE_ZIP_MAX_TOTAL_BYTES) {
    return NextResponse.json(fallback)
  }
  const zip = await buildOrderPackageZip(orderId, order.number, includeInternal)
  if (!zip) {
    // Гонка (документ разфинализировали между проверкой и сборкой) — честный 400.
    return NextResponse.json(
      { error: 'В пакете нет финальных документов — объявите документ финальным и повторите' },
      { status: 400 },
    )
  }
  const asciiName = packageZipFileName(order.number).replace(/[^\x20-\x7e]/g, '_')
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asciiName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
