import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/stage-catalog — справочник этапов ─────────
// Публичный внутри кабинета: и UI списка (пометки «обязательный»),
// и диалог добавления этапа строятся отсюда. Наполняется сидом (Б2);
// с Ж6б справочник управляется и вручную — POST здесь + PATCH в
// [id]/route.ts (порядок, имя, флаг обязательности).
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const catalog = await db.orderStageCatalog.findMany({
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  })
  return NextResponse.json({ catalog })
}

// ─── POST /api/admin/stage-catalog — новый этап (Ж6б) ──────────
// Код этапа — технический идентификатор: по нему заявки ссылаются
// на справочник (OrderStageInstance.stageCode) и по нему же живым
// lookup'ом читается обязательность. Менеджеру код вручную вводить
// не обязательно: пустое поле = автогенерация «stage_» + 8 hex-
// символов. Своё значение — латиница/цифры/подчёркивание (префикс
// существующих: export_pickup, loading, …).
//
// ВАЖНО, про права (очередь, Ж6б): флаг обязательности — только
// мастер. Это относится и к СОЗДАНИЮ этапа сразу обязательным —
// иначе менеджер обошёл бы запрет одним запросом. Менеджер создаёт
// необязательный этап; сделать его обязательным потом сможет мастер
// обычным PATCH'ем флага.
const STAGE_CODE_MAX = 64
const STAGE_NAME_MAX = 200

const stageCodeRegex = /^[a-z][a-z0-9_]{1,63}$/

const CreateStageSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название этапа').max(STAGE_NAME_MAX),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .max(STAGE_CODE_MAX)
    .optional()
    .or(z.literal('')),
  isMandatory: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  // P1-09 / DF-00: управление каталогом этапов — только мастер
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const parsed = CreateStageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { name, isMandatory = false } = parsed.data

    let code = parsed.data.code ?? ''
    if (code === '') {
      code = `stage_${randomBytes(4).toString('hex')}`
    } else if (!stageCodeRegex.test(code)) {
      return NextResponse.json(
        {
          error:
            'Код этапа: латинские буквы, цифры и подчёркивание, начинается с буквы (например, warehouse_storage)',
        },
        { status: 400 }
      )
    }

    const duplicate = await db.orderStageCatalog.findUnique({ where: { code }, select: { name: true } })
    if (duplicate) {
      return NextResponse.json(
        { error: `Код «${code}» уже занят этапом «${duplicate.name}»` },
        { status: 409 }
      )
    }

    // Новый этап — в конец списка (max+1): порядок задаётся для
    // подстановки в новые заявки, соседние записи не пересортируются.
    const last = await db.orderStageCatalog.findFirst({
      orderBy: { order: 'desc' },
      select: { order: true },
    })

    const stage = await db.orderStageCatalog.create({
      data: { code, name, order: (last?.order ?? 0) + 1, isMandatory },
    })
    return NextResponse.json({ stage }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'stage-catalog POST', 'Не удалось создать этап')
  }
}
