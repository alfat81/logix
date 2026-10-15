import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { PatchContractorSchema, CONTRACTOR_PUBLIC_FIELDS } from '@/lib/contractors'
import { apiErrorResponse } from '@/lib/api-errors'
import { logActivity, employeeActor } from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// ─── PATCH /api/admin/contractors/[id] — правка подрядчика пула ──
//
// Единственный write-роут справочника: DELETE не предусмотрен вовсе
// (очередь Г3 — история заявок не должна терять исполнителей,
// «удаление» = isActive=false). Отдельно про isActive: исключение из
// пула НЕ трогает существующие назначения на этапы и не рвёт вход в
// ЛК (Г4) — мягкое исключение, иначе сорванные перевозки; блокируется
// только НАЗНАЧЕНИЕ на новое (проверка в PATCH stages, Г3).
//
// Гет/список отдают публичную проекцию без password (Г3); смена пароля
// здесь пишет новый хеш, не возвращая его наружу.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchContractorSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
    }

    const existing = await db.contractor.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Подрядчик не найден' }, { status: 404 })
    }

    // Телефон — логин ЛК: нормализация в момент записи (тот же приём,
    // что рождение в Г2: +7 900 555-01-02 → +79005550102, иностранный
    // формат сохраняется сырым), занятость — понятный 409 ДО update.
    let loginPhone: string | undefined
    if (data.phone) {
      loginPhone = normalizePhone(data.phone) ?? data.phone
      const phoneOwner = await db.contractor.findUnique({
        where: { phone: loginPhone },
        select: { id: true, companyName: true },
      })
      if (phoneOwner && phoneOwner.id !== id) {
        return NextResponse.json(
          {
            error: `Телефон уже используется подрядчиком «${phoneOwner.companyName}» — укажите другой`,
          },
          { status: 409 }
        )
      }
    }

    const contractor = await db.contractor.update({
      where: { id },
      select: CONTRACTOR_PUBLIC_FIELDS,
      data: {
        ...(data.companyName ? { companyName: data.companyName } : {}),
        ...(loginPhone ? { phone: loginPhone } : {}),
        ...(data.password ? { password: hashPassword(data.password) } : {}),
        ...(data.competencies
          ? { competencies: data.competencies as unknown as Prisma.InputJsonObject }
          : {}),
        ...(data.contactInfo
          ? { contactInfo: data.contactInfo as unknown as Prisma.InputJsonObject }
          : {}),
        // nullable-поля: null/пустая строка осознанно ОЧИЩАЮТ значение
        // (паттерн incoterm/hsCode у заявки, Б3) — «забыть старый номер
        // договора» не должно требовать прямых правок в БД.
        ...(data.contractNumber !== undefined
          ? { contractNumber: data.contractNumber || null }
          : {}),
        ...(data.contractSignedAt !== undefined
          ? { contractSignedAt: data.contractSignedAt }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.comment !== undefined ? { comment: data.comment || null } : {}),
      },
    })

    // Сообщение по частям: исключение/возврат в пул и смена пароля —
    // отдельные события, правка профиля — фон. Важно для UI Г5: тост
    // должен сказать, что произошло, а не «Сохранено».
    const parts: string[] = []
    if (data.isActive !== undefined) {
      parts.push(data.isActive ? 'возвращён в пул' : 'исключён из пула')
    }
    if (data.password) parts.push('пароль обновлён')
    const profileTouched =
      data.companyName !== undefined ||
      data.phone !== undefined ||
      data.competencies !== undefined ||
      data.contactInfo !== undefined ||
      data.contractNumber !== undefined ||
      data.contractSignedAt !== undefined ||
      data.comment !== undefined
    if (profileTouched) parts.push('профиль обновлён')

    // Ж2: журнал — теми же частями, что и сообщение: пул, пароль и
    // профиль — разные события истории (исключение/возврат — решение,
    // пароль — доступ, профиль — уточнение данных).
    if (data.isActive !== undefined) {
      await logActivity(
        { contractorId: id },
        employeeActor(auth.employee),
        'contractor_pool_changed',
        data.isActive
          ? 'Возвращён в пул — назначается на новые этапы'
          : 'Исключён из пула — новые назначения заблокированы, существующие и вход в ЛК живут',
      )
    }
    if (data.password) {
      await logActivity(
        { contractorId: id },
        employeeActor(auth.employee),
        'contractor_password_changed',
        'Обновлён пароль ЛК подрядчика',
      )
    }
    if (profileTouched) {
      await logActivity(
        { contractorId: id },
        employeeActor(auth.employee),
        'contractor_updated',
        'Обновлены данные подрядчика',
      )
    }

    return NextResponse.json({
      contractor,
      message: `${contractor.companyName} — ${parts.join(', ')}`,
    })
  } catch (e) {
    // Гонка на телефон между проверкой занятости и update: уникальность
    // БД отдаёт P2002 — честный 409, а не 500 (тот же приём, что
    // рождение подрядчика в Г2).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { error: 'Телефон уже используется другим подрядчиком (гонка запросов)' },
        { status: 409 }
      )
    }
    return apiErrorResponse(e, 'contractor PATCH', 'Не удалось обновить подрядчика')
  }
}
