import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { brokerActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { BrokerEstimateFullSchema, diffEstimateItems, readPermits } from '@/lib/brokers'
import { getSetting } from '@/lib/settings'
import { formatMoney } from '@/lib/money'

type Params = { params: Promise<{ id: string }> }

// ─── PUT /api/broker/leads/[id]/estimate — ответ брокера (Д, 5а, DF-18) ─
// Обязанность брокера с этапа расчёта: (а) ожидаемый размер таможенных
// платежей, (б) список разрешительных документов и (в) DF-18: строки
// «код ТН ВЭД · пошлина % · доп. пошлина % · НДС %» (D38 — форма
// короткая, без полей Альты и ничего похожего на заполнение ДТ).
// Единственный write портала брокера — и только по СВОЕЙ связи с лидом
// (оценка чужой сделки невозможна, 404). Полная замена (семантика PATCH
// заявки Ж1): не переданные поля обнуляются, пустая вся форма = снять.
//
// Статус ответа (DF-18): draft → sent кнопкой «Отправить ответ»
// (send: true). События:
//  • черновик/правка до отправки — broker_estimate_changed (как раньше);
//  • первая отправка — broker_estimate_sent (ответственный получает
//    уведомление, аудитория staff — клиенту проценты не показываются);
//  • правка ПОСЛЕ отправки — estimate_updated с разницей строк.
// sentAt — момент ПЕРВОЙ отправки, правками не перезаписывается.
//
// Доступна и ПОСЛЕ конвертации (won-лид): платежи уточняются после
// классификации товара уже в исполнении — брокер правит свою оценку с
// карточки заявки (портал знает leadId заявки), менеджер видит свежие
// цифры. Деактивированный брокер сюда не дойдёт — requireBroker.
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireBroker(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 })
    }
    const parsed = BrokerEstimateFullSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data
    const items = data.items ?? []

    // Живой лимит строк — настройка broker.max_items (DF-18, дефолт 30);
    // жёсткий потолок схемы уже отсёк мусор, здесь — бизнес-лимит.
    const maxItems = await getSetting('broker.max_items')
    if (items.length > maxItems) {
      return NextResponse.json(
        { error: `Строк в ответе — не больше ${maxItems} (настройка «broker.max_items»)` },
        { status: 400 }
      )
    }

    // Дубли кода недопустимы: строка = один код (иначе diff и DF-19
    // считали бы код дважды).
    const seen = new Set<string>()
    for (const item of items) {
      if (seen.has(item.hsCode)) {
        return NextResponse.json(
          { error: `Код ТН ВЭД ${item.hsCode} указан в двух строках — оставьте одну` },
          { status: 400 }
        )
      }
      seen.add(item.hsCode)
    }

    const link = await db.leadBroker.findUnique({
      where: { leadId_brokerId: { leadId: id, brokerId: auth.broker.id } },
      include: { estimate: { include: { items: { orderBy: { sortOrder: 'asc' } } } } },
    })
    if (!link) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    // DF-18: пометку isManualCode верифицирует сервер по справочнику
    // DF-17C (действующие редакции, validTo IS NULL) — клиентскую не
    // верим. Один запрос на весь список; код не найден → «вручную».
    const found = items.length
      ? await db.hsCode.findMany({
          where: { code: { in: items.map((i) => i.hsCode) }, validTo: null },
          select: { code: true },
        })
      : []
    const knownCodes = new Set(found.map((f) => f.code))

    // Статус: send=true → sent; правка уже отправленного остаётся sent
    // (снимок ответа не «раскрывается» обратно в черновик).
    const wasSent = link.estimate?.status === 'sent'
    const nextStatus = data.send || wasSent ? 'sent' : 'draft'

    const estimateData = {
      customsDutyEstimate: data.customsDutyEstimate ?? null,
      // Полная замена: не передан/пусто → SQL NULL (Prisma.DbNull —
      // у nullable Json-колонок «очистить» это именно SQL NULL, Ж1)
      requiredPermits:
        data.requiredPermits !== undefined && data.requiredPermits !== null
          ? (data.requiredPermits as unknown as Prisma.InputJsonArray)
          : Prisma.DbNull,
      notes: data.notes ?? null,
      status: nextStatus,
      // sentAt — момент ПЕРВОЙ отправки: повторная правка/переотправка
      // его не сдвигает (менеджер видит, когда ответ пришёл впервые).
      sentAt: wasSent ? (link.estimate?.sentAt ?? null) : data.send ? new Date() : null,
    }

    const result = await db.$transaction(async (tx) => {
      const estimate = await tx.brokerEstimate.upsert({
        where: { leadBrokerId: link.id },
        create: { leadBrokerId: link.id, ...estimateData },
        update: estimateData,
      })

      // Полная замена строк: deleteMany + createMany в одной транзакции
      // (инвариант 2). История — только в событии estimate_updated:
      // строки не «удалённые», а заменённые целиком (снимок ответа).
      await tx.brokerEstimateItem.deleteMany({ where: { estimateId: estimate.id } })
      if (items.length > 0) {
        await tx.brokerEstimateItem.createMany({
          data: items.map((item, idx) => ({
            estimateId: estimate.id,
            sortOrder: idx,
            hsCode: item.hsCode,
            isManualCode: !knownCodes.has(item.hsCode),
            dutyPercent: item.dutyPercent ?? null,
            addDutyPercent: item.addDutyPercent ?? null,
            addDutyNote: item.addDutyNote ?? null,
            vatPercent: item.vatPercent ?? null,
            rateNote: item.rateNote ?? null,
          })),
        })
      }

      // Ж2: событие лида с актёром-брокером — менеджер видит в ленте.
      // Лента лида не видна брокеру — isInternal тут не нужен: событие
      // информационное. Аудитории — из реестра (sent/updated — staff).
      const duty = estimate.customsDutyEstimate
      const permits = readPermits(estimate.requiredPermits)
      const dutyText =
        duty !== null ? `платежи: ${formatMoney(duty.toString(), 'RUB')}` : 'платежи: не указаны'
      const permitsText =
        permits.length > 0
          ? `разрешительные документы: ${permits.length}`
          : 'разрешительные документы: не указаны'

      if (wasSent) {
        // Правка после отправки — событие с разницей строк (DF-18).
        // Порядок diff: + добавленные, изменённые, − убранные.
        const diff = diffEstimateItems(
          (link.estimate?.items ?? []).map((i) => ({
            hsCode: i.hsCode,
            // Prisma Decimal → строка: diffEstimateItems сравнивает
            // числовое значение (normPct), «5.00» и 5 — одно и то же
            dutyPercent: i.dutyPercent === null ? null : String(i.dutyPercent),
            addDutyPercent: i.addDutyPercent === null ? null : String(i.addDutyPercent),
            vatPercent: i.vatPercent === null ? null : String(i.vatPercent),
          })),
          items.map((i) => ({
            hsCode: i.hsCode,
            dutyPercent: i.dutyPercent ?? null,
            addDutyPercent: i.addDutyPercent ?? null,
            vatPercent: i.vatPercent ?? null,
          })),
        )
        await emitEvent(tx, {
          target: { leadId: id },
          actor: brokerActor(auth.broker),
          type: 'estimate_updated',
          description: `Ответ брокера обновлён после отправки — ${diff || 'строки без изменений (итог/примечания)'}; ${dutyText}`,
        })
      } else if (data.send) {
        // Первая отправка — ответственный получает уведомление (реестр).
        await emitEvent(tx, {
          target: { leadId: id },
          actor: brokerActor(auth.broker),
          type: 'broker_estimate_sent',
          description: `Ответ брокера отправлен — кодов ТН ВЭД: ${items.length}, ${dutyText}, ${permitsText}`,
        })
      } else {
        // Черновик/правка до отправки — прежнее поведение (Ж2).
        await emitEvent(tx, {
          target: { leadId: id },
          actor: brokerActor(auth.broker),
          type: 'broker_estimate_changed',
          description: `Оценка таможенных платежей (${link.estimate ? 'обновлена' : 'сообщена'}) — ${dutyText}, ${permitsText}`,
        })
      }

      return estimate
    })

    const saved = await db.brokerEstimate.findUnique({
      where: { id: result.id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    })

    return NextResponse.json({
      estimate: {
        customsDutyEstimate: saved?.customsDutyEstimate ?? result.customsDutyEstimate,
        requiredPermits: readPermits(saved?.requiredPermits ?? result.requiredPermits),
        notes: saved?.notes ?? result.notes,
        status: saved?.status ?? nextStatus,
        sentAt: saved?.sentAt ?? estimateData.sentAt,
        items: (saved?.items ?? []).map((i) => ({
          hsCode: i.hsCode,
          isManualCode: i.isManualCode,
          dutyPercent: i.dutyPercent,
          addDutyPercent: i.addDutyPercent,
          addDutyNote: i.addDutyNote,
          vatPercent: i.vatPercent,
          rateNote: i.rateNote,
          sortOrder: i.sortOrder,
        })),
        createdAt: saved?.createdAt ?? result.createdAt,
        updatedAt: saved?.updatedAt ?? result.updatedAt,
      },
      message: wasSent
        ? 'Ответ обновлён — менеджер увидит разницу'
        : data.send
          ? 'Ответ отправлен'
          : link.estimate
            ? 'Черновик обновлён'
            : 'Оценка сообщена',
    })
  } catch (e) {
    return apiErrorResponse(e, 'broker/estimate PUT', 'Не удалось сохранить оценку')
  }
}
