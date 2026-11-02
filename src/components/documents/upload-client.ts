'use client'

import { readApiResponse } from '@/lib/api-client'

// ─── DF-11: клиентская часть двухфазной загрузки ────────────────────
// 1) POST JSON (метаданные) → сервер создаёт pending-версию и отдаёт
//    presigned PUT + confirmUrl; 2) браузер грузит байты напрямую в
//    хранилище (XHR — единственный способ получить прогресс загрузки,
//    у fetch его нет; критерий приёмки DF-11 «20 МБ с индикацией»);
//    3) POST confirm — сервер проверяет размер и сигнатуру.

export type UploadTicketUi = {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresIn: number
}

export async function uploadTwoPhase(opts: {
  createUrl: string
  createBody: Record<string, unknown>
  confirmBody?: Record<string, unknown>
  file: File
  onProgress?: (percent: number) => void
}): Promise<void> {
  // Шаг 1: метаданные → pending-версия + presigned PUT.
  const res = await fetch(opts.createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.createBody),
  })
  const data = await readApiResponse<{
    upload?: UploadTicketUi
    confirmUrl?: string
    error?: string
  }>(res)
  if (!res.ok || !data.upload?.url || !data.confirmUrl) {
    throw new Error(data.error || 'Не удалось начать загрузку')
  }

  // Шаг 2: байты — напрямую в хранилище, с прогрессом.
  await putFileToStorage(data.upload.url, data.upload.headers ?? {}, opts.file, opts.onProgress)

  // Шаг 3: confirm (адрес — из ответа create) — сервер проверяет содержимое.
  const cres = await fetch(data.confirmUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts.confirmBody ?? {}),
  })
  const cdata = await readApiResponse<{ error?: string }>(cres)
  if (!cres.ok) {
    throw new Error(cdata.error || 'Не удалось подтвердить загрузку')
  }
}

function putFileToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) {
      try {
        xhr.setRequestHeader(name, value)
      } catch {
        // Запрещённый браузером заголовок — хранилище ответит ошибкой на confirm.
      }
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Хранилище отклонило загрузку (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Хранилище недоступно — повторите попытку'))
    xhr.ontimeout = () => reject(new Error('Хранилище не ответило — повторите попытку'))
    xhr.send(file)
  })
}
