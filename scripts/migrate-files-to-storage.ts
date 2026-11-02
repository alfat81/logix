/**
 * DF-11: фоновый перенос легаси-файлов из БД (DocumentVersion.fileData)
 * в S3-совместимое хранилище. Безопасный повтор: строки с заполненным
 * storageKey пропускаются, байты в fileData НЕ обнуляются (dual-хранение
 * до отдельного contract-релиза — docs/DEPRECATIONS.md).
 *
 * usage:
 *   bun scripts/migrate-files-to-storage.ts --dry   # только отчёт
 *   bun scripts/migrate-files-to-storage.ts         # перенос
 *
 * Хранилище — то же, что в приложении: S3_* из окружения, без них —
 * локальный драйвер (.storage) для проверки на стенде. На проде запускать
 * строго под владельцем по инструкции релиза (bash-обёртка не нужна:
 * DATABASE_URL прода задаётся окружением).
 */
import { PrismaClient } from '@prisma/client'
import { loadEnvFallback } from './env-fallback'
import { getStorage } from '../src/lib/storage'

loadEnvFallback()

const dry = process.argv.includes('--dry')
const BATCH = 50

const prisma = new PrismaClient()
try {
  const total = await prisma.documentVersion.count({
    where: { fileData: { not: null }, storageKey: null },
  })
  const storage = getStorage()
  console.log(
    JSON.stringify({
      mode: dry ? 'dry' : 'migrate',
      storage: storage.kind,
      pending: total,
    })
  )
  if (total === 0) {
    console.log('Нечего переносить — все версии уже в хранилище или без файла.')
  }

  let moved = 0
  let bytes = 0
  let failed = 0
  for (let cursor: string | undefined; ;) {
    const batch = await prisma.documentVersion.findMany({
      where: { fileData: { not: null }, storageKey: null },
      select: { id: true, fileName: true, mimeType: true, fileData: true, documentId: true, document: { select: { leadId: true, orderId: true } } },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' as const },
    })
    if (batch.length === 0) break
    for (const row of batch) {
      cursor = row.id
      if (!row.fileData) continue
      const dealId = row.document.orderId ?? row.document.leadId ?? 'orphan'
      // Тот же формат ключа, что у новых загрузок (buildDocStorageKey):
      // docs/<id сделки>/<uuid>/<имя> — без ПДн, уникален по построению.
      const key = `docs/${dealId}/${crypto.randomUUID()}/${row.fileName}`
      const size = row.fileData.byteLength
      if (dry) {
        console.log(JSON.stringify({ dry: true, versionId: row.id, key, bytes: size }))
        moved += 1
        bytes += size
        continue
      }
      try {
        await storage.putObject(key, row.fileData, row.mimeType)
        await prisma.documentVersion.update({
          where: { id: row.id },
          data: { storageKey: key },
        })
        moved += 1
        bytes += size
        console.log(JSON.stringify({ ok: true, versionId: row.id, key, bytes: size }))
      } catch (e) {
        failed += 1
        console.error(JSON.stringify({ error: String(e instanceof Error ? e.message : e), versionId: row.id }))
      }
    }
  }
  console.log(
    JSON.stringify({
      summary: { mode: dry ? 'dry' : 'migrate', moved, bytes, failed },
    })
  )
  if (failed > 0) process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
