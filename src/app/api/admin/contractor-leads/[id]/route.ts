import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { PatchContractorLeadSchema, CONTRACTOR_LEAD_STATUS_LABELS } from '@/lib/contractors'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'

type Params = { params: Promise<{ id: string }> }

// Свежая карточка кандидата для ответа (UI Г5 не нужен повторный GET).
async function loadContractorLeadCard(id: string) {
  return db.contractorLead.findUnique({
    where: { id },
    include: {
      contractor: { select: { id: true, companyName: true, phone: true, isActive: true } },
    },
  })
}

// ─── GET /api/admin/contractor-leads/[id] — карточка кандидата ─────
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const contractorLead = await loadContractorLeadCard(id)
    if (!contractorLead) {
      return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 })
    }

    return NextResponse.json({ contractorLead })
  } catch (e) {
    return apiErrorResponse(e, 'contractor-lead GET', 'Не удалось загрузить кандидата')
  }
}

// ─── PATCH /api/admin/contractor-leads/[id] — переходы квалификации ─
//
// Правила (очередь Г2 + роадмап 2, симметрии с воронкой лидов В2/В4):
//   • статус меняет только человек — в подрядческой воронке нет вообще
//     автоматов (в отличие от new→calculated в клиентской, В3);
//   • «contracted» руками «просто статусом» НЕ ставится — только
//     рождением Contractor в транзакции вместе с логином для ЛК
//     (phone + пароль), и он терминальный: из пула кандидат не
//     возвращается в квалификацию — «исключение» живёт на самом
//     подрядчике (isActive, Г3), а не откатом кандидата;
//   • «rejected» требует причину (rejectReason), уход из rejected её
//     чистит — тот же приём, что lostReason у лида (В2);
//   • повторная установка того же статуса — 400, а не молчаливый 200;
//   • rejected — НЕ терминальный: кандидат вернулся на переговоры —
//     человек вернул его в qualifying (симметрия с lost→в работу).
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchContractorLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { status, rejectReason } = parsed.data

    const existing = await loadContractorLeadCard(id)
    if (!existing) {
      return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 })
    }

    if (existing.status === 'contracted') {
      return NextResponse.json(
        { error: 'Кандидат уже переведён в пул — статус терминальный' },
        { status: 409 }
      )
    }
    if (status === existing.status) {
      return NextResponse.json(
        { error: `Статус кандидата уже: ${CONTRACTOR_LEAD_STATUS_LABELS[status]}` },
        { status: 400 }
      )
    }

    // ── Сценарий 1: рождение подрядчика (status=contracted) ──
    if (status === 'contracted') {
      // Двойной клик/гонка: подрядчик уже родился параллельным запросом,
      // но статус ещё не дописан — честный 409, дубль не создаём.
      if (existing.contractor) {
        return NextResponse.json(
          { error: 'Подрядчик уже создан для этого кандидата' },
          { status: 409 }
        )
      }

      const { phone, password, competencies, contactInfo, contractNumber, contractSignedAt, comment } =
        parsed.data
      if (!phone || !password) {
        return NextResponse.json(
          { error: 'Для перевода в пул укажите телефон и стартовый пароль для входа в ЛК подрядчика' },
          { status: 400 }
        )
      }

      // Нормализация — единственный раз, в момент рождения (паттерн В4:
      // +7 900 555-01-02 → +79005550102; иностранного формата телефон
      // сохраняется как есть — потерять логин хуже, чем хранить сырой).
      const loginPhone = normalizePhone(phone) ?? phone

      // Занятость телефона — ДО транзакции: понятный 409 вместо P2002
      // (справочник пула глобален, телефоны могут повторяться у разных
      // перевозчиков только по ошибке ввода).
      const phoneOwner = await db.contractor.findUnique({
        where: { phone: loginPhone },
        select: { id: true, companyName: true },
      })
      if (phoneOwner) {
        return NextResponse.json(
          {
            error: `Телефон уже используется подрядчиком «${phoneOwner.companyName}» — укажите другой`,
          },
          { status: 409 }
        )
      }

      // Обе записи — одной транзакцией: краш между create и update не
      // рождает подрядчика-сироту без кандидата (и наоборот). В отличие
      // от конвертации лида (В4), здесь нет retry-петли P2002 внутри —
      // транзакция безопасна; гонку двойного клика ловит @unique на
      // ContractorLead.contractorId с откатом всей транзакции.
      try {
        const contractor = await db.$transaction(async (tx) => {
          const created = await tx.contractor.create({
            data: {
              companyName: existing.companyName,
              phone: loginPhone,
              password: hashPassword(password),
              ...(competencies
                ? { competencies: competencies as unknown as Prisma.InputJsonObject }
                : {}),
              ...(contactInfo
                ? { contactInfo: contactInfo as unknown as Prisma.InputJsonObject }
                : {}),
              ...(contractNumber ? { contractNumber } : {}),
              ...(contractSignedAt ? { contractSignedAt } : {}),
              ...(comment ? { comment } : {}),
            },
          })
          await tx.contractorLead.update({
            where: { id },
            data: { status: 'contracted', contractorId: created.id },
          })
          // Ж2: журнал — рождение подрядчика в той же транзакции:
          // событие существует ровно тогда, когда и сам подрядчик
          // (откат Г2 откатывает и запись).
          await emitEvent(tx, {
            target: { contractorId: created.id },
            actor: employeeActor(auth.employee),
            type: 'contractor_created',
            description: `Переведён в пул из кандидатов (кандидат: ${existing.companyName}) — создан логин ЛК`,
          })
          return created
        })

        const contractorLead = await loadContractorLeadCard(id)
        return NextResponse.json(
          {
            contractorLead,
            contractor: {
              id: contractor.id,
              companyName: contractor.companyName,
              phone: contractor.phone,
              isActive: contractor.isActive,
            },
            message: `Подрядчик «${contractor.companyName}» создан и в пуле`,
          },
          { status: 201 }
        )
      } catch (e) {
        // Гонка двух запросов с одним телефоном или двойной клик по
        // «в пул»: уникальности (phone, contractorId) дали P2002 —
        // отдаём честный 409, а не 500.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          return NextResponse.json(
            { error: 'Подрядчик с такими данными уже существует (гонка запросов)' },
            { status: 409 }
          )
        }
        throw e
      }
    }

    // ── Сценарий 2: ручные переходы (qualifying | new | rejected) ──
    if (status === 'rejected' && !rejectReason) {
      return NextResponse.json(
        { error: 'Укажите причину отказа (rejectReason)' },
        { status: 400 }
      )
    }

    const contractorLead = await db.contractorLead.update({
      where: { id },
      data: {
        status,
        // rejectReason пишется только вместе со статусом rejected; при
        // уходе из rejected причина чистится (иначе «Отказ» с хвостом
        // старой причины после возврата кандидата — тот же баг, что
        // ловили у lostReason в В2).
        ...(status === 'rejected'
          ? { rejectReason }
          : existing.status === 'rejected'
            ? { rejectReason: null }
            : {}),
      },
      include: {
        contractor: { select: { id: true, companyName: true, phone: true, isActive: true } },
      },
    })

    return NextResponse.json({
      contractorLead,
      message: `Статус кандидата: ${CONTRACTOR_LEAD_STATUS_LABELS[status]}`,
    })
  } catch (e) {
    return apiErrorResponse(e, 'contractor-lead PATCH', 'Не удалось обновить кандидата')
  }
}

// ─── DELETE /api/admin/contractor-leads/[id] — удалить кандидата ───
// Только БЕЗ родившегося подрядчика: contracted-кандидат — уже история
// квалификации, его удаление разорвёт связь ContractorLead.contractorId,
// а с ней и trace «из кого вырос подрядчик» (симметрия с В2: лид с
// заявкой не удаляется).
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const contractorLead = await db.contractorLead.findUnique({
      where: { id },
      include: { contractor: { select: { id: true } } },
    })
    if (!contractorLead) {
      return NextResponse.json({ error: 'Кандидат не найден' }, { status: 404 })
    }
    if (contractorLead.contractor) {
      return NextResponse.json(
        { error: 'Нельзя удалить кандидата, переведённого в пул (подрядчик создан)' },
        { status: 409 }
      )
    }

    await db.contractorLead.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'Кандидат удалён' })
  } catch (e) {
    return apiErrorResponse(e, 'contractor-lead DELETE', 'Не удалось удалить кандидата')
  }
}
