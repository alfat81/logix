import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api-errors'
import { CustomsCalcInputSchema, CustomsInputError, type CustomsCalcInput } from '@/lib/customs'
import { CustomsNotFoundError, CustomsRulesDraftError } from '@/lib/customs-server'

// ─── DF-19: общий хвост API расчётов (RULES 2.5 — роуты тонкие) ──────
// Разбор тела (JSON + zod) и маппинг ошибок домена на HTTP-коды —
// ОДНА точка для трёх роутов (leads/orders POST, PUT черновика):
// интеграция ошибок не расходится между роутами, IC-14 дубликатов нет.

export type CalcBodyResult =
  | { input: CustomsCalcInput; response?: undefined }
  | { input?: undefined; response: NextResponse }

export async function readCalcInput(req: NextRequest): Promise<CalcBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { response: NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 }) }
  }
  const parsed = CustomsCalcInputSchema.safeParse(body)
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      ),
    }
  }
  return { input: parsed.data }
}

// Маппинг доменных ошибок DF-19: черновые правила — 409 (состояние
// справочника), нет расчёта — 404, ошибка входных данных — 400,
// остальное — общий 500 через apiErrorResponse.
export function calcErrorResponse(
  e: unknown,
  scope: string,
  fallback: string
): NextResponse {
  if (e instanceof CustomsRulesDraftError) {
    return NextResponse.json({ error: e.message }, { status: 409 })
  }
  if (e instanceof CustomsNotFoundError) {
    return NextResponse.json({ error: e.message }, { status: 404 })
  }
  if (e instanceof CustomsInputError) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
  return apiErrorResponse(e, scope, fallback)
}

// ─── GET истории расчётов (общий для лида и заявки) ──────────────────
// Существование цели проверяется здесь (404 — не тот id), история —
// listCalculations (текущая сверху). Только сотрудники (роут).
import { db } from '@/lib/db'
import { listCalculations } from '@/lib/customs-server'

export async function calculationsListResponse(
  id: string,
  kind: 'lead' | 'order'
): Promise<NextResponse> {
  const target =
    kind === 'lead'
      ? await db.lead.findUnique({ where: { id }, select: { id: true } })
      : await db.order.findUnique({ where: { id }, select: { id: true } })
  if (!target) {
    return NextResponse.json(
      { error: kind === 'lead' ? 'Запрос не найден' : 'Заявка не найдена' },
      { status: 404 }
    )
  }
  const calculations =
    kind === 'lead' ? await listCalculations({ leadId: id }) : await listCalculations({ orderId: id })
  return NextResponse.json({ calculations })
}

// ─── Пролог write-запроса (общий для POST/PUT трёх роутов) ───────────
// auth (write) + id из пути + валидированное тело — одна точка; роут
// остаётся с собственной проверкой цели и своими ошибками.
import { requireEmployee, type CurrentEmployee } from '@/lib/auth'

export type CalcWriteCtx =
  | { id: string; input: CustomsCalcInput; employee: CurrentEmployee; response?: undefined }
  | { id?: undefined; input?: undefined; employee?: undefined; response: NextResponse }

export async function requireCalcWriter(
  req: NextRequest,
  params: Promise<{ id: string }>
): Promise<CalcWriteCtx> {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return { response: auth.response }
  const { id } = await params
  const body = await readCalcInput(req)
  if (body.response) return { response: body.response }
  return { id, input: body.input, employee: auth.employee }
}
