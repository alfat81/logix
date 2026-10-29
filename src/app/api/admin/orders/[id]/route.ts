import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { allowedOrderTransitionsLabeled } from '@/lib/status-machine'
import { type OrderStatus } from '@/lib/order-constants'
import {
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'
import { projectActors, STAFF_READER } from '@/lib/actor-name'
import { patchOrder } from './patch'

type Params = { params: Promise<{ id: string }> }

// v0.5.0 (P1-22): PATCH — выезд в соседний patch.ts (резка под лимит
// 300, RULES 2.14); здесь GET-карточка и тонкая обёртка PATCH.

// ─── GET /api/admin/orders/[id] — карточка заявки ─────────────
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: true,
      assignee: { select: { id: true, name: true } },
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
              // DF-18: оценки с лида-источника, со строками кодов
              estimate: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
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
      // DF-01: фильтр аудитории — только через eventWhereFor (§1.3);
      // для staff это пустой фрагмент.
      activities: {
        where: eventWhereFor('staff'),
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
      // DF-02A (Блок 4): актёр-человек собирается при чтении —
      // «Имя (Компания)» (устаревшие строки — компания, как было).
      activities: await projectActors(order.activities, STAFF_READER),
      stages: order.stages.map((s) => ({
        ...s,
        isMandatory: mandatoryByCode.get(s.stageCode) ?? false,
        name: nameByCode.get(s.stageCode) ?? s.stageCode,
      })),
      // P1-05: UI показывает только допустимые переходы — подписи
      // рядом с кодами, чтобы кнопки рендерились без словаря.
      allowedTransitions: allowedOrderTransitionsLabeled(order.status as OrderStatus),
    },
  })
}

// ─── PATCH /api/admin/orders/[id] — статус и поля (patch.ts) ──────
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  return patchOrder(req, id, auth)
}
