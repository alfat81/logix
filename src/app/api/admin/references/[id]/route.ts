import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { z } from 'zod'

// PATCH /api/admin/references/[id] — правка записи справочника
// (мастер/менеджер, P1-09): подписи (name/nameEn), включённость
// (isActive), порядок (sortOrder).
//
// КОД НЕ МЕНЯЕТСЯ НИКОГДА (карточка DF-17: «код нельзя менять после
// использования»): попытка прислать code — 400 с объяснением. Отключённая
// запись исчезает из форм и отвергается на новых записях; старые сделки
// живут снимками (текстовые колонки не переписываются задним числом).
//
// no-event: цель — строка справочника, не сделка.
const UpdateRefSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(120).optional(),
  nameEn: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  code: z.unknown().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    const body = (await req.json()) as Record<string, unknown>
    if ('code' in body && body.code !== undefined) {
      return NextResponse.json(
        { error: 'Код записи менять нельзя — на него уже ссылаются сделки' },
        { status: 400 }
      )
    }
    const parsed = UpdateRefSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Некорректное тело' }, { status: 400 })
    }
    const data = parsed.data
    // nameEn: undefined = не трогать, null = очистить (паттерн PATCH).
    const item = await db.refItem.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.nameEn !== undefined ? { nameEn: data.nameEn || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    })
    return NextResponse.json({ item })
  } catch (e) {
    return apiErrorResponse(e, 'references PATCH', 'Не удалось сохранить запись')
  }
}
