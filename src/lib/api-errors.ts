import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

// ─── Единый ответ на ошибки API-роутов ────────────────────────
// Хотфикс после инцидента «500 на /admin/leads» (07.10.2026):
// GET-роуты воронки не имели try/catch, и рассинхрон БД с кодом
// (пользователь применил zip В-эры, но не выполнил db push — в Neon
// не появились таблицы Lead/QuoteOption) падал необработанным
// Prisma P2021 → «пустой» 500 без объяснений в интерфейсе.
//
// Хелпер превращает известные ошибки ОКРУЖЕНИЯ в действие, а всё
// прочее честно логирует и возвращает прежний понятный 500.

export const DB_OUT_OF_SYNC_HINT =
  'База данных не соответствует схеме приложения: не хватает таблиц или ' +
  'столбцов (похоже, после обновления кода не применены миграции). ' +
  'Выполните «bun run db:deploy» (миграции) и перезапустите сервер — ' +
  'см. DEPLOY.md, раздел «Обновление версии».'

export function apiErrorResponse(
  e: unknown,
  context: string,
  fallbackMessage: string
): NextResponse {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    (e.code === 'P2021' || e.code === 'P2022')
  ) {
    console.error(`[${context}] схема БД отстала от кода (${e.code}):`, e.message)
    return NextResponse.json({ error: DB_OUT_OF_SYNC_HINT }, { status: 500 })
  }
  // Бизнес-ошибки домена (D35): модули ядра бросают Error с statusCode
  // 4xx (permits-db.ts: PATCH received без файла, waived без причины) —
  // честный код вместо 500 (IC: контракт ошибки = код смыслового слоя).
  const statusCode = (e as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : fallbackMessage },
      { status: statusCode }
    )
  }
  console.error(`[${context}] error:`, e)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}
