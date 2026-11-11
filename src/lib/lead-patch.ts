import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { CurrentEmployee } from '@/lib/auth'
import { PatchLeadSchema, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import {
  validateLeadAnketaEdit,
  validateAssigneeChange,
  validateStatusChange,
} from '@/lib/lead-edit'
import { resolveDealCodes } from '@/lib/ref-db'
import { apiErrorResponse } from '@/lib/api-errors'
import { employeeActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { detectPriceSignificantChanges } from '@/lib/option-snapshots'
import { resolveLeadEditStatus } from '@/lib/lead-auto-status'

// v0.5.0 (P1-22): PATCH /api/admin/leads/[id] — выезд из route.ts
// (резка под лимит 300, RULES 2.14). DF-27 волна 2: логика — в lib
// (прецедент option-write: «роуты тонкие», RULES 2.5).

// ─── PATCH — статус, ответственный, анкета ─────────────────────────
// Статус (очередь В2 + роадмап 8.1):
//   • «won» вручную НЕ ставится (409) — только конвертацией в заявку
//     (В4), и он терминальный: из won вести никуда нельзя;
//   • «lost» требует причину (lostReason), уход из lost её чистит;
//   • повторная установка того же статуса — 400, а не молчаливый 200:
//     рассинхрон «я думал, что перевёл» стоит явной ошибки.
//   • DF-27 волна 2 (§6.4/D75): needs_data — автоматический статус:
//     вручную не ставится и снимается только закрытием; при правке
//     анкеты статус пересчитывает expectedLeadStatus в той же
//     транзакции (lib/lead-auto-status.ts).
// Ответственный (P1-01):
//   • assignedToId — id сотрудника или null (снять); смена — с записью
//     в журнал; повторная установка того же — 400 (контракт статуса);
//   • у won-лида ответственный не меняется вовсе: лид после конвертации
//     — история, ответственность живёт в заявке (переносится В4).
// Анкета (P1-02 + DF-27 волна 2, Р-1/D75):
//   • правка открыта до конвертации/закрытия (new/needs_data/calculated,
//     при client_approved — атомарный сброс согласования в той же
//     транзакции: снимок остаётся в истории, статус пересчитывается);
//   • cargoInfo — полная замена известных полей, неизвестные ключи
//     старого Json сохраняются (mergeLeadCargo, принцип P1-03);
//   • любое реальное изменение анкеты помечает ВСЕ варианты заявки
//     priceReviewRequired=true («требуется актуализация расчёта» — не
//     только ценозначимые ключи, Р-1) + события «lead_edited» с diff
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
    const { status, lostReason, assignedToId, rawContact, cargoInfo, route, incotermCode, incotermPlace } = parsed.data

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

    // ── Правка анкеты (P1-02/P1-03 + Р-1/D75) — окно и diff: lib/lead-edit.ts
    const anketa = validateLeadAnketaEdit(existing, { rawContact, cargoInfo, route, incotermCode, incotermPlace })
    if (!anketa.ok) {
      return NextResponse.json({ error: anketa.error }, { status: 409 })
    }
    const editDescription = anketa.editDescription
    const mergedCargo = anketa.mergedCargo
    if (editDescription === null && status === undefined && assignedToId === undefined && (rawContact !== undefined || cargoInfo !== undefined || route !== undefined)) {
      return NextResponse.json({ error: 'Анкета не изменилась' }, { status: 400 })
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

    // ── Смена статуса (В2): матрица переходов и пороги — lib/lead-edit.ts
    // (needs_data — только автомат, из needs_data вручную только lost)
    if (status !== undefined) {
      const statusError = await validateStatusChange(
        id,
        existing.status as LeadStatus,
        status as LeadStatus,
        lostReason,
        auth.employee.roles.includes('master')
      )
      if (statusError) {
        return NextResponse.json({ error: statusError.error }, { status: statusError.statusCode })
      }
    }

    // DF-17: коды стран и условие поставки — единая валидация по
    // справочнику с денормализацией имён (lib/ref-db.ts; «поле не трогать»
    // при отсутствии ключа — ниже, семантика PATCH).
    const deal = await resolveDealCodes(route, incotermCode)
    if (deal.error) {
      return NextResponse.json({ error: deal.error }, { status: 400 })
    }

    // DF-27 (ТЗ §5.5): ценозначимые ключи правки — перечень в событии.
    // Р-1/D75: флаг актуализации ставится ВСЕМ вариантам при ЛЮБОЙ правке
    // анкеты (не только ценозначимой) — пересчёт по свежей строке внутри
    // транзакции ниже (под блокировкой).

    // ── DF-27 волна 2 (Р-1/§6.4, D75): автомат статуса по полноте ──
    // Сброс client_approved, конфликт явного статуса с автоматом,
    // статус-после (needs_data/new/calculated) — lib/lead-auto-status.ts.
    // Проверки ниже — быстрые (до транзакции); решение повторяется
    // внутри транзакции по свежей строке под блокировкой.
    const optionsCount = await db.quoteOption.count({ where: { leadId: id } })
    const resolution = resolveLeadEditStatus({
      existingStatus: existing.status as LeadStatus,
      existing,
      optionsCount,
      incoming: {
        anketaChanged: editDescription !== null,
        mergedCargo,
        // route-колонки с undefined-«не трогать» в бланк не попадают
        routeColumns: deal.columns
          ? (Object.fromEntries(Object.entries(deal.columns).filter(([, v]) => v !== undefined)) as Record<string, unknown>)
          : undefined,
        incotermCode: incotermCode !== undefined ? deal.incoterm : undefined,
        incotermPlace: incotermPlace !== undefined ? incotermPlace || null : undefined,
      },
      explicitStatus: status as LeadStatus | undefined,
    })
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status })
    }

    // ── Транзакция сохранения: блокировка строки лида + повторная
    // проверка состояния под блокировкой (К-11/К-12 — приёмка Gate 2,
    // замечание по конкурентности Р-1). Между чтением выше и записью
    // менеджер/клиент могли конвертировать запрос (параллельные вкладки).
    // Паттерн тот же, что в convert/route.ts: SELECT … FOR UPDATE,
    // состояние перепроверяется под блокировкой — проигравшая операция
    // видит состояние-после победителя и отвечает 409; правка анкеты
    // на сконвертированном/закрытом запросе невозможна физически.
    const saved = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} FOR UPDATE`
        const locked = await tx.lead.findUnique({
          where: { id },
          include: {
            assignee: { select: { id: true, name: true } },
            order: { select: { id: true, number: true } },
          },
        })
        if (!locked) return { error: 'Запрос не найден', status: 404 }
        if (locked.status === 'won') {
          return {
            error: 'Запрос уже конвертирован в заявку — статус терминальный',
            status: 409,
          }
        }
        // Повторная проверка окна правки анкеты (Р-1) под блокировкой
        const anketaLocked = validateLeadAnketaEdit(locked, {
          rawContact,
          cargoInfo,
          route,
          incotermCode,
          incotermPlace,
        })
        if (!anketaLocked.ok) return { error: anketaLocked.error, status: 409 }
        const editDescriptionLocked = anketaLocked.editDescription
        const mergedCargoLocked = anketaLocked.mergedCargo
        if (
          editDescriptionLocked === null &&
          status === undefined &&
          assignedToId === undefined &&
          (rawContact !== undefined || cargoInfo !== undefined || route !== undefined)
        ) {
          return { error: 'Анкета не изменилась', status: 400 }
        }
        // Повторная проверка явного перехода статуса (В2) под блокировкой:
        // параллельное закрытие («Отказ») упасть обязано по матрице, а не
        // переписать новый статус поверх только что установленного
        if (status !== undefined) {
          const statusError = await validateStatusChange(
            id,
            locked.status as LeadStatus,
            status as LeadStatus,
            lostReason,
            auth.employee.roles.includes('master')
          )
          if (statusError) return { error: statusError.error, status: statusError.statusCode }
        }
        // Автомат статуса (§6.4) — разрешение по свежему состоянию
        const optionsCountLocked = await tx.quoteOption.count({ where: { leadId: id } })
        const resolutionLocked = resolveLeadEditStatus({
          existingStatus: locked.status as LeadStatus,
          existing: locked,
          optionsCount: optionsCountLocked,
          incoming: {
            anketaChanged: editDescriptionLocked !== null,
            mergedCargo: mergedCargoLocked,
            // route-колонки с undefined-«не трогать» в бланк не попадают
            routeColumns: deal.columns
              ? (Object.fromEntries(Object.entries(deal.columns).filter(([, v]) => v !== undefined)) as Record<string, unknown>)
              : undefined,
            incotermCode: incotermCode !== undefined ? deal.incoterm : undefined,
            incotermPlace: incotermPlace !== undefined ? incotermPlace || null : undefined,
          },
          explicitStatus: status as LeadStatus | undefined,
        })
        if (!resolutionLocked.ok) {
          return { error: resolutionLocked.error, status: resolutionLocked.status }
        }
        const { willResetApproval, autoStatus } = resolutionLocked
        const priceKeysLocked = editDescriptionLocked
          ? detectPriceSignificantChanges(locked, { route, mergedCargo: mergedCargoLocked, incotermCode })
          : []

        const lead = await tx.lead.update({
          where: { id },
          data: {
            // Статус: явный (перепроверен выше под блокировкой) или автомат
            // по полноте анкеты; lostReason пишется только со статусом lost;
            // при уходе из lost причина чистится (иначе «Отказ» с хвостом
            // старой причины в карточке после возврата в работу).
            ...(status !== undefined
              ? {
                  status,
                  ...(status === 'lost'
                    ? { lostReason }
                    : locked.status === 'lost'
                      ? { lostReason: null }
                      : {}),
                }
              : autoStatus !== null && autoStatus !== locked.status
                ? { status: autoStatus }
                : {}),
            // Р-1/D75: атомарный сброс согласования при правке анкеты —
            // метаданные чистятся, LeadApprovalSnapshot остаётся в истории
            // (append-only), событие — ниже, в той же смысловой группе.
            ...(willResetApproval
              ? {
                  selectedOptionId: null,
                  clientConfirmedAt: null,
                  clientConfirmedVia: null,
                  clientConfirmedById: null,
                  clientConfirmedByName: null,
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
              mergedCargoLocked === undefined
                ? undefined
                : mergedCargoLocked === null
                  ? Prisma.DbNull
                  : (mergedCargoLocked as unknown as Prisma.InputJsonObject),
            // P1-03/DF-17: маршрут/метрики + коды стран с денормализованными
            // именами (undefined = «не трогать», null = очистить).
            ...deal.columns,
            incotermCode: incotermCode !== undefined ? deal.incoterm : undefined,
            // DF-19: место условия поставки (null = очистить, undefined = не трогать)
            incotermPlace: incotermPlace !== undefined ? incotermPlace || null : undefined,
          },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            assignee: { select: { id: true, name: true } },
            options: { orderBy: { createdAt: 'asc' } },
            order: { select: { id: true, number: true } },
          },
        })
        // Р-1/D75: ЛЮБАЯ правка анкеты помечает все варианты заявки —
        // флаг значит «требуется актуализация расчёта», а не только
        // «изменилась цена» (техплан v1.3 §6.5/в, сценарий 7) —
        // в той же транзакции, что и сама правка
        if (editDescriptionLocked !== null) {
          await tx.quoteOption.updateMany({
            where: { leadId: id, priceReviewRequired: false },
            data: { priceReviewRequired: true },
          })
        }
        return {
          ok: true as const,
          lead,
          locked,
          editDescription: editDescriptionLocked,
          priceKeys: priceKeysLocked,
          willResetApproval,
          autoStatus,
          optionsCount: optionsCountLocked,
        }
      },
      { timeout: 15000, maxWait: 5000 }
    )

    if ('error' in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status })
    }
    const {
      lead,
      locked,
      editDescription: editDescriptionLocked,
      priceKeys,
      willResetApproval: willResetApprovalLocked,
      autoStatus: autoStatusLocked,
      optionsCount: optionsCountAfter,
    } = saved

    // Ж2: журнал — по смысловым частям PATCH, отдельная запись на каждую
    // (лента — хроника решений, а не «что-то обновили»). Порядок:
    // сброс согласования → статус (явный/автомат) → ответственный →
    // анкета последней (diff правки — верх журнала, контракт P1-03).
    if (willResetApprovalLocked) {
      await emitEvent(db, {
        target: { leadId: id },
        actor: employeeActor(auth.employee),
        type: 'lead_confirmation_reset',
        description:
          'Согласование сброшено автоматически: в заявку внесены изменения — варианты расчёта требуют актуализации',
      })
    }
    if (status !== undefined) {
      const prevLabel = LEAD_STATUS_LABELS[locked.status as LeadStatus] ?? locked.status
      const statusDescription =
        status === 'lost'
          ? `Статус: ${prevLabel} → ${LEAD_STATUS_LABELS[status]} — причина: ${lostReason}`
          : locked.status === 'lost'
            ? // P1-05: причина отказа не теряется — уходит в журнал вместе с возвратом.
              `Возвращён в работу: ${prevLabel} → ${LEAD_STATUS_LABELS[status]} — причина отказа: ${locked.lostReason ?? 'не указана'}`
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
      const prevName = locked.assignee?.name ?? null
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
    // Автомат статуса при правке анкеты (без явного статуса) — отдельная
    // запись, как у ручного перевода (Ж2: статус — отдельный смысл);
    // базовое состояние — под блокировкой (свежее)
    if (status === undefined && autoStatusLocked !== null && autoStatusLocked !== locked.status) {
      await emitEvent(db, {
        target: { leadId: id },
        actor: employeeActor(auth.employee),
        type: 'lead_status_changed',
        description: `Статус по полноте анкеты: ${LEAD_STATUS_LABELS[locked.status as LeadStatus]} → ${LEAD_STATUS_LABELS[autoStatusLocked]}`,
      })
    }

    if (editDescriptionLocked) {
      await emitEvent(db, {
        target: { leadId: id },
        actor: employeeActor(auth.employee),
        type: 'lead_edited',
        description:
          editDescriptionLocked +
          (optionsCountAfter > 0
            ? ' — в заявку внесены изменения: варианты расчёта требуют актуализации (Р-1)'
            : '') +
          (priceKeys.length > 0 ? ` — ценозначимые ключи: ${priceKeys.join(', ')}` : ''),
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
