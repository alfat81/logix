import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import {
  ConvertLeadSchema,
  RawContactSchema,
  LEAD_STATUS_LABELS,
} from '@/lib/leads'
import { createOrderWithStages, findOrCreateCustomer } from '@/lib/orders'
import { carryDocumentsToOrder } from '@/lib/documents'
import { normalizePhone } from '@/lib/phone'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  logActivity,
  employeeActor,
  ACTIVITY_PUBLIC_FIELDS,
  ACTIVITY_FEED_TAKE,
} from '@/lib/activity'

type Params = { params: Promise<{ id: string }> }

// Д (роадмап 5а): перенос брокеров расчёта в заявку. Идемпотентен —
// существующие связи не дублирует (@unique orderId+brokerId и без
// того поймал бы, но проверка дешевле ретрая). Вызывается из обоих
// путей роута: основного и самозавершения краш-окна (заявка создана,
// статус не дописан) — чтобы краш между созданием заявки и переносом
// не лишал брокеров видимости навсегда.
async function carryBrokersToOrder(
  leadId: string,
  orderId: string
): Promise<number> {
  const leadBrokers = await db.leadBroker.findMany({
    where: { leadId },
    select: { brokerId: true },
  })
  if (leadBrokers.length === 0) return 0

  const existing = await db.orderBroker.findMany({
    where: { orderId },
    select: { brokerId: true },
  })
  const existingIds = new Set(existing.map((b) => b.brokerId))
  // createMany + skipDuplicates — не для SQLite (не поддерживается),
  // поэтому фильтруем сами
  const toCreate = leadBrokers.filter((b) => !existingIds.has(b.brokerId))
  if (toCreate.length === 0) return 0

  await db.orderBroker.createMany({
    data: toCreate.map((b) => ({ orderId, brokerId: b.brokerId })),
  })
  return toCreate.length
}

// ─── POST /api/admin/leads/[id]/convert — конвертация в заявку (В4) ──
//
// Финальный шаг воронки: выбранный вариант расчёта превращается в
// заявку. Правила (очередь В4 + роадмап 8.2):
//   • выбранного варианта НЕТ — 409: конвертировать нечего, заявка
//     без согласованного расчёта — обход воронки;
//   • клиент — из customerId лида, либо find-or-create из rawContact
//     (нормализация телефона — единственный раз, в момент рождения
//     Customer; номер, который не нормализуется — иностранный +86… —
//     сохраняется как есть: потерять контакт клиента хуже, чем хранить
//     ненормализованный);
//   • юрлицо — обязательный осознанный выбор менеджера в теле запроса
//     (договор рождается на пару клиент+юрлицо прозрачно, Б4);
//   • заявка — существующим createOrderWithStages: обязательные этапы
//     и номер «N-M» без изменений; связь Order.leadId ставится прямо
//     при создании — @unique на leadId ловит гонку двойного клика;
//     Ж1: вместе со связью копируются снимки — груз лида (cargoInfo)
//     и выбранный вариант (quoteSnapshot);
//   • затем lead.status=won (терминальный) и backfill customerId;
//   • повторная конвертация — 409; лид в lost — 409 (отказ дал человек,
//     человеку же и возвращать лид в работу PATCH'ем — «статус меняет
//     человек», роадмап 8.1);
//   • краш-окно «заявка создана, статус не дописан» закрывается
//     самозавершением: следующий вызов видит связанную заявку без won
//     и доводит статус до won тем же ответом (201), а не 409-тупиком.
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    // Пустое/битое тело — 400, а не 500 (паттерн В3).
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = ConvertLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { legalEntityId, incoterm, hsCode } = parsed.data

    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    // ── Повторная конвертация / самозавершение ──
    if (lead.order) {
      if (lead.status === 'won') {
        return NextResponse.json(
          { error: `Запрос уже конвертирован в заявку №${lead.order.number}` },
          { status: 409 }
        )
      }
      // Артефакт краш-окна: заявка связана (leadId ставится при создании),
      // статус не дописан. Добиваем статус и отдаём тот же результат —
      // лид не застревает в calculated без пути назад (PATCH won не умеет).
      await db.lead.update({ where: { id }, data: { status: 'won' } })
      // Д: догоняем и перенос брокеров — краш мог случиться и до него
      await carryBrokersToOrder(id, lead.order.id)
      // Е: документы лида переезжают в заявку тем же догоном
      await carryDocumentsToOrder(id, lead.order.id)
      const repaired = await loadLeadCard(id)
      return NextResponse.json(
        {
          order: lead.order,
          lead: repaired,
          customerBorn: false,
          message: `Конвертация завершена — заявка №${lead.order.number}, статус запроса: ${LEAD_STATUS_LABELS.won}`,
        },
        { status: 201 }
      )
    }
    if (lead.status === 'won') {
      // Через API недостижимо (won ставит только этот роут, уже со связью),
      // но защита дешёвая и терминальность won — инвариант.
      return NextResponse.json(
        { error: 'Запрос уже конвертирован в заявку — статус терминальный' },
        { status: 409 }
      )
    }
    if (lead.status === 'lost') {
      return NextResponse.json(
        { error: 'Запрос в отказе — сначала верните его в работу (PATCH status), затем конвертируйте' },
        { status: 409 }
      )
    }

    // ── Выбранный вариант ──
    const selected = lead.options.find((o) => o.isSelected)
    if (!selected) {
      return NextResponse.json(
        { error: 'Выберите вариант расчёта (isSelected) — конвертировать без него нельзя' },
        { status: 409 }
      )
    }

    // ── Юрлицо: проверка ДО побочных эффектов (клиент не рождается зря) ──
    const legalEntity = await db.legalEntity.findUnique({
      where: { id: legalEntityId },
      select: { id: true },
    })
    if (!legalEntity) {
      return NextResponse.json({ error: 'Юрлицо не найдено' }, { status: 404 })
    }

    // ── Клиент: из лида или find-or-create из rawContact ──
    // Под блокировкой строки лида (SELECT … FOR UPDATE): параллельные
    // конвертации одного лида раньше рождали по клиенту каждая — дубли
    // с одним телефоном, и вход в кабинет попадал на дубль без пароля.
    // Второй запрос ждёт первого и берёт уже записанный customerId.
    let rawPhone: string | null = null
    let rawName = ''
    let rawEmail: string | null = null
    if (!lead.customerId) {
      const raw = RawContactSchema.safeParse(lead.rawContact)
      if (!raw.success) {
        return NextResponse.json(
          { error: 'Анкета запроса (rawContact) некорректна — нет контактов для заведения клиента' },
          { status: 400 }
        )
      }
      rawName = raw.data.name
      // Нормализация в момент рождения Customer: 8 900 555-01-02 →
      // +79005550102 (дедупликация со справочником); +86… как есть
      rawPhone = raw.data.phone ? (normalizePhone(raw.data.phone) ?? raw.data.phone.trim()) : null
      rawEmail = raw.data.email ?? null
    }
    const customer = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} FOR UPDATE`
      const locked = await tx.lead.findUnique({ where: { id }, select: { customerId: true } })
      const found = locked?.customerId
        ? await findOrCreateCustomer({ customerId: locked.customerId }, tx)
        : await findOrCreateCustomer({ name: rawName, phone: rawPhone, email: rawEmail }, tx)
      // Backfill customerId ДО создания заявки: повторный заход после
      // сбоя не заведёт дубль клиента
      if (!('error' in found) && locked?.customerId !== found.id) {
        await tx.lead.update({ where: { id }, data: { customerId: found.id } })
      }
      return found
    })
    if ('error' in customer) {
      return NextResponse.json({ error: customer.error }, { status: customer.status })
    }

    // ── Заявка: существующий конвейер Б4 + связь с рождения записи ──
    // Ж1: суть сделки копируется СНИМКАМИ — груз лида (cargoInfo как
    // есть: форма бланка уже в нужных ключах) и выбранный вариант
    // (quoteSnapshot: описание, виды транспорта, цена, срок, ориентир).
    // Дальше заявка — источник правды: правки лида её не меняют.
    const quoteSnapshot: Prisma.InputJsonObject = {
      description: selected.description,
      // P1-04: цена с валютой и меткой НДС (cost в снимок не попадает —
      // наружу себестоимость не выходит, RULES 2.15). Decimal → число
      // для JSON-снимка: только транспорт, без арифметики.
      price: selected.price.toNumber(),
      currency: selected.currency,
      vatMode: selected.vatMode,
      etaDays: selected.etaDays,
      priorityFit: selected.priorityFit,
      ...(Array.isArray(selected.transportModes)
        ? { transportModes: selected.transportModes.filter((m) => typeof m === 'string') }
        : {}),
    }
    const result = await createOrderWithStages({
      customerId: customer.id,
      legalEntityId,
      incoterm: incoterm || null,
      hsCode: hsCode || null,
      leadId: lead.id,
      // P1-01: ответственный переносится с лида (конвертировал тот же,
      // кто вёл расчёт). У лида без ответственного (запрос из кабинета,
      // И1) заявку ведет тот, кто её создал конвертацией.
      assignedToId: lead.assignedToId ?? auth.employee.id,
      // JsonValue из базы шире InputJsonValue — тот же явный каст на
      // границе, что в POST лида (В2). null = анкета не заполнялась,
      // копировать нечего.
      cargoInfo: (lead.cargoInfo as Prisma.InputJsonObject | null) ?? undefined,
      // P1-03: маршрут/метрики — снимок колонок лида в колонки заявки
      route: {
        originCity: lead.originCity,
        originCountry: lead.originCountry,
        destinationCity: lead.destinationCity,
        destinationCountry: lead.destinationCountry,
        transportType: lead.transportType,
        readyDate: lead.readyDate,
        weightKg: lead.weightKg,
        volumeM3: lead.volumeM3,
        placesCount: lead.placesCount,
      },
      quoteSnapshot,
    })
    if ('error' in result) {
      // Гонка двойного клика: параллельный запрос успел создать заявку
      // (leadId @unique → P2002 → retry-петля → ошибка). Перепроверяем
      // связь: заявка уже есть — честный 409 вместо 500.
      const fresh = await db.lead.findUnique({
        where: { id },
        select: { order: { select: { id: true, number: true } } },
      })
      if (fresh?.order) {
        return NextResponse.json(
          { error: `Запрос уже конвертирован в заявку №${fresh.order.number}` },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // ── Финал: won. Отдельным быстрым апдейтом (не в общей транзакции
    // с заказом — внутри retry-петли P2002 ловится и откатывается на
    // Postgres некорректно); краш-окно закрывает самозавершение выше. ──
    await db.lead.update({ where: { id }, data: { status: 'won' } })

    // Д: брокеры расчёта переезжают в заявку — видимость не обнуляется
    // и не сужается при переходе из расчёта в исполнение (роадмап 5а:
    // «при win переносится автоматически, не заводится заново»)
    const carriedBrokers = await carryBrokersToOrder(id, result.id)

    // Е: документы лида (предварительный инвойс для расчёта и прочее)
    // переезжают в заявку вместе со сделкой (роадмап 5) — обмен
    // продолжается там, где начался, без перезагрузки файлов
    const carriedDocs = await carryDocumentsToOrder(id, result.id)

    // Ж2: журнал — конвертация пишет в ОБЕ ленты: событие лида
    // («воронка завершена») и рождение заявки («откуда взялась»).
    // Ссылка на номер в обе стороны — менеджер идёт по истории без
    // догадок, с какой стороны ни зашёл бы.
    await logActivity(
      { leadId: id },
      employeeActor(auth.employee),
      'lead_converted',
      `Сконвертирован в заявку №${result.number}` +
        (carriedBrokers > 0 ? ` — брокеры перенесены: ${carriedBrokers}` : '') +
        (carriedDocs > 0 ? `, документы перенесены: ${carriedDocs}` : ''),
    )
    await logActivity(
      { orderId: result.id },
      employeeActor(auth.employee),
      'order_created',
      `Заявка №${result.number} создана конвертацией из запроса — груз и условия скопированы снимком` +
        (carriedBrokers > 0 ? `, брокеры видимости: ${carriedBrokers}` : '') +
        (carriedDocs > 0 ? `, документы: ${carriedDocs}` : ''),
    )

    const updatedLead = await loadLeadCard(id)
    return NextResponse.json(
      {
        order: { id: result.id, number: result.number },
        lead: updatedLead,
        customerBorn: customer.created,
        message: `Заявка №${result.number} создана — статус запроса: ${LEAD_STATUS_LABELS.won}`,
      },
      { status: 201 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'lead convert', 'Не удалось конвертировать запрос в заявку')
  }
}

// Свежая карточка лида для ответа (В5 не нужен повторный GET).
// Ж2: включает ленту событий — ответ конвертации обновляет состояние
// LeadCard целиком, без ленты карточка «теряла» бы её до перезагрузки.
// Д: брокеры с оценками — карточка лида показывает их и после won.
async function loadLeadCard(id: string) {
  return db.lead.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      assignee: { select: { id: true, name: true } },
      options: { orderBy: { createdAt: 'asc' } },
      order: { select: { id: true, number: true, status: true } },
      brokers: {
        orderBy: { createdAt: 'asc' },
        include: {
          broker: { select: { id: true, companyName: true, phone: true, isActive: true, isInHouse: true } },
          estimate: true,
        },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: ACTIVITY_FEED_TAKE,
        select: ACTIVITY_PUBLIC_FIELDS,
      },
    },
  })
}
