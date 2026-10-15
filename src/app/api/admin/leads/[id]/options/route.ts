import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { CreateQuoteOptionSchema, LEAD_STATUS_LABELS } from '@/lib/leads'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/leads/[id]/options — добавить вариант (В3) ──
// Один вариант = один способ доставки (описание + виды транспорта +
// цена + срок + ориентир speed|cost|safety). Инвариант выбора — ровно
// один выбранный на лид: вариант, созданный сразу с isSelected:true,
// снимает отметку с прежнего (в одной транзакции).
//
// Единственный побочный автомат воронки (роадмап 8.1 + очередь В3):
// добавление варианта лиду в статусе «new» переводит его в
// «calculated» — статус буквально означает «посчитан». Откат при
// удалении варианта НЕ предусмотрен: статус меняет человек (В2 PATCH),
// не триггер.
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

    const lead = await db.lead.findUnique({
      where: { id },
      include: { order: { select: { id: true, number: true } } },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    }
    // «won» — терминальный (В2): лид сконвертирован в заявку, варианты
    // расчёта зафиксированы историей сделки. Правка истории — не через API.
    if (lead.status === 'won' || lead.order) {
      return NextResponse.json(
        { error: 'Лид конвертирован в заявку — варианты расчёта зафиксированы' },
        { status: 409 }
      )
    }

    const becomesCalculated = lead.status === 'new'

    // Интерактивная транзакция: массивная форма $transaction([...]) с
    // условным spread ломает позиционность результатов (при isSelected
    // первым элементом оказывался счётчик updateMany, а не созданный
    // вариант — поймано smoke-тестом В3).
    const option = await db.$transaction(async (tx) => {
      // Выбор нового снимает отметку с прежнего — до создания, чтобы
      // «ровно один» держался и внутри транзакции.
      if (data.isSelected) {
        await tx.quoteOption.updateMany({
          where: { leadId: id, isSelected: true },
          data: { isSelected: false },
        })
      }
      const created = await tx.quoteOption.create({
        data: {
          leadId: id,
          description: data.description,
          // zod-массив шире Prisma.InputJson — явный каст на границе
          // (тот же приём, что и rawContact/cargoInfo в В2); без поля
          // колонка остаётся SQL NULL.
          ...(data.transportModes
            ? {
                transportModes:
                  data.transportModes as unknown as Prisma.InputJsonArray,
              }
            : {}),
          priceEstimate: data.priceEstimate,
          etaDays: data.etaDays,
          priorityFit: data.priorityFit,
          isSelected: data.isSelected ?? false,
        },
      })
      if (becomesCalculated) {
        await tx.lead.update({ where: { id }, data: { status: 'calculated' } })
      } else {
        // Ж5: работа с вариантами — тоже движение по лиду (update и так
        // тронет @updatedAt, но явная запись читается яснее намерения).
        await tx.lead.update({ where: { id }, data: { updatedAt: new Date() } })
      }
      // Ж2: журнал — в той же транзакции (откат создания откатывает
      // и запись). Автомат new→calculated дописывается в описание —
      // единственный автомат воронки заслуживает строки в ленте.
      await logActivity(
        { leadId: id },
        employeeActor(auth.employee),
        'option_added',
        `Добавлен вариант расчёта: ${data.description} — ${new Intl.NumberFormat('ru-RU').format(data.priceEstimate)} ₽, ${data.etaDays} дн.` +
          (becomesCalculated ? ` — лид посчитан: ${LEAD_STATUS_LABELS.calculated}` : ''),
        tx,
      )
      return created
    })

    // Свежий лид с полным составом вариантов — В5-карточке не нужен
    // повторный GET после добавления.
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
        option,
        lead: updatedLead,
        ...(becomesCalculated
          ? {
              message: `Добавлен вариант расчёта — статус лида: ${LEAD_STATUS_LABELS.calculated}`,
            }
          : { message: 'Вариант расчёта добавлен' }),
      },
      { status: 201 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'lead options POST', 'Не удалось добавить вариант расчёта')
  }
}
