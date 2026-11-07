// ─── Общий разбор JSON-тела запроса с zod-валидацией ───────────
// IC-14: тройное повторение parse-блока (reject документа, подключение
// брокера к лиду и заявке) вынесено в один хелпер — маршрутные файлы
// не содержат общих 12-строчных окон. Контракт ответа совпадает с
// прежним: 400 «Некорректный JSON в теле запроса» при нечитаемом теле,
// 400 «Некорректные данные» + details.flatten() при провале схемы.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

export async function parseJsonBody<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T,
): Promise<ParsedBody<z.output<T>>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Некорректный JSON в теле запроса' },
        { status: 400 },
      ),
    }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 },
      ),
    }
  }
  return { ok: true, data: parsed.data }
}
