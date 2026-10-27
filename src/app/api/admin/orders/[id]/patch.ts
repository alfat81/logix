import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { CurrentEmployee } from '@/lib/auth'
import {
  ORDER_STATUS_LABELS,
  CARGO_PROFILE_LABELS,
  type CargoProfile,
  type OrderStatus,
} from '@/lib/order-constants'
import { readyDateInput } from '@/lib/route-fields'
import { PatchOrderSchema } from './schemas'
import { buildLeadEditDiff } from '@/lib/lead-edit'
import { getIncompleteMandatoryStages } from '@/lib/orders'
import { checkOrderTransition, TERMINAL_ORDER_STATUSES } from '@/lib/status-machine'
import { employeeActor, type ActivityType } from '@/lib/activity'
import { emitEvent } from '@/lib/events'

// v0.5.0 (P1-22): PATCH /api/admin/orders/[id] — выезд из route.ts
// (резка под лимит 300, RULES 2.14); zod-схема — в schemas.ts. Логика 1:1:
// семантика полей описана в комментарии схемы.

export async function patchOrder(
  req: NextRequest,
  id: string,
  auth: { ok: true; employee: CurrentEmployee }
): Promise<NextResponse> {
  const { employee } = auth
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

    const existing = await db.order.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, name: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
    }

    // ── Ответственный (P1-01): валидация до update ──
    let newAssigneeName: string | null = null
    if (data.assignedToId !== undefined) {
      if ((existing.assignedToId ?? null) === data.assignedToId) {
        const sameName = data.assignedToId === null ? 'не назначен' : (existing.assignee?.name ?? data.assignedToId)
        return NextResponse.json(
          { error: `Ответственный уже: ${sameName}` },
          { status: 400 }
        )
      }
      if (data.assignedToId !== null) {
        const target = await db.employee.findUnique({
          where: { id: data.assignedToId },
          select: { name: true, isActive: true },
        })
        if (!target) {
          return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 400 })
        }
        if (!target.isActive) {
          return NextResponse.json(
            { error: `Сотрудник «${target.name}» деактивирован — назначить нельзя` },
            { status: 400 }
          )
        }
        newAssigneeName = target.name
      }
    }

    // ── Статусная машина (P1-05) ──────────────────────────
    // Переходы — только по матрице lib/status-machine.ts (свобода MVP
    // «переходы не ограничены» отменена задачей P1-05).
    const isMaster = employee.roles.includes('master')
    if (data.status) {
      // Повторная установка того же статуса — явная 400 (тот же
      // контракт, что у лида В2): молчаливый 200 плодит в ленте
      // бессмысленные записи «В работе → В работе».
      if (data.status === existing.status) {
        return NextResponse.json(
          { error: `Статус заявки уже: ${ORDER_STATUS_LABELS[data.status as OrderStatus]}` },
          { status: 400 }
        )
      }
      const from = existing.status as OrderStatus
      const to = data.status as OrderStatus
      const transition = checkOrderTransition(from, to)
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: transition.status })
      }

      // Завершение: обязательные этапы (по актуальному каталогу)
      // должны быть «Завершён». Перекрытие — осознанное решение
      // мастера с комментарием, оно попадает в журнал — не молчаливый обход.
      if (to === 'completed') {
        const incomplete = await getIncompleteMandatoryStages(id)
        if (incomplete.length > 0) {
          if (data.override && !isMaster) {
            return NextResponse.json(
              { error: 'Перекрытие завершения доступно только мастеру' },
              { status: 403 }
            )
          }
          if (data.override && !data.overrideComment) {
            return NextResponse.json(
              { error: 'Укажите комментарий перекрытия (overrideComment) — он попадёт в журнал заявки' },
              { status: 400 }
            )
          }
          if (!data.override) {
            return NextResponse.json(
              {
                error: `Заявку нельзя завершить: не завершены обязательные этапы — ${incomplete
                  .map((s) => `«${s.name}»`)
                  .join(', ')}. Мастер может перекрыть: override=true + overrideComment`,
                incompleteMandatoryStages: incomplete,
              },
              { status: 409 }
            )
          }
        }
      }

      // Возврат из терминального («Завершена»/«Отменена») — только
      // мастеру и только с причиной (уходит в журнал заявки).
      if (TERMINAL_ORDER_STATUSES.includes(from)) {
        if (!isMaster) {
          return NextResponse.json(
            { error: 'Возврат из терминального статуса доступен только мастеру' },
            { status: 403 }
          )
        }
        if (!data.reason) {
          return NextResponse.json(
            { error: 'Укажите причину возврата (reason) — она попадёт в журнал заявки' },
            { status: 400 }
          )
        }
      }
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
        // P1-03: маршрут/метрики — колонки (undefined = не трогаем,
        // null = очистить; прямые свойства — без спредов-союзов)
        originCity: data.route?.originCity,
        originCountry: data.route?.originCountry,
        destinationCity: data.route?.destinationCity,
        destinationCountry: data.route?.destinationCountry,
        transportType: data.route?.transportType,
        readyDate: data.route ? readyDateInput(data.route.readyDate) : undefined,
        weightKg: data.route?.weightKg,
        volumeM3: data.route?.volumeM3,
        placesCount: data.route?.placesCount,
        ...(data.quoteSnapshot !== undefined
          ? {
              quoteSnapshot:
                data.quoteSnapshot === null
                  ? Prisma.DbNull
                  : (data.quoteSnapshot as unknown as Prisma.InputJsonObject),
            }
          : {}),
        // P1-01: ответственный — id или null (снять)
        ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
      },
    })

    // Ж2: журнал — по смысловым частям PATCH, отдельная запись на
    // каждую (статус, суть заявки, прочие поля): лента читается как
    // хроника решений, а не «что-то обновили». Прежние значения — из
    // existing (взят до update), новый статус уже применён выше.
    const events: Array<{ type: ActivityType; description: string }> = []
    if (data.status) {
      let statusDescription = `Статус заявки: ${
        ORDER_STATUS_LABELS[existing.status as OrderStatus] ?? existing.status
      } → ${ORDER_STATUS_LABELS[data.status]}`
      // P1-05: осознанные обходы/возвраты — в ленте с «почему».
      if (data.overrideComment) statusDescription += ` — перекрытие мастером: ${data.overrideComment}`
      else if (data.reason) statusDescription += ` — причина: ${data.reason}`
      events.push({
        type: 'order_status_changed',
        description: statusDescription,
      })
    }
    if (data.cargoInfo !== undefined || data.route !== undefined) {
      // P1-03: журнал с дифом «Поле: старое → новое» (общий код с лидом)
      const cargoDiffs = buildLeadEditDiff(existing, {
        cargoInfo: data.cargoInfo,
        route: data.route,
      })
      events.push({
        type: 'order_cargo_changed',
        description: cargoDiffs.length
          ? cargoDiffs.join('; ')
          : 'Груз и маршрут сняты',
      })
    }
    if (data.quoteSnapshot !== undefined) {
      events.push({
        type: 'order_quote_changed',
        description:
          data.quoteSnapshot === null ? 'Условия сделки сняты' : 'Обновлены условия сделки',
      })
    }
    // P1-01: смена ответственного — отдельная запись в хронике
    if (data.assignedToId !== undefined) {
      const prevName = existing.assignee?.name ?? null
      events.push({
        type: 'order_assignee_changed',
        description:
          data.assignedToId === null
            ? `Ответственный снят: ${prevName ?? '—'}`
            : prevName
              ? `Ответственный: ${prevName} → ${newAssigneeName}`
              : `Назначен ответственный: ${newAssigneeName}`,
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
      await emitEvent(db, {
        target: { orderId: id },
        actor: employeeActor(employee),
        type: ev.type,
        description: ev.description,
      })
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
