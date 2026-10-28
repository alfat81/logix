import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { apiErrorResponse } from '@/lib/api-errors'
import { CLIENT_PASSWORD_MAX } from '@/lib/client-constants'
import {
  CompanyUserError,
  createBrokerUser,
  updateBrokerUser,
  setBrokerUserActive,
} from '@/lib/company-users'

type Params = { params: Promise<{ id: string }> }

// ─── Сотрудники брокера (DF-02A Блок 5) ──────────────────────────────
// Зеркало клиентского access-роута для брокерского справочника: список
// людей (GET), создать (POST), править/деактивировать (PATCH). У
// брокера люди жили только в справочнике (вход = телефон компании) —
// DF-02A переносит вход на BrokerUser; справочник-компания продолжает
// синхронизироваться с основным пользователем через PATCH
// /api/admin/brokers/[id] (Блок 3).
//
// Зеркало переходного периода: пароль ОСНОВНОГО пользователя
// дублируется в Broker.password (страховка отката на v0.6.1).
// Телефон основного в Broker.phone НЕ перетирается: телефон компании
// — контакт справочника, логин живёт у человека (осознанное решение,
// RELEASE-NOTES Блока 5). Деактивация рвёт сессии ТОЛЬКО этого
// пользователя; primary деактивации не подлежит (409 из lib).
//
// Аудит Ж2 не пишется: у справочника нет цели (Ж6в).
// no-event: справочник людей — цели «сделка» не имеет (как сотрудники/подрядчики)

const UserFieldsSchema = {
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  password: z.string().max(CLIENT_PASSWORD_MAX).nullable().optional(),
}

const CreateUserSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя пользователя').max(100),
  ...UserFieldsSchema,
})

const UpdateUserSchema = z
  .object({
    userId: z.string().min(1),
    name: z.string().trim().min(1, 'Укажите имя пользователя').max(100).optional(),
    isActive: z.boolean().optional(),
    ...UserFieldsSchema,
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.phone !== undefined ||
      v.email !== undefined ||
      v.password !== undefined ||
      v.isActive !== undefined,
    { message: 'Нечего обновлять' }
  )

// GET — список людей брокерской компании.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const broker = await db.broker.findUnique({ where: { id }, select: { id: true } })
    if (!broker) {
      return NextResponse.json({ error: 'Брокер не найден' }, { status: 404 })
    }
    const users = await db.brokerUser.findMany({
      where: { brokerId: id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        isPrimary: true,
        password: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })
    return NextResponse.json({
      users: users.map(({ password, ...u }) => ({ ...u, hasPassword: password !== null })),
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker users GET', 'Не удалось загрузить список сотрудников')
  }
}

// POST — создать человека. У брокера основной пользователь есть всегда
// (создание справочника и миграция заводят его с самого начала) —
// страховка isFirst оставлена на случай ручных операций в БД.
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
    const parsed = CreateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const broker = await db.broker.findUnique({ where: { id } })
    if (!broker) {
      return NextResponse.json({ error: 'Брокер не найден' }, { status: 404 })
    }

    const created = await db.$transaction(async (tx) => {
      const isFirst = (await tx.brokerUser.count({ where: { brokerId: id } })) === 0
      const user = await createBrokerUser(tx, id, {
        ...parsed.data,
        isPrimary: isFirst,
      })
      if (isFirst && parsed.data.password) {
        await tx.broker.update({
          where: { id },
          data: { password: hashPassword(parsed.data.password) },
        })
      }
      return user
    })
    return NextResponse.json({ ok: true, userId: created.id }, { status: 201 })
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'broker users POST', 'Не удалось создать сотрудника')
  }
}

// PATCH — правка/деактивация; пароль primary — с зеркалом в
// Broker.password.
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
    const parsed = UpdateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    const { userId, ...changes } = data

    const user = await db.brokerUser.findFirst({ where: { id: userId, brokerId: id } })
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }

    await db.$transaction(async (tx) => {
      const { isActive, ...fields } = changes
      if (fields.name !== undefined || fields.phone !== undefined || fields.email !== undefined || fields.password !== undefined) {
        await updateBrokerUser(tx, userId, fields)
      }
      if (isActive !== undefined) {
        await setBrokerUserActive(tx, userId, isActive)
      }
      if (user.isPrimary && fields.password !== undefined) {
        await tx.broker.update({
          where: { id },
          data: {
            // Broker.password непустой (схема): «снятый» пароль — пустая
            // строка, verifyPassword в v0.6.1 её не примет (префикс
            // scrypt обязателен с DF-00) — отката-семантика та же.
            password:
              fields.password === null
                ? ''
                : hashPassword(fields.password),
          },
        })
      }
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'broker users PATCH', 'Не удалось изменить пользователя')
  }
}
