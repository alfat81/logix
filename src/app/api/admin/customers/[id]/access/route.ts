import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { apiErrorResponse } from '@/lib/api-errors'
import { CLIENT_PASSWORD_MAX } from '@/lib/client-constants'
import {
  CompanyUserError,
  createCustomerUser,
  updateCustomerUser,
  setCustomerUserActive,
} from '@/lib/company-users'

type Params = { params: Promise<{ id: string }> }

// ─── Доступ в кабинет клиента (И1) — СПИСОК ЛЮДЕЙ (DF-02A Блок 5) ────
// Диалог доступа («один пароль на компанию») превращается в список
// пользователей компании: создать, править, деактивировать. Управление
// — через общую точку lib/company-users.ts (правила И1 сужены до
// человека: пароль хешируется в lib, «пароль есть → телефон +7 есть»,
// деактивация рвёт сессии ТОЛЬКО этого пользователя, primary
// деактивации не подлежит — доступ компании целиком закрывается
// деактивацией компании в справочнике).
//
// Зеркало переходного периода (до contract-релиза 0.6.3, DEPRECATIONS):
// при изменении пароля ОСНОВНОГО пользователя хеш дублируется в старое
// поле Customer.password (страховка отката на v0.6.1). Пароли остальных
// пользователей и их телефоны в старое поле НЕ пишутся: в v0.6.1 этих
// людей не существовало, а перетирать логин/контакт компании чужим
// человеком нельзя. Смена пароля primary рвёт сессии этого человека
// (lib), коллег не задевает.
//
// Аудит Ж2 не пишется: у управления доступом нет цели (решение Ж6в).

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

// GET — список людей компании: id, контакты, статусы. Хеш пароля
// наружу не отдаётся никогда — только булев hasPassword.
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const customer = await db.customer.findUnique({ where: { id }, select: { id: true } })
    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })
    }
    const users = await db.customerUser.findMany({
      where: { customerId: id },
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
    return apiErrorResponse(e, 'customer access GET', 'Не удалось загрузить список сотрудников')
  }
}

// POST — создать человека. Первый пользователь компании становится
// основным (isPrimary) — к нему переходит зеркало пароля; остальные —
// обычные (пароль не трогает Customer.password).
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

    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 })
    }

    const created = await db.$transaction(async (tx) => {
      const isFirst = (await tx.customerUser.count({ where: { customerId: id } })) === 0
      const user = await createCustomerUser(tx, id, {
        ...parsed.data,
        isPrimary: isFirst,
      })
      // Зеркало Customer.password удалено contract-миграцией df_03_contract
      // (DEPRECATIONS 0.6.5): пароль живёт только у пользователя.
      return user
    })
    return NextResponse.json({ ok: true, userId: created.id }, { status: 201 })
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'customer access POST', 'Не удалось создать сотрудника')
  }
}

// PATCH — правка человека (контакты, пароль, «снять пароль» = null)
// и деактивация/возврат (isActive). Пароль меняется через
// updateCustomerUser (рвёт сессии пользователя); primary — с зеркалом
// в Customer.password.
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

    const user = await db.customerUser.findFirst({ where: { id: userId, customerId: id } })
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }

    await db.$transaction(async (tx) => {
      const { isActive, ...fields } = changes
      if (fields.name !== undefined || fields.phone !== undefined || fields.email !== undefined || fields.password !== undefined) {
        await updateCustomerUser(tx, userId, fields)
      }
      if (isActive !== undefined) {
        await setCustomerUserActive(tx, userId, isActive)
      }
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof CompanyUserError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'customer access PATCH', 'Не удалось изменить пользователя')
  }
}
