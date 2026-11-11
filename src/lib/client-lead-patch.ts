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

    // DF-17: коды стран — валидация + денормализация имён (клиент шлёт только код)
    const routeResolved = await resolveRouteColumns(route)
    if (routeResolved.error) {
      return NextResponse.json({ error: routeResolved.error }, { status: 400 })
    }

    // Транзакция: блокировка строки лида + повторная проверка окна правки
    // (Р-1) под блокировкой (К-11 — приёмка Gate 2, замечание по
    // конкурентности). Проверка окна выше — быстрая; между ней и записью
    // менеджер мог конвертировать запрос. Паттерн convert/route.ts:
    // SELECT … FOR UPDATE, состояние перепроверяется по свежей строке —
    // проигравшая операция отвечает 409, правки на won-лиде невозможны.
    const saved = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${id} FOR UPDATE`
        const locked = await tx.lead.findFirst({
          where: { id, customerId: auth.client.id },
          select: CLIENT_LEAD_DETAIL_SELECT,
        })
        if (!locked) return { error: 'Запрос не найден', status: 404 }
        if (locked.order || locked.status === 'won' || locked.status === 'lost') {
          return {
            error:
              locked.order || locked.status === 'won'
                ? 'Запрос конвертирован в заявку — правка закрыта'
                : 'Запрос закрыт («Отказ») — правка недоступна',
            status: 409,
          }
        }

        // Пересчёт diff/слияния/автомата по свежей строке (под блокировкой):
        // параллельная правка могла уже применить те же значения
        const lockedDiffs = buildLeadEditDiff(locked, { cargoInfo, route })
        if (!lockedDiffs.length) {
          return { error: 'Запрос не изменился', status: 400 }
        }
        const lockedDescription = lockedDiffs.join('; ')
        const lockedMerged = mergeLeadCargo(locked.cargoInfo, cargoInfo ?? null)

        const lockedOptionsCount = locked._count.options
        const lockedWillResetApproval = locked.status === 'client_approved'
        const lockedPriceKeys = detectPriceSignificantChanges(locked, {
          route,
          mergedCargo: lockedMerged,
        })

        // Автомат статуса по полноте в состоянии-после (§6.4/D75):
        // client_approved → сброс и прямой пересчёт; иначе — матричный переход
        const blankAfter = {
          ...locked,
          ...(lockedMerged !== undefined ? { cargoInfo: lockedMerged } : {}),
          ...(routeResolved.columns
            ? Object.fromEntries(
                Object.entries(routeResolved.columns).filter(([, v]) => v !== undefined)
              )
            : {}),
        }
        const missingAfter = completeness(blankAfter).missing.length
        const lockedNextStatus = lockedWillResetApproval
          ? expectedLeadStatus('calculated', lockedOptionsCount, missingAfter)
          : autoLeadStatus(locked.status as LeadStatus, lockedOptionsCount, missingAfter)

        await tx.lead.update({
          where: { id },
          data: {
            // Json-колонка: каст как в админском PATCH (паттерн заявки Ж1);
            // null → Prisma.DbNull = SQL NULL («анкета очищена»)
            cargoInfo:
              lockedMerged === null
                ? Prisma.DbNull
                : (lockedMerged as unknown as Prisma.InputJsonObject),
            // P1-03/DF-17: маршрут/метрики + коды стран (undefined = не трогаем)
            ...routeResolved.columns,
            ...(lockedNextStatus !== null && lockedNextStatus !== locked.status
              ? { status: lockedNextStatus }
              : {}),
            // Р-1: атомарный сброс согласования — снимок остаётся в истории
            ...(lockedWillResetApproval
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
        if (lockedOptionsCount > 0) {
          await tx.quoteOption.updateMany({
            where: { leadId: id, priceReviewRequired: false },
            data: { priceReviewRequired: true },
          })
        }
        if (lockedWillResetApproval) {
          await emitEvent(tx, {
            target: { leadId: id },
            actor: clientActor(auth.client),
            type: 'lead_confirmation_reset',
            description:
              'Согласование сброшено автоматически: в запрос внесены изменения — варианты расчёта требуют актуализации',
          })
        }
        if (lockedNextStatus !== null && lockedNextStatus !== locked.status) {
          await emitEvent(tx, {
            target: { leadId: id },
            actor: clientActor(auth.client),
            type: 'lead_status_changed',
            description: `Статус по полноте запроса: ${LEAD_STATUS_LABELS[locked.status as keyof typeof LEAD_STATUS_LABELS]} → ${LEAD_STATUS_LABELS[lockedNextStatus]}`,
          })
        }
        await emitEvent(tx, {
          target: { leadId: id },
          actor: clientActor(auth.client),
          type: 'lead_edited',
          description:
            lockedDescription +
            (lockedOptionsCount > 0
              ? ' — в запрос внесены изменения: варианты расчёта требуют актуализации (Р-1)'
              : '') +
            (lockedPriceKeys.length > 0
              ? ` — ценозначимые ключи: ${lockedPriceKeys.join(', ')}`
              : ''),
        })
        return { ok: true as const, optionsCount: lockedOptionsCount }
      },
      { timeout: 15000, maxWait: 5000 }
    )

    if ('error' in saved) {
      return NextResponse.json({ error: saved.error }, { status: saved.status })
    }

    return NextResponse.json({
      ok: true,
      message:
        'Запрос обновлён' +
        (saved.optionsCount > 0
          ? ' — варианты расчёта требуют актуализации'
          : ''),
    })
  } catch (e) {
    return apiErrorResponse(e, 'client lead detail PATCH', 'Не удалось обновить запрос')
  }
}
