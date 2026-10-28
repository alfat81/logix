import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { CurrentEmployee } from '@/lib/auth'
import { PatchLeadSchema, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import {
  buildLeadEditDiff,
  mergeLeadCargo,
  isLeadAnketaEditable,
  validateAssigneeChange,
} from '@/lib/lead-edit'
import { resolveDealCodes } from '@/lib/ref-db'
import { checkLeadTransition } from '@/lib/status-machine'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'

// v0.5.0 (P1-22): PATCH /api/admin/leads/[id] — выезд из route.ts
// (резка под лимит 300, RULES 2.14). Логика 1:1.

// ─── PATCH — статус, ответственный, анкета ─────────────────────────
// Статус (очередь В2 + роадмап 8.1):
//   • статус меняет только человек, автоматов здесь нет (единственный
//     автомат воронки — new→calculated при первом варианте, живёт в В3);
//   • «won» вручную НЕ ставится (409) — только конвертацией в заявку
//     (В4), и он терминальный: из won вести никуда нельзя;
//   • «lost» требует причину (lostReason), уход из lost её чистит;
//   • повторная установка того же статуса — 400, а не молчаливый 200:
//     рассинхрон «я думал, что перевёл» стоит явной ошибки.
// Ответственный (P1-01):
//   • assignedToId — id сотрудника или null (снять); смена — с записью
//     в журнал; повторная установка того же — 400 (контракт статуса);
//   • у won-лида ответственный не меняется вовсе: лид после конвертации
//     — история, ответственность живёт в заявке (переносится В4).
// Анкета (P1-02):
//   • rawContact/cargoInfo правятся только в new/calculated (won —
//     история, lost — закрытая сделка; оба — 409);
//   • cargoInfo — полная замена известных полей, неизвестные ключи
//     старого Json сохраняются (mergeLeadCargo, принцип P1-03);
//   • каждое реальное изменение — запись «lead_edited» с diff
//     «Поле: старое → новое»; правка без изменений — 400.
export async function patchLead(
  req: NextRequest,
  id: string,
  auth: { ok: true; employee: CurrentEmployee }
): Promise<NextResponse> {
  try {
    const body = await req.json()
    const parsed = PatchLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { status, lostReason, assignedToId, rawContact, cargoInfo, route, incotermCode } = parsed.data

    const existing = await db.lead.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, name: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    if (existing.status === 'won') {
      if (!auth.employee.roles.includes('master')) {
        return NextResponse.json(
          { error: 'Возврат из терминального статуса («Выигран») доступен только мастеру' },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { error: 'Запрос уже конвертирован в заявку — статус терминальный' },
        { status: 409 }
      )
    }

    // ── Правка анкеты (P1-02/P1-03): окно new/calculated ──
    // Контакты правятся только у лида БЕЗ клиента: у связанного клиента
    // контакты живут в справочнике Customer (их правка — не здесь).
    const editingAnketa =
      rawContact !== undefined || cargoInfo !== undefined || route !== undefined
    let editDescription: string | null = null
    // undefined = груз в этом PATCH не менялся; null = очистить известные поля
    let mergedCargo: Record<string, unknown> | null | undefined = undefined
    if (editingAnketa) {
      if (rawContact !== undefined && existing.customerId) {
        return NextResponse.json(
          { error: 'У запроса есть клиент из справочника — контакты правятся в карточке клиента' },
          { status: 409 }
        )
      }
      if (!isLeadAnketaEditable(existing.status)) {
        return NextResponse.json(
          { error: 'Анкета закрытого («Отказ») запроса не правится — верните запрос в работу (мастер)' },
          { status: 409 }
        )
      }
      const diffs = buildLeadEditDiff(existing, { rawContact, cargoInfo, route, incotermCode })
      if (!diffs.length && status === undefined && assignedToId === undefined) {
        return NextResponse.json({ error: 'Анкета не изменилась' }, { status: 400 })
      }
      if (diffs.length) {
        editDescription = diffs.join('; ')
        mergedCargo =
          cargoInfo !== undefined
            ? mergeLeadCargo(existing.cargoInfo, cargoInfo)
            : undefined
      }
    }

    // ── Смена ответственного (P1-01) ──
    let newAssigneeName: string | null = null
    if (assignedToId !== undefined) {
      if ((existing.assignedToId ?? null) === assignedToId) {
        const sameName = assignedToId === null ? 'не назначен' : (existing.assignee?.name ?? assignedToId)
        return NextResponse.json(
          { error: `Ответственный уже: ${sameName}` },
          { status: 400 }
        )
      }
      if (assignedToId !== null) {
        // P1-01: существование и активность целевого сотрудника —
        // lib/lead-edit.ts (лимит 300 строк роута, RULES 2.14)
        const target = await validateAssigneeChange(assignedToId)
        if (target.error) {
          return NextResponse.json({ error: target.error }, { status: 400 })
        }
        newAssigneeName = target.name ?? null
      }
    }

    // ── Смена статуса (В2) ──
    if (status !== undefined) {
      if (status === existing.status) {
        return NextResponse.json(
          { error: `Статус запроса уже: ${LEAD_STATUS_LABELS[status]}` },
          { status: 400 }
        )
      }
      if (status === 'won') {
        return NextResponse.json(
          { error: 'Статус «Выигран» проставляется только конвертацией в заявку' },
          { status: 409 }
        )
      }
      if (status === 'lost' && !lostReason) {
        return NextResponse.json(
          { error: 'Укажите причину отказа (lostReason)' },
          { status: 400 }
        )
      }

      // ── Матрица переходов лида (P1-05, lib/status-machine.ts) ──
      const transition = checkLeadTransition(existing.status as LeadStatus, status as LeadStatus)
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: transition.status })
      }

      // Ручной перевод new→calculated — только при ≥1 варианте расчёта
      // (порог воронки из В3; находка аудита №7: «Рассчитан» без вариантов
      // обесценивал статус и ломал фильтры). Автомат из В3 — POST вариантов
      // — этот порог выполняет всегда, здесь защита от ручного обхода.
      if (existing.status === 'new' && status === 'calculated') {
        const optionsCount = await db.quoteOption.count({ where: { leadId: id } })
        if (optionsCount === 0) {
          return NextResponse.json(
            { error: 'Нельзя перевести в «Рассчитан» без варианта расчёта — сначала добавьте вариант' },
            { status: 409 }
          )
        }
      }

      // lost→new — возврат из терминального: только мастер (как у заявки).
      // Причина отказа сохраняется в журнале — поле чистится при возврате.
      if (existing.status === 'lost' && !auth.employee.roles.includes('master')) {
        return NextResponse.json(
          { error: 'Возврат из «Отказа» доступен только мастеру' },
          { status: 403 }
        )
      }
    }

    // DF-17: коды стран и условие поставки — единая валидация по
    // справочнику с денормализацией имён (lib/ref-db.ts; «поле не трогать»
    // при отсутствии ключа — ниже, семантика PATCH).
    const deal = await resolveDealCodes(route, incotermCode)
    if (deal.error) {
      return NextResponse.json({ error: deal.error }, { status: 400 })
    }

    const lead = await db.lead.update({
      where: { id },
      data: {
        // Статус: lostReason пишется только вместе со статусом lost; при
        // уходе из lost причина чистится (иначе «Отказ» с хвостом старой
        // причины в карточке после возврата в работу).
        ...(status !== undefined
          ? {
              status,
              ...(status === 'lost'
                ? { lostReason }
                : existing.status === 'lost'
                  ? { lostReason: null }
                  : {}),
            }
          : {}),
        // P1-01: ответственный — id или null (снять)
        ...(assignedToId !== undefined ? { assignedToId } : {}),
        // P1-02: анкета — прямые свойства (undefined = поле не трогаем —
        // семантика Prisma; условные спреды здесь ломали вывод TS).
        // Json-колонки: zod-объекты шире InputJsonObject — явный каст
        // (паттерн заявки Ж1); null → Prisma.DbNull = очистка анкеты.
        rawContact:
          rawContact === undefined
            ? undefined
            : (rawContact as unknown as Prisma.InputJsonObject),
        cargoInfo:
          mergedCargo === undefined
            ? undefined
            : mergedCargo === null
              ? Prisma.DbNull
              : (mergedCargo as unknown as Prisma.InputJsonObject),
        // P1-03/DF-17: маршрут/метрики + коды стран с денормализованными
        // именами (undefined = «не трогать», null = очистить).
        ...deal.columns,
        incotermCode: incotermCode !== undefined ? deal.incoterm : undefined,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
        options: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    })

    // Ж2: журнал — по смысловым частям PATCH, отдельная запись на каждую
    // (лента — хроника решений, а не «что-то обновили»).
    if (status !== undefined) {
      const prevLabel = LEAD_STATUS_LABELS[existing.status as LeadStatus] ?? existing.status
      const statusDescription =
        status === 'lost'
          ? `Статус: ${prevLabel} → ${LEAD_STATUS_LABELS[status]} — причина: ${lostReason}`
          : existing.status === 'lost'
            ? // P1-05: причина отказа не теряется — уходит в журнал вместе с возвратом.
              `Возвращён в работу: ${prevLabel} → ${LEAD_STATUS_LABELS[status]} — причина отказа: ${existing.lostReason ?? 'не указана'}`
            : `Статус: ${prevLabel} → ${LEAD_STATUS_LABELS[status]}`
      await emitEvent(db, {
        target: { leadId: id },
        actor: employeeActor(auth.employee),
        type: 'lead_status_changed',
        description: statusDescription,
      })
    }
    let assigneeMessage: string | null = null
    if (assignedToId !== undefined) {
      const prevName = existing.assignee?.name ?? null
      const description =
        assignedToId === null
          ? `Ответственный снят: ${prevName ?? '—'}`
          : prevName
            ? `Ответственный: ${prevName} → ${newAssigneeName}`
            : `Назначен ответственный: ${newAssigneeName}`
      await emitEvent(db, {
        target: { leadId: id },
        actor: employeeActor(auth.employee),
        type: 'lead_assignee_changed',
        description,
      })
      assigneeMessage = assignedToId === null ? 'Ответственный снят' : `Ответственный: ${newAssigneeName}`
    }
    if (editDescription) {
      await emitEvent(db, {
        target: { leadId: id },
        actor: employeeActor(auth.employee),
        type: 'lead_edited',
        description: editDescription,
      })
    }

    const messageParts: string[] = []
    if (status !== undefined) messageParts.push(`Статус запроса: ${LEAD_STATUS_LABELS[status]}`)
    if (assigneeMessage) messageParts.push(assigneeMessage)
    if (editDescription) messageParts.push('Анкета обновлена')

    return NextResponse.json({
      lead,
      message: messageParts.join('; ') || 'Запрос обновлён',
    })
  } catch (e) {
    return apiErrorResponse(e, 'lead PATCH', 'Не удалось обновить запрос')
  }
}
