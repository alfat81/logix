import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { CreateContractorLeadSchema, CONTRACTOR_LEAD_STATUSES } from '@/lib/contractors'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/contractor-leads — список кандидатов (Г2) ──────
// Query: ?status=new|qualifying|contracted|rejected — фильтр по стадии
// квалификации (табы Г5, паттерн лидов В2/В5). Свежие сверху; include
// contractor — карточке кандидата сразу видно родившегося подрядчика
// (статус «В пуле» без ссылки на справочник — неполный).
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const status = req.nextUrl.searchParams.get('status')
  if (status && !(CONTRACTOR_LEAD_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Неизвестный статус кандидата' }, { status: 400 })
  }

  try {
    const contractorLeads = await db.contractorLead.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        contractor: { select: { id: true, companyName: true, phone: true, isActive: true } },
      },
    })

    return NextResponse.json({ contractorLeads })
  } catch (e) {
    return apiErrorResponse(e, 'contractor-leads GET', 'Не удалось загрузить кандидатов')
  }
}

// ─── POST /api/admin/contractor-leads — создать кандидата (Г2) ─────
// Кандидат рождается на этапе поиска/знакомства: companyName + сырая
// анкета rawInfo (контакты/что возит/зоны). Подрядчика заводить заранее
// не нужно — он родится сам при переводе в пул (PATCH contracted, Г2),
// как Customer из rawContact при конвертации лида (В4).
export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  try {
    // Пустое/битое тело — 400, а не 500: req.json() кидает до safeParse
    // (паттерн В2/В3).
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = CreateContractorLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    const contractorLead = await db.contractorLead.create({
      data: {
        status: 'new',
        companyName: data.companyName,
        // zod-объекты шире Prisma.InputJsonObject — явный каст на границе
        // (тот же приём, что rawContact/cargoInfo в В2); без поля колонка
        // остаётся SQL NULL.
        ...(data.rawInfo
          ? { rawInfo: data.rawInfo as unknown as Prisma.InputJsonObject }
          : {}),
      },
      include: {
        contractor: { select: { id: true, companyName: true, phone: true, isActive: true } },
      },
    })

    return NextResponse.json(
      { contractorLead, message: 'Кандидат создан' },
      { status: 201 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'contractor-leads POST', 'Не удалось создать кандидата')
  }
}
