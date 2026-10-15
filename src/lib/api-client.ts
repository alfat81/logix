// ─── Браузерный хелпер чтения ответа API ───────────────────────
// Дев-режим Next на необработанном краше роута отдаёт НЕ-JSON тело
// (HTML-страница ошибки) — голый res.json() кидал SyntaxError
// «Unexpected token…», который вместо текста ошибки показывался в
// тосте (инцидент «500 на /admin/leads»). Хелпер глотает битое тело
// и отдаёт пустой объект: !res.ok останется, fallback-текст — тоже.

export async function readApiResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}
