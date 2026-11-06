'use client'

import { readApiResponse } from '@/lib/api-client'
import type { PackageFallbackUi } from '@/components/documents/parts/PackageZipFallbackDialog'

// ─── DF-26 §8: клиентская часть скачивания ZIP-архива документов ────
// GET (финальные) или POST (все доступные/выбранные, с подтверждением).
// JSON-ответ вместо архива — порог размера Vercel: показываем фолбэк
// со ссылками. Успех — сохранение файла через временный <a download>.
// Вынесено из DocumentsRegistrySection (RULES 2.14: файл ≤ 300 строк).

export type ZipDownloadInit = { scope: 'all' | 'selected'; documentIds?: string[] }

export async function downloadZipArchive(
  zipUrl: string,
  init?: ZipDownloadInit,
): Promise<{ fallback?: PackageFallbackUi }> {
  const res = await fetch(zipUrl, {
    method: init ? 'POST' : 'GET',
    headers: init ? { 'Content-Type': 'application/json' } : undefined,
    body: init ? JSON.stringify(init) : undefined,
  })
  const contentType = res.headers.get('content-type') ?? ''
  if (!res.ok) {
    const json = await readApiResponse<{ error?: string }>(res)
    throw new Error(json.error || 'Не удалось собрать архив')
  }
  if (contentType.includes('application/json')) {
    return { fallback: (await res.json()) as PackageFallbackUi }
  }
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename="?([^";]+)"?/i)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = match ? match[1] : 'documents.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
  return {}
}
