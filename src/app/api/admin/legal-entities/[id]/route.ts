import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── PATCH /api/admin/legal-entities/[id] — правка юрлица (Ж6б) ──
// Три независимых поля, каждое опционально, но хотя бы одно обязано
// прийти (пустой PATCH — ошибка запроса, а не молчаливый no-op):
//   name        — короткое название (как в договорах и заявках);
//   requisites  — ПОЛНАЯ замена реквизитов (паттерн PATCH Ж1: клиент
//                 шлёт форму целиком, отсутствие поля = «не меняю»,
//                 а пустой объект = «очистить всё»);
//   isActive    — деактивация/возврат: неактивное скрывается из
//                 легаси-справочника создания заявки, но остаётся в
//                 существующих договорах и заявках (история не
//                 переписывается). Удаления юрлиц нет вовсе — на них
//                 висят договоры.
const RequisitesSchema = z.record(
  z.union([z.string().trim().max(500), z.number(), z.boolean(), z.null()])
)

const PatchLegalEntitySchema = z
  .object({
    name: z.string().trim().min(1, 'Укажите название юрлица').max(300).optional(),
    requisites: RequisitesSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.requisites !== undefined || v.isActive !== undefined, {
    message: 'Нечего менять: передайте name, requisites или isActive',
  })

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  // P1-09 / DF-00: правка юрлиц — только мастер
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchLegalEntitySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const existing = await db.legalEntity.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      return NextResponse.json({ error: 'Юрлицо не найдено' }, { status: 404 })
    }

    const { name, requisites, isActive } = parsed.data
    const legalEntity = await db.legalEntity.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(requisites !== undefined ? { requisites } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: { _count: { select: { orders: true, contracts: true } } },
    })

    return NextResponse.json({
      legalEntity: {
        id: legalEntity.id,
        name: legalEntity.name,
        requisites: legalEntity.requisites,
        isActive: legalEntity.isActive,
        createdAt: legalEntity.createdAt,
        ordersCount: legalEntity._count.orders,
        contractsCount: legalEntity._count.contracts,
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'legal-entities PATCH', 'Не удалось сохранить юрлицо')
  }
}
