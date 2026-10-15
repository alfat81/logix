import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import {
  ORDER_STATUSES,
  CARGO_PROFILES,
  ORDER_STATUS_LABELS,
  CARGO_PROFILE_LABELS,
  type OrderStatus,
  type CargoProfile,
} from '@/lib/order-constants'
import { CargoInfoSchema, QuoteSnapshotSchema } from '@/lib/leads'
import {
  logActivity,
  employeeActor,
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
  type ActivityType,
} from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/admin/orders/[id] — карточка заявки ─────────────
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      contract: { include: { legalEntity: { select: { id: true, name: true } } } },
      legalEntity: { select: { id: true, name: true } },
      // Ж1: лид-источник — карточка заявки ведёт к истории запроса
      // (снимки груза и условий скопированы при конвертации, но ссылка
      // на воронку нужна менеджеру). createdAt — для подписи «от …».
      // Д: вместе с лидом приезжают его брокеры с оценками — оценка
      // таможенных платежей живёт на связи LeadBroker и переживает
      // конвертацию (роадмап 5а), показываем её в контексте заявки.
      lead: {
        select: {
          id: true,
          createdAt: true,
          brokers: {
            orderBy: { createdAt: 'asc' },
            include: {
              broker: { select: { id: true, companyName: true, isActive: true } },
              estimate: true,
            },
          },
        },
      },
      // Д: брокеры заявки — видимость сделки целиком (перенос с лида
      // при конвертации В4 + прямые подключения менеджера)
      brokers: {
        orderBy: { createdAt: 'asc' },
        include: {
          broker: { select: { id: true, companyName: true, phone: true, isActive: true, isInHouse: true } },
        },
      },
      // Ж2: лента событий — последние ACTIVITY_FEED_TAKE записей,
      // свежие сверху (лента карточки — окно, не архив; проекция без
      // actorId — имени-снимка ленте достаточно).
      activities: {
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_FEED_TAKE,
        select: ACTIVITY_PUBLIC_FIELDS,
      },
      stages: {
        orderBy: { sequence: 'asc' },
        // Исполнитель этапа внутри карточки (Г3): назначение живёт на
        // этапе с самой Дорожки Г — UI Г5 рендерит «кто исполняет» без
        // добора отдельным запросом. Проекция без password (пароль ЛК
        // подрядчика менеджеру не нужен и не возвращается).
        include: {
          contractor: { select: { id: true, companyName: true, phone: true, isActive: true } },
        },
      },
    },
  })
  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }

  // isMandatory берём из каталога живым lookup'ом (роадмап, раздел 9) —
  // правило защиты следует за актуальным справочником, а не снимком.
  const catalog = await db.orderStageCatalog.findMany()
  const mandatoryByCode = new Map(catalog.map((c) => [c.code, c.isMandatory]))
  const nameByCode = new Map(catalog.map((c) => [c.code, c.name]))

  return NextResponse.json({
    order: {
      ...order,
      stages: order.stages.map((s) => ({
        ...s,
        isMandatory: mandatoryByCode.get(s.stageCode) ?? false,
        name: nameByCode.get(s.stageCode) ?? s.stageCode,
      })),
    },
  })
}

// ─── PATCH /api/admin/orders/[id] — ручная смена статуса и полей ──
// Статус заявки переводит менеджер осознанно (роадмап 8.1), переходы
// не ограничены матрицей — MVP сознательно без автоматики.
// Ж1: cargoInfo и quoteSnapshot — суть заявки (груз и условия сделки).
// Семантика — ПОЛНАЯ ЗАМЕНА: UI присылает форму целиком (предзаполненную
// текущими значениями), null = очистить поле. Заявки без лида (Б3)
// заполняются вручную здесь же; у конвертированных снимок с лида
// при необходимости правится тоже — правки лида на заявку всё равно
// не действуют (источник правды — заявка).
const PatchOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  incoterm: z.string().trim().max(10).nullable().optional(),
  hsCode: z.string().trim().max(20).nullable().optional(),
  cargoProfile: z.enum(CARGO_PROFILES).optional(),
  // Форма бланка груза — свободный объект (ключи проверяет UI,
  // сервер — толерантен, как и у лида в В2)
  cargoInfo: CargoInfoSchema.nullable().optional(),
  // Условия сделки — снимок варианта расчёта (структура — lib/leads.ts)
  quoteSnapshot: QuoteSnapshotSchema.optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchOrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
    }

    const existing = await db.order.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    const order = await db.order.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status as OrderStatus } : {}),
        ...(data.incoterm !== undefined ? { incoterm: data.incoterm || null } : {}),
        ...(data.hsCode !== undefined ? { hsCode: data.hsCode || null } : {}),
        ...(data.cargoProfile ? { cargoProfile: data.cargoProfile } : {}),
        // Ж1: zod-объекты шире Prisma.InputJsonObject — явный каст на
        // границе (приём POST лида В2). null → Prisma.DbNull: у
        // nullable Json-колонок Prisma различает «JSON null» и
        // «SQL NULL» — семантика PATCH «очистить поле» это второй.
        ...(data.cargoInfo !== undefined
          ? {
              cargoInfo:
                data.cargoInfo === null
                  ? Prisma.DbNull
                  : (data.cargoInfo as unknown as Prisma.InputJsonObject),
            }
          : {}),
        ...(data.quoteSnapshot !== undefined
          ? {
              quoteSnapshot:
                data.quoteSnapshot === null
                  ? Prisma.DbNull
                  : (data.quoteSnapshot as unknown as Prisma.InputJsonObject),
            }
          : {}),
      },
    })

    // Ж2: журнал — по смысловым частям PATCH, отдельная запись на
    // каждую (статус, суть заявки, прочие поля): лента читается как
    // хроника решений, а не «что-то обновили». Прежние значения — из
    // existing (взят до update), новый статус уже применён выше.
    const events: Array<{ type: ActivityType; description: string }> = []
    if (data.status) {
      events.push({
        type: 'order_status_changed',
        description: `Статус заявки: ${ORDER_STATUS_LABELS[existing.status as OrderStatus] ?? existing.status} → ${ORDER_STATUS_LABELS[data.status]}`,
      })
    }
    if (data.cargoInfo !== undefined) {
      events.push({
        type: 'order_cargo_changed',
        description: data.cargoInfo === null ? 'Груз и маршрут сняты' : 'Обновлены груз и маршрут',
      })
    }
    if (data.quoteSnapshot !== undefined) {
      events.push({
        type: 'order_quote_changed',
        description:
          data.quoteSnapshot === null ? 'Условия сделки сняты' : 'Обновлены условия сделки',
      })
    }
    const fields: string[] = []
    if (data.incoterm !== undefined) {
      fields.push(`Инкотермс: ${existing.incoterm ?? '—'} → ${data.incoterm || '—'}`)
    }
    if (data.hsCode !== undefined) {
      fields.push(`ТН ВЭД: ${existing.hsCode ?? '—'} → ${data.hsCode || '—'}`)
    }
    if (data.cargoProfile) {
      fields.push(
        `Профиль груза: ${CARGO_PROFILE_LABELS[existing.cargoProfile as CargoProfile] ?? existing.cargoProfile} → ${CARGO_PROFILE_LABELS[data.cargoProfile]}`,
      )
    }
    if (fields.length > 0) {
      events.push({ type: 'order_fields_changed', description: `Поля заявки: ${fields.join('; ')}` })
    }
    for (const ev of events) {
      await logActivity({ orderId: id }, employeeActor(auth.employee), ev.type, ev.description)
    }

    return NextResponse.json({
      order,
      message: data.status
        ? `Статус заявки: ${ORDER_STATUS_LABELS[data.status]}`
        : 'Заявка обновлена',
    })
  } catch (e) {
    console.error('[orders PATCH] error:', e)
    return NextResponse.json({ error: 'Не удалось обновить заявку' }, { status: 500 })
  }
}
