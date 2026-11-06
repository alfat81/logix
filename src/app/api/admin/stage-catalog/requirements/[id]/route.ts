import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { loadRequirementRows, recomputeActiveOrdersForStage } from '@/lib/stage-doc-requirements-server'

// ─── PATCH/DELETE /api/admin/stage-catalog/requirements/[id] ───
// no-event: цель — строка справочника этапов, не сделка; влияние на
// сделки пересчитывается напрямую (recomputeActiveOrdersForStage).
// DF-14: правка и удаление требования чек-листа. ТОЛЬКО мастер
// (карточка DF-14: управление — в справочнике этапов, только master;
// e2e проверяет 403 менеджеру). stageCode/kind неизменяемы — пара
// этап+вид это ключ чек-листа; поменять вид = удалить и создать заново
// (диалог UI так и подсказывает). Пересчёт «у кого мяч» — после
// мутации, по всем активным заявкам этапа.

const PatchRequirementSchema = z
  .object({
    providedBy: z.enum(['client', 'broker', 'staff']).optional(),
    isBlocking: z.boolean().optional(),
  })
  .refine((v) => v.providedBy !== undefined || v.isBlocking !== undefined, {
    message: 'Нечего менять: передайте providedBy или isBlocking',
  })

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchRequirementSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const existing = await db.stageDocumentRequirement.findUnique({
      where: { id },
      select: { id: true, stageCode: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Требование не найдено' }, { status: 404 })
    }

    const requirement = await db.stageDocumentRequirement.update({
      where: { id },
      data: parsed.data,
    })

    await recomputeActiveOrdersForStage(existing.stageCode)

    return NextResponse.json({ requirement })
  } catch (e) {
    return apiErrorResponse(e, 'requirements PATCH', 'Не удалось обновить требование')
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const existing = await db.stageDocumentRequirement.findUnique({
      where: { id },
      select: { stageCode: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Требование не найдено' }, { status: 404 })
    }

    await db.stageDocumentRequirement.delete({ where: { id } })

    await recomputeActiveOrdersForStage(existing.stageCode)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e, 'requirements DELETE', 'Не удалось удалить требование')
  }
}

// Строки-проекции для UI — общий загрузчик (тот же вид, что в GET списка).
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    const existing = await db.stageDocumentRequirement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Требование не найдено' }, { status: 404 })
    }
    const rows = await loadRequirementRows(existing.stageCode)
    const requirement = rows.find((r) => r.id === id) ?? null
    return NextResponse.json({ requirement })
  } catch (e) {
    return apiErrorResponse(e, 'requirements GET [id]', 'Не удалось загрузить требование')
  }
}
