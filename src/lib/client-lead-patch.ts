import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { apiErrorResponse } from '@/lib/api-errors'
import {
  buildLeadEditDiff,
  mergeLeadCargo,
  ClientLeadEditSchema,
} from '@/lib/lead-edit'
import { resolveRouteColumns } from '@/lib/ref-db'
import { clientActor } from '@/lib/activity'
import { emitEvent } from '@/lib/events'
import { detectPriceSignificantChanges, completeness } from '@/lib/option-snapshots'
import { autoLeadStatus } from '@/lib/lead-auto-status'
import { expectedLeadStatus } from '@/lib/status-machine'
import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import { CLIENT_LEAD_DETAIL_SELECT } from '@/lib/client-lead-select'

// Та же проекция чтения, что и GET-роут (единый состав полей; _count
// нужен для подсчёта вариантов в автомате статуса)
// ─── PATCH — правка анкеты запроса клиентом (P1-02 + Р-1/D75) ──────
// cargoInfo — полная замена известных полей (неизвестные ключи старого
// Json сохраняются, mergeLeadCargo). Окно правки (Р-1): до конвертации
// в заявку и закрытия (won/lost) — правка при активном согласовании
// атомарно сбрасывает его в той же транзакции (снимок остаётся в
// истории). Любая правка помечает все варианты priceReviewRequired
// («требуется актуализация расчёта») и видна обеим сторонам; статус
// пересчитывает автомат по полноте анкеты (needs_data/new/calculated).
// Правка без изменений — 400.
export async function patchClientLead(
  req: NextRequest,
  id: string,
  auth: { ok: true; client: { id: string; name: string; userName?: string; userId: string } }
): Promise<NextResponse> {
  try {
    const body = await req.json()
    const parsed = ClientLeadEditSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { cargoInfo, route } = parsed.data

    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: CLIENT_LEAD_DETAIL_SELECT,
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }

    // Окно правки Р-1/D75: до конвертации в заявку и закрытия запроса
    // (проверка на момент действия: между открытием карточки и
    // сохранением всё могло измениться — менеджер мог конвертировать).
    if (lead.order || lead.status === 'won' || lead.status === 'lost') {
      return NextResponse.json(
        {
          error:
            lead.order || lead.status === 'won'
              ? 'Запрос конвертирован в заявку — правка закрыта'
              : 'Запрос закрыт («Отказ») — правка недоступна',
        },
        { status: 409 }
      )
    }

    const diffs = buildLeadEditDiff(lead, { cargoInfo, route })
    if (!diffs.length) {
      return NextResponse.json({ error: 'Запрос не изменился' }, { status: 400 })
    }
    const description = diffs.join('; ')
    const merged = mergeLeadCargo(lead.cargoInfo, cargoInfo ?? null)

    // DF-17: коды стран — валидация + денормализация имён (клиент шлёт только код)
    const routeResolved = await resolveRouteColumns(route)
    if (routeResolved.error) {
      return NextResponse.json({ error: routeResolved.error }, { status: 400 })
    }

    const optionsCount = lead._count.options
    const willResetApproval = lead.status === 'client_approved'
    const priceKeys = detectPriceSignificantChanges(lead, { route, mergedCargo: merged })

    // Автомат статуса по полноте в состоянии-после (§6.4/D75):
    // client_approved → сброс и прямой пересчёт; иначе — матричный переход
    const blankAfter = {
      ...lead,
      ...(merged !== undefined ? { cargoInfo: merged } : {}),
      ...(routeResolved.columns
        ? Object.fromEntries(
            Object.entries(routeResolved.columns).filter(([, v]) => v !== undefined)
          )
        : {}),
    }
    const missingAfter = completeness(blankAfter).missing.length
    const nextStatus = willResetApproval
      ? expectedLeadStatus('calculated', optionsCount, missingAfter)
      : autoLeadStatus(lead.status as LeadStatus, optionsCount, missingAfter)

    await db.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id },
        data: {
          // Json-колонка: каст как в админском PATCH (паттерн заявки Ж1);
          // null → Prisma.DbNull = SQL NULL («анкета очищена»)
          cargoInfo:
            merged === null
              ? Prisma.DbNull
              : (merged as unknown as Prisma.InputJsonObject),
          // P1-03/DF-17: маршрут/метрики + коды стран (undefined = не трогаем)
          ...routeResolved.columns,
          ...(nextStatus !== null && nextStatus !== lead.status ? { status: nextStatus } : {}),
          // Р-1: атомарный сброс согласования — снимок остаётся в истории
          ...(willResetApproval
            ? {
                selectedOptionId: null,
                clientConfirmedAt: null,
                clientConfirmedVia: null,
                clientConfirmedById: null,
                clientConfirmedByName: null,
              }
            : {}),
        },
      })
      // Р-1/D75: любая правка анкеты помечает ВСЕ варианты заявки
      if (optionsCount > 0) {
        await tx.quoteOption.updateMany({
          where: { leadId: id, priceReviewRequired: false },
          data: { priceReviewRequired: true },
        })
      }
      if (willResetApproval) {
        await emitEvent(tx, {
          target: { leadId: id },
          actor: clientActor(auth.client),
          type: 'lead_confirmation_reset',
          description:
            'Согласование сброшено автоматически: в запрос внесены изменения — варианты расчёта требуют актуализации',
        })
      }
      if (nextStatus !== null && nextStatus !== lead.status) {
        await emitEvent(tx, {
          target: { leadId: id },
          actor: clientActor(auth.client),
          type: 'lead_status_changed',
          description: `Статус по полноте запроса: ${LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS]} → ${LEAD_STATUS_LABELS[nextStatus]}`,
        })
      }
      await emitEvent(tx, {
        target: { leadId: id },
        actor: clientActor(auth.client),
        type: 'lead_edited',
        description:
          description +
          (optionsCount > 0
            ? ' — в запрос внесены изменения: варианты расчёта требуют актуализации (Р-1)'
            : '') +
          (priceKeys.length > 0 ? ` — ценозначимые ключи: ${priceKeys.join(', ')}` : ''),
      })
    })

    return NextResponse.json({
      ok: true,
      message:
        'Запрос обновлён' +
        (optionsCount > 0
          ? ' — варианты расчёта требуют актуализации'
          : ''),
    })
  } catch (e) {
    return apiErrorResponse(e, 'client lead detail PATCH', 'Не удалось обновить запрос')
  }
}
