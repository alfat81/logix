import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { DOCUMENT_KINDS } from '@/lib/document-constants'
import { LOGICAL_DOC_TYPES } from '@/lib/document-phases'
import { loadRequirementRows, recomputeActiveOrdersForStage } from '@/lib/stage-doc-requirements-server'

// DF-26 §4.3.4: требование чек-листа — вид ИЛИ логический тип
// («Транспортная накладная (любой вариант)» — селект справочника).
const REQUIREMENT_KINDS = [...DOCUMENT_KINDS, ...Object.keys(LOGICAL_DOC_TYPES)] as const

// ─── GET /api/admin/stage-catalog/requirements — чек-листы этапов ──
// DF-14: список требований (stageCode + вид + кто предоставляет +
// блокировка) со stage name живым lookup'ом. Опциональный ?stageCode —
// срез по этапу (диалог в справочнике этапов). Чтение — любому
// сотруднику (список нужен и менеджеру), правки — только мастер.
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  try {
    const stageCode = req.nextUrl.searchParams.get('stageCode') ?? undefined
    const requirements = await loadRequirementRows(stageCode || undefined)
    return NextResponse.json({ requirements })
  } catch (e) {
    return apiErrorResponse(e, 'requirements GET', 'Не удалось загрузить чек-листы')
  }
}

// ─── POST /api/admin/stage-catalog/requirements — новое требование ──
// Управление чек-листами — ТОЛЬКО мастер (карточка DF-14: «управление —
// в справочнике этапов (только master)»; тот же гард, что у флага
// обязательности каталога — менеджер не может создать требование и
// тем самым обойти запрет правки).
// no-event: цель — строка справочника этапов, не сделка (как POST
// каталога); влияние на сделки пересчитывается напрямую —
// recomputeActiveOrdersForStage обновляет мячи активных заявок этапа.
const CreateRequirementSchema = z.object({
  stageCode: z.string().trim().min(1).max(64),
  kind: z.enum(REQUIREMENT_KINDS),
  providedBy: z.enum(['client', 'broker', 'staff']),
  isBlocking: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { roles: ['master'], write: true })
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const parsed = CreateRequirementSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { stageCode, kind, providedBy, isBlocking = false } = parsed.data

    // Этап обязан существовать в каталоге: ссылка по code — живой
    // lookup, опечатка кода сделала бы требование навсегда мёртвым.
    const stage = await db.orderStageCatalog.findUnique({
      where: { code: stageCode },
      select: { code: true },
    })
    if (!stage) {
      return NextResponse.json({ error: 'Этап не найден в каталоге' }, { status: 400 })
    }

    const duplicate = await db.stageDocumentRequirement.findUnique({
      where: { stageCode_kind: { stageCode, kind } },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json(
        { error: 'Требование для этой пары этап+вид уже существует' },
        { status: 409 }
      )
    }

    const requirement = await db.stageDocumentRequirement.create({
      data: { stageCode, kind, providedBy, isBlocking },
    })

    // Правка чек-листа меняет правило 8 на всех активных заявках этапа.
    await recomputeActiveOrdersForStage(stageCode)

    return NextResponse.json({ requirement }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'requirements POST', 'Не удалось создать требование')
  }
}
