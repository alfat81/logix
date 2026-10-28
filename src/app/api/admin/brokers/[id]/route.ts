import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { PatchBrokerSchema, BROKER_PUBLIC_FIELDS } from '@/lib/brokers'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  CompanyUserError,
  getPrimaryBrokerUser,
  updateBrokerUser,
  createBrokerUser,
} from '@/lib/company-users'

type Params = { params: Promise<{ id: string }> }

// ─── PATCH /api/admin/brokers/[id] — правка справочника (Д) ──────
// Правка профиля, смена пароля (рвёт сессии — паттерн Ж6в/И1: сброс
// пароля закрывает вход, где старый пароль уже введён), деактивация
// и возврат (isActive). Телефон — ЛОГИН портала: нормализация в
// момент записи + занятость другим брокером — 409 (паттерн Г3).
//
// Связи LeadBroker/OrderBroker при деактивации НЕ рвутся: история
// живёт, доступ гасится живой проверкой isActive в broker-auth, а
// новые подключения отклоняются 409 в роутах связей.
//
// DELETE роута нет вовсе (см. шапку /api/admin/brokers). Аудит Ж2
// не пишется — у событий справочника нет цели «заявка/лид» (Ж6в).
export async function PATCH(req: NextRequest, { params }: Params) {
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
    const parsed = PatchBrokerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    const existing = await db.broker.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Брокер не найден' }, { status: 404 })
    }

    // Телефон-логин: нормализация (сырой номер в учётке сделать
    // нельзя — вход его не найдёт) + занятость (409, не молчаливый
    // перехват логина чужого портала).
    if (data.phone !== undefined) {
      const phone = normalizePhone(data.phone)
      if (!phone) {
        return NextResponse.json(
          {
            error:
              'Телефон — логин портала: укажите российский номер, который приводится к +7XXXXXXXXXX',
          },
          { status: 400 }
        )
      }
      if (phone !== existing.phone) {
        const phoneOwner = await db.broker.findUnique({
          where: { phone },
          select: { companyName: true },
        })
        if (phoneOwner) {
          return NextResponse.json(
            {
              error: `Телефон уже используется брокером «${phoneOwner.companyName}» — укажите другой`,
            },
            { status: 409 }
          )
        }
      }
      data.phone = phone
    }

    // Смена пароля ИЛИ деактивация — рвут живые сессии: сброс = «старый
    // вход больше не доверен» (Ж6в), деактивация = доступ закрыт (И1).
    // Реактивация старые сессии не воскрешает (их уже нет).
    const mustTearSessions = data.password !== undefined || data.isActive === false

    const broker = await db.$transaction(async (tx) => {
      const updated = await tx.broker.update({
        where: { id },
        data: {
          ...(data.companyName !== undefined ? { companyName: data.companyName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          // DF-02: email; null — осознанная очистка, отсутствие — не менять.
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.isInHouse !== undefined ? { isInHouse: data.isInHouse } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.comment !== undefined ? { comment: data.comment || null } : {}),
          // Json-поле: null — осознанная очистка (SQL NULL, как
          // cargoInfo/quoteSnapshot в Ж1); объект — замена целиком
          ...(data.contactInfo !== undefined
            ? {
                contactInfo:
                  data.contactInfo === null
                    ? Prisma.DbNull
                    : (data.contactInfo as unknown as Prisma.InputJsonObject),
              }
            : {}),
        },
        select: BROKER_PUBLIC_FIELDS,
      })
      if (mustTearSessions) {
        await tx.brokerSession.deleteMany({ where: { brokerId: id } })
      }
      // DF-02A: основной пользователь — единственный источник входа
      // (зеркало Broker.password удалено contract-миграцией df_03_contract,
      // DEPRECATIONS 0.6.5). Смена пароля у пользователя рвёт ЕГО сессии —
      // компания уже погашена выше. Имя пользователя не трогаем: это имя
      // человека, его правят в списке людей (Блок 5), а не вслед за
      // названием компании.
      if (data.password !== undefined || data.phone !== undefined) {
        const primary = await getPrimaryBrokerUser(tx, id)
        if (primary) {
          await updateBrokerUser(tx, primary.id, {
            ...(data.password !== undefined ? { password: data.password } : {}),
            ...(data.phone !== undefined ? { phone: data.phone } : {}),
          })
        } else if (data.password !== undefined) {
          // Страховка рассинхрона (брокера без пользователя быть не
          // должно — миграция создала всем, POST создаёт сразу):
          // восстанавливаем primary из доступных данных.
          await createBrokerUser(tx, id, {
            name: existing.companyName,
            phone: data.phone ?? existing.phone,
            password: data.password,
            isPrimary: true,
          })
        }
      }
      return updated
    })

    return NextResponse.json({
      broker,
      message:
        data.password !== undefined
          ? 'Пароль брокера обновлён — действующие входы закрыты'
          : data.isActive === false
            ? 'Брокер деактивирован — доступ в портал закрыт, связи со сделками сохранены'
            : data.isActive === true
              ? 'Брокер снова доступен для подключения к сделкам'
              : 'Брокер обновлён',
    })
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'brokers PATCH', 'Не удалось обновить брокера')
  }
}
