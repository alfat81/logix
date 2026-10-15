import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { isPhoneNormalized } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'
import { ClientAccessSchema } from '@/lib/client-constants'

type Params = { params: Promise<{ id: string }> }

// ─── POST /api/admin/customers/[id]/access — доступ в кабинет (И1) ──
// Выдать/сменить пароль клиента (тело { password: "…" }) или отозвать
// доступ ({ password: null }). Модель — та же, что у подрядчика
// (Г2/Г3): учётку внешнему пользователю выдаёт менеджер, у клиента
// саморегистрации нет (SMS-верификации телефона в MVP нет, «регистрация
// на любой номер» открывала бы чужие заявки). Право — любой сотрудник
// на запись (write:true): выдача доступа клиенту — часть ведения
// сделки, как и пароль подрядчика; мастер-only здесь не нужен (в
// отличие от справочника сотрудников Ж6в, раскрывающего ВСЕ учётки).
//
// Смена/отзыв РВУТ сессии (паттерн Ж6в): сброс пароля закрывает вход,
// где старый пароль уже введён; при повторной выдаче старые сессии не
// воскресают. Аудит Ж2 не пишется: цель события — заявка/лид/
// подрядчик, у управления доступом цели нет (решение Ж6в).
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = ClientAccessSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })
    }

    // Логин в кабинет — по нормализованному телефону (+7XXXXXXXXXX):
    // клиент без телефона (или с иностранным сырым номером, который не
    // нормализуется) войти не сможет в принципе. Отказываем сразу с
    // внятным текстом, а не выдаём мертворождённый доступ (паттерн
    // нормализации сотрудников Ж6в: логин А5/И1 иначе не пускает).
    if (parsed.data.password !== null && !isPhoneNormalized(customer.phone ?? '')) {
      return NextResponse.json(
        {
          error:
            'У клиента не указан нормализованный российский телефон (+7…). Вход в кабинет идёт по телефону — сначала заполните его в справочнике.',
        },
        { status: 400 }
      )
    }

    if (parsed.data.password === null) {
      // Отзыв доступа: пароль снимается, живые сессии гаснут
      await db.$transaction([
        db.customer.update({ where: { id }, data: { password: null } }),
        db.clientSession.deleteMany({ where: { customerId: id } }),
      ])
      return NextResponse.json({ ok: true, hasCabinetAccess: false })
    }

    // Выдача/смена: новый хеш + разрыв старых сессий (сброс = «старый
    // вход больше не доверен», Ж6в)
    await db.$transaction([
      db.customer.update({ where: { id }, data: { password: hashPassword(parsed.data.password) } }),
      db.clientSession.deleteMany({ where: { customerId: id } }),
    ])
    return NextResponse.json({ ok: true, hasCabinetAccess: true })
  } catch (e) {
    return apiErrorResponse(e, 'customers/access POST', 'Не удалось изменить доступ')
  }
}
