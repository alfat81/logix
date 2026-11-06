import { zipSync } from 'fflate'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { emitEvent } from '@/lib/events'
import { getStorage } from '@/lib/storage'
import {
  PACKAGE_ZIP_MAX_TOTAL_BYTES,
  packageEntryName,
  packageFolderName,
  packageZipFileName,
} from '@/lib/document-package'
import { planScopeZip, type ZipScopeItem } from '@/lib/document-zip-plan'
import { documentEventAudience } from '@/lib/audience'
import { resolveDocumentKind, type DocumentKind } from '@/lib/document-constants'
import type { DocActor } from '@/lib/documents'
import { resolvePackageOrder } from '@/lib/document-package-server'
import type { ActorNameReader } from '@/lib/actor-name'

// ─── DF-13/DF-26: сборка ZIP пакета документов заявки ───────────────
// Два сценария: финальные версии (GET, DF-13 — поведение не меняется,
// плоская структура по видам) и «все доступные / выбранные» (POST,
// DF-26 §8 — последняя готовая версия каждого видимого документа,
// папки по фазам, счётчики предупреждения из одного списка с составом
// архива). Порог 4 МиБ и JSON-фолбэк — общий (§8.2.5); фолбэк не
// содержит внутренних документов (фильтр аудитории в выборке).
// Событие document_package_downloaded — только у POST-сценария (§6.2).

type ZipFile = {
  id: string
  version: number
  fileName: string
  fileSize: number
  storageKey: string | null
  // Prisma 6 отдаёт Bytes как Uint8Array (легаси-версии до 4 МБ).
  fileData: Uint8Array<ArrayBuffer> | null
}

/** Ссылка скачивания отдельной версии — существующий авторизующий роут (DF-11). */
function versionUrl(versionId: string): string {
  return `/api/document-versions/${versionId}/file`
}

async function readVersionBytes(file: ZipFile): Promise<Uint8Array<ArrayBuffer>> {
  if (file.fileData) return file.fileData
  if (!file.storageKey) throw new Error(`версия ${file.id} без байтов (ни БД, ни хранилище)`)
  // Размер из метаданных БД: confirm пишет фактический размер объекта.
  return getStorage().readRange(file.storageKey, 0, file.fileSize - 1)
}

/**
 * Сборка записей архива из плана. Гонка К-1 (§13.1): документ удалён
 * во время сборки — объект в хранилище уже нечитаем; такой entry
 * пропускается (ZIP либо без документа, либо 400 — но без 500).
 */
async function collectZipEntries(
  planned: ReadonlyArray<{ path: string; file: ZipFile }>,
): Promise<Record<string, [Uint8Array<ArrayBuffer>, { level: 0 }]>> {
  const entries: Record<string, [Uint8Array<ArrayBuffer>, { level: 0 }]> = {}
  for (const { path, file } of planned) {
    try {
      entries[path] = [await readVersionBytes(file), { level: 0 }]
    } catch (e) {
      // Осиротевший entry (удаление при сборке) не срывает архив целиком.
      console.error('zip entry skipped (deleted mid-build?)', path, e)
    }
  }
  return entries
}

function zipBinaryResponse(fileName: string, zip: Uint8Array<ArrayBuffer>): NextResponse {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_')
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asciiName}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ── Финальные версии → ZIP (GET, DF-13 — обратная совместимость) ────

const EMPTY_FINAL_ERROR =
  'В пакете нет финальных документов — объявите документ финальным и повторите'

export async function packageZipResponse(
  orderId: string,
  reader: ActorNameReader,
): Promise<NextResponse> {
  const order = await resolvePackageOrder(orderId, reader)
  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }
  const includeInternal = reader.kind === 'staff'
  // fileData в select сознательно: это ZIP-путь, легаси-версии (< 4 МБ)
  // читаются из БД; списочные проекции fileData по-прежнему не отдают.
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
      type: true,
      isInternal: true,
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
  const files: Array<{ entryName: string; file: ZipFile }> = []
  for (const doc of docs) {
    const want = doc.finalVersion ?? doc.currentVersion
    const v = doc.versions.find((x) => x.version === want)
    if (!v) continue
    files.push({
      entryName: packageEntryName(
        resolveDocumentKind({
          kind: doc.kind,
          type: doc.type,
          isInternal: doc.isInternal,
        }) as DocumentKind,
        doc.title,
        v.version,
        v.fileName,
      ),
      file: v,
    })
  }
  if (files.length === 0) {
    return NextResponse.json({ error: EMPTY_FINAL_ERROR }, { status: 400 })
  }
  const totalBytes = files.reduce((sum, f) => sum + f.file.fileSize, 0)
  if (totalBytes > PACKAGE_ZIP_MAX_TOTAL_BYTES) {
    // Фолбэк вместо ZIP: подписанные роутом ссылки на отдельные версии.
    return NextResponse.json({
      zip: false,
      reason: 'size',
      maxBytes: PACKAGE_ZIP_MAX_TOTAL_BYTES,
      totalBytes,
      files: files.map((f) => ({ name: f.entryName, url: versionUrl(f.file.id), size: f.file.fileSize })),
    })
  }
  // Структура из карточки DF-13: <номер заявки>/<вид>-<название>-v<версия>.<расширение>.
  // level 0 (store): pdf/офис/картинки уже сжаты — CPU на пересжатие
  // не тратим, размер архива ≈ сумме исходников.
  const folder = packageFolderName(order.number)
  const entries = await collectZipEntries(
    files.map((f) => ({ path: `${folder}/${f.entryName}`, file: f.file })),
  )
  if (Object.keys(entries).length === 0) {
    // Всё удалено во время сборки — не 500, а честный пустой пакет.
    return NextResponse.json({ error: EMPTY_FINAL_ERROR }, { status: 400 })
  }
  const zip = zipSync(entries, { level: 0 })
  return zipBinaryResponse(packageZipFileName(order.number), zip)
}

// ── Все доступные / выбранные → ZIP (POST, DF-26 §8) ────────────────

export const ScopeZipSchema = z
  .object({
    scope: z.enum(['all', 'selected'], {
      errorMap: () => ({ message: 'scope: all | selected' }),
    }),
    documentIds: z.array(z.string().min(1).max(60)).max(200).optional(),
  })
  .refine((v) => v.scope === 'all' || (v.documentIds?.length ?? 0) > 0, {
    message: 'Выберите хотя бы один документ',
    path: ['documentIds'],
  })
export type ScopeZipInput = z.infer<typeof ScopeZipSchema>

export async function packageScopeZipResponse(
  orderId: string,
  reader: ActorNameReader,
  actor: DocActor,
  input: ScopeZipInput,
): Promise<NextResponse> {
  const order = await resolvePackageOrder(orderId, reader)
  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }
  const includeInternal = reader.kind === 'staff'
  const docs = await db.document.findMany({
    where: {
      orderId,
      ...(includeInternal ? {} : { isInternal: false }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      kind: true,
      type: true,
      isInternal: true,
      title: true,
      status: true,
      versions: {
        where: { status: 'ready' },
        // Последняя готовая версия каждого документа (§8.1.3): у
        // возвращённого в работу документа в архив уходит актуальная
        // версия, а не старый финал.
        orderBy: { version: 'desc' as const },
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
  const byId = new Map(docs.map((d) => [d.id, d]))
  // §8.1.5: чужие id из «выбранных» молча исключаются (сервер проверяет
  // видимость каждого id повторно).
  const chosen =
    input.scope === 'all'
      ? docs
      : (input.documentIds ?? [])
          .map((id) => byId.get(id))
          .filter((d) => d !== undefined)
  const items: ZipScopeItem[] = []
  const bytesOf = new Map<string, ZipFile>()
  for (const doc of chosen) {
    const v = doc.versions[0]
    if (!v) continue
    items.push({
      documentId: doc.id,
      kind: doc.kind,
      type: doc.type,
      isInternal: doc.isInternal,
      title: doc.title,
      status: doc.status,
      versionId: v.id,
      version: v.version,
      fileName: v.fileName,
      fileSize: v.fileSize,
    })
    bytesOf.set(v.id, v)
  }
  if (items.length === 0) {
    return NextResponse.json({ error: 'Нет доступных документов' }, { status: 400 })
  }

  // Счётчики предупреждения и состав архива — ОДИН список (§8.1.3).
  const plan = planScopeZip(order.number, items)
  if (plan.totalBytes > PACKAGE_ZIP_MAX_TOTAL_BYTES) {
    return NextResponse.json({
      zip: false,
      reason: 'size',
      maxBytes: PACKAGE_ZIP_MAX_TOTAL_BYTES,
      totalBytes: plan.totalBytes,
      nonFinalDrafts: plan.nonFinalDrafts,
      nonFinalReview: plan.nonFinalReview,
      files: plan.entries.map((e) => ({
        name: e.name,
        url: versionUrl(e.item.versionId),
        size: e.item.fileSize,
      })),
    })
  }
  const entries = await collectZipEntries(
    plan.entries.flatMap((e) => {
      const file = bytesOf.get(e.item.versionId)
      return file ? [{ path: e.path, file }] : []
    }),
  )
  if (Object.keys(entries).length === 0) {
    // Всё удалено во время сборки (гонка К-1) — без 500.
    return NextResponse.json({ error: 'Нет доступных документов' }, { status: 400 })
  }
  const zip = zipSync(entries, { level: 0 })

  // §6.2: событие успешной отдачи архива — scope + ЧИСЛО ФАЙЛОВ В
  // АРХИВЕ (план мог проредиться от гонки удаления, К-1); без писем (O5).
  // Аудитория по составу архива (внутренние — staff-only).
  // Запись «лента наблюдение»: сбой не срывает скачивание (emitEvent
  // глотает и логирует ошибку Activity).
  await emitEvent(db, {
    target: { orderId: order.id },
    actor,
    type: 'document_package_downloaded',
    description: `Сформирован и отдан архив (ZIP): ${Object.keys(entries).length} файл(ов), режим «${input.scope === 'all' ? 'все доступные' : 'выбранные'}»`,
    audience: documentEventAudience(includeInternal),
  })
  return zipBinaryResponse(packageZipFileName(order.number, input.scope), zip)
}
