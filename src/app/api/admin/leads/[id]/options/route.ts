import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { CreateQuoteOptionSchema, LEAD_STATUS_LABELS } from '@/lib/leads'
import { resolveActiveCurrencies } from '@/lib/ref-db'
import { apiErrorResponse } from '@/lib/api-errors'
import { createOption } from '@/lib/option-write'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/leads/[id]/options — добавить вариант (В3 + DF-27) ──
// no-event: события пишет ядро lib/option-write.ts (option_added — с пометкой
// предварительного расчёта и перечнем missing — в той же транзакции сохранения).
// DF-27 волна 1: вариант — самостоятельный расчёт. Снимки бланка
// запроса строятся автоматически (buildOptionSnapshots), overrides
// уходят в editedFields (provenance), строки расчёта и ревизия created
// — в той же транзакции (логика — lib/option-write.ts). Единственный
// побочный автомат воронки сохранён: первый вариант переводит
// new → calculated. При незакрытых критичных параметрах — 422 с
// перечнем недостающего либо isPreliminary=true (ТЗ §5.1–5.3).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    // Пустое/битое тело — 400, а не 500: req.json() кидает до safeParse,
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = CreateQuoteOptionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    // DF-17: валюты варианта и строк расчёта — из справочника (активные);
    // пустая таблица (свежий деплой без сида) — запасной список money.ts
    const lineCurrencies = (data.calcLines ?? []).map((l) => l.currency)
    const currencies = await resolveActiveCurrencies([
      data.currency,
      data.costCurrency,
      ...lineCurrencies,
    ])
    if (currencies.invalid.length > 0) {
      return NextResponse.json(
        { error: `Валюта не найдена в справочнике или отключена: ${currencies.invalid.join(', ')}` },
        { status: 400 }
      )
    }

    // Пред-гарды (понятные 404/409 до транзакции); те же гарды —
    // повторно внутри с блокировкой строки (AUD-01)
    const lead = await db.lead.findUnique({
      where: { id },
      include: { order: { select: { id: true, number: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    if (lead.status === 'won' || lead.order) {
      return NextResponse.json(
        { error: 'Запрос конвертирован в заявку — варианты расчёта зафиксированы' },
        { status: 409 }
      )
    }
    if (lead.status === 'client_approved') {
      return NextResponse.json(
        { error: 'Согласование активно — сначала сбросьте его действием «Изменить условия»' },
        { status: 409 }
      )
    }

    const result = await createOption(id, data, auth.employee)
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.missing ? { missing: result.missing } : {}),
        },
        { status: result.status }
      )
    }

    // Свежий лид с полным составом вариантов — карточке не нужен
    // повторный GET после добавления
    const updatedLead = await db.lead.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    return NextResponse.json(
      {
        option: result.option,
        calcTotals: result.calcTotals,
        missing: result.missing,
        lead: updatedLead,
        ...(result.becomesCalculated
          ? {
              message: `Добавлен вариант расчёта — статус запроса: ${LEAD_STATUS_LABELS.calculated}`,
            }
          : { message: 'Вариант расчёта добавлен' }),
      },
      { status: 201 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'lead options POST', 'Не удалось добавить вариант расчёта')
  }
}
