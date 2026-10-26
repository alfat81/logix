import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── PATCH /api/admin/stage-catalog/[id] — управление этапом (Ж6б) ──
// Три независимые операции, каждая опциональна (но хотя бы одна
// обязана прийти — пустой PATCH это ошибка, а не no-op):
//
//   move: 'up' | 'down'  — перестановка обменом order с соседним
//                          этапом. Прямое присвоение order не даём
//                          вовсе: обмен соседями — единственный способ,
//                          при котором порядок остальных записей не
//                          трогается и дублей order не появляется.
//                          На краю списка — 400 с понятной ошибкой
//                          (UI там же дизейблит кнопку).
//   name                  — правка названия. Имя этапа читается
//                          заявками ЖИВЫМ lookup'ом (не снимком), так
//                          что правка отражается во всех существующих
//                          заявках сразу — это фича, а не побочка.
//   isMandatory           — только мастер (очередь, Ж6б). Флаг влияет
//                          на ЗАЩИТУ уже созданных заявок немедленно:
//                          «обязательное нельзя удалить» сверяется с
//                          текущим значением справочника при каждом
//                          запросе на удаление. UI предупреждает об
//                          этом до отправки; ретроактивной подстановки
//                          в существующие заявки НЕ происходит — этап
//                          добавляется только в новые.
const STAGE_NAME_MAX = 200

const PatchStageSchema = z
  .object({
    move: z.enum(['up', 'down']).optional(),
    name: z.string().trim().min(1, 'Укажите название этапа').max(STAGE_NAME_MAX).optional(),
    isMandatory: z.boolean().optional(),
  })
  .refine((v) => v.move !== undefined || v.name !== undefined || v.isMandatory !== undefined, {
    message: 'Нечего менять: передайте move, name или isMandatory',
  })

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  // P1-09 / DF-00: управление каталогом этапов — только мастер
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { move, name, isMandatory } = parsed.data

    const stage = await db.orderStageCatalog.findUnique({ where: { id } })
    if (!stage) {
      return NextResponse.json({ error: 'Этап не найден в каталоге' }, { status: 404 })
    }

    // ── Перестановка: обмен order с соседним этапом ─────────────
    if (move !== undefined) {
      const neighbor = await db.orderStageCatalog.findFirst({
        where:
          move === 'up'
            ? { order: { lt: stage.order } }
            : { order: { gt: stage.order } },
        orderBy: move === 'up' ? { order: 'desc' } : { order: 'asc' },
        select: { id: true, order: true },
      })
      if (!neighbor) {
        return NextResponse.json(
          { error: move === 'up' ? 'Этап уже первый в списке' : 'Этап уже последний в списке' },
          { status: 400 }
        )
      }
      // Обмен в транзакции: посреди операции не должно остаться двух
      // записей с одинаковым порядком для других читателей.
      await db.$transaction([
        db.orderStageCatalog.update({ where: { id: stage.id }, data: { order: neighbor.order } }),
        db.orderStageCatalog.update({ where: { id: neighbor.id }, data: { order: stage.order } }),
      ])
    }

    // ── Правка имени и/или флага (move комбинировать с ними можно —
    // обмен уже совершён выше, остальные поля обновляются тем же
    // запросом; имя меняем только когда передано).
    const updated = await db.orderStageCatalog.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(isMandatory !== undefined ? { isMandatory } : {}),
      },
    })

    return NextResponse.json({ stage: updated })
  } catch (e) {
    return apiErrorResponse(e, 'stage-catalog PATCH', 'Не удалось сохранить этап')
  }
}

// ─── DELETE /api/admin/stage-catalog/[id] — удалить этап (DF-00 / P1-09) ──
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const stage = await db.orderStageCatalog.findUnique({ where: { id } })
    if (!stage) return NextResponse.json({ error: 'Этап не найден в каталоге' }, { status: 404 })
    if (stage.isMandatory) {
      return NextResponse.json(
        { error: 'Обязательный этап нельзя удалить из каталога' },
        { status: 400 }
      )
    }
    await db.orderStageCatalog.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'Этап удалён из каталога' })
  } catch (e) {
    return apiErrorResponse(e, 'stage-catalog DELETE', 'Не удалось удалить этап')
  }
}

