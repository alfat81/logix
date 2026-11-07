// no-event: события пишут ядра (permit-checks-db/permits-db через emitEvent).
// Гард кабинета — В МАРШРУТЕ (IC-02/IC-03): сюда приходит аутентифицированная
// сессия (requireEmployee / requireBroker), не сырой запрос.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiErrorResponse } from '@/lib/api-errors'
import { parseJsonBody } from '@/lib/api-request'
import { type EmployeeActor, type BrokerActor } from '@/lib/activity'
import { CreatePermitCheckSchema } from '@/lib/permit-checks'
import { createManualPermitCheck, listPermitChecks, reviewPermitCheck } from '@/lib/permit-checks-db'
import { ReviewPermitCheckSchema } from '@/lib/permit-checks'
import { PermitLinkError } from '@/lib/permits-db'
import { brokerConnectedToOrder, brokerConnectedToLead, resolveLeadDealTarget } from '@/lib/permits-access'

// ─── DF-26 волна 2: общий HTTP-контур проверок ТН ВЭД (§5.1–5.3/§11.2) ──
// Один обработчик на четыре маршрута (admin/broker × orders/leads):
// авторизация, резолв цели-сделки, GET списка и POST результата.
// Гард IC-14: маршрутные файлы остаются тонкой оболочкой без 12-строчных
// общих окон; вся логика — здесь.

export type PermitChecksScope =
  | { kind: 'admin-order' }
  | { kind: 'admin-lead' }
  | { kind: 'broker-order' }
  | { kind: 'broker-lead' }

export type PermitChecksSession =
  | { kind: 'staff'; employee: EmployeeActor }
  // Брокер: actor — человек (userId, снимок компании в событиях);
  // companyId — идентичность СВЯЗИ (LeadBroker/OrderBroker хранят id
  // компании — CurrentBroker.id). Смешивать нельзя (урок e2e гейта 2).
  | { kind: 'broker'; broker: BrokerActor; companyId: string }

export async function permitChecksGet(
  id: string,
  scope: PermitChecksScope,
  session: PermitChecksSession,
): Promise<NextResponse> {
  try {
    if (session.kind === 'staff') {
      void session.employee
      const d = scope.kind === 'admin-order'
        ? await db.order.findUnique({ where: { id }, select: { id: true } })
        : await db.lead.findUnique({ where: { id }, select: { id: true } })
      if (!d) {
        return NextResponse.json(
          { error: scope.kind === 'admin-order' ? 'Заявка не найдена' : 'Запрос не найден' },
          { status: 404 },
        )
      }
      return NextResponse.json({
        checks: await listPermitChecks(scope.kind === 'admin-order' ? { orderId: id } : { leadId: id }),
      })
    }
    let deal: Parameters<typeof listPermitChecks>[0] | null
    if (scope.kind === 'broker-order') {
      if (!(await brokerConnectedToOrder(id, session.companyId))) {
        return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
      }
      deal = { orderId: id }
    } else {
      if (!(await brokerConnectedToLead(id, session.companyId))) {
        return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
      }
      deal = await resolveLeadDealTarget(id)
      if (!deal) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    return NextResponse.json({ checks: await listPermitChecks(deal) })
  } catch (e) {
    return apiErrorResponse(e, 'permit-checks GET', 'Не удалось загрузить проверки')
  }
}

export async function permitChecksPost(
  req: NextRequest,
  id: string,
  scope: PermitChecksScope,
  session: PermitChecksSession,
): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(req, CreatePermitCheckSchema)
    if (!parsed.ok) return parsed.response
    const input = parsed.data
    if (session.kind === 'staff') {
      const exists = scope.kind === 'admin-order'
        ? await db.order.findUnique({ where: { id }, select: { id: true } })
        : await db.lead.findUnique({ where: { id }, select: { id: true } })
      if (!exists) {
        return NextResponse.json(
          { error: scope.kind === 'admin-order' ? 'Заявка не найдена' : 'Запрос не найден' },
          { status: 404 },
        )
      }
      const deal = scope.kind === 'admin-order' ? { orderId: id } as const : { leadId: id } as const
      const check = await createManualPermitCheck(deal, input, session.employee)
      return NextResponse.json({ check }, { status: 201 })
    }
    let deal: Parameters<typeof createManualPermitCheck>[0]
    if (scope.kind === 'broker-order') {
      if (!(await brokerConnectedToOrder(id, session.companyId))) {
        return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
      }
      deal = { orderId: id } as const
    } else {
      if (!(await brokerConnectedToLead(id, session.companyId))) {
        return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
      }
      const resolved = await resolveLeadDealTarget(id)
      if (!resolved) return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
      deal = resolved
    }
    const check = await createManualPermitCheck(deal, input, session.broker)
    return NextResponse.json({ check }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'permit-checks POST', 'Не удалось сохранить проверку')
  }
}

// ─── POST review: разбор тела через общий parseJsonBody (§11.2) ────
// (гард IC-14: маршрут остаётся тонким, общих окон нет).
export async function parseAndReviewCheck(
  id: string,
  req: NextRequest,
  actor: Extract<import('@/lib/documents').DocActor, { type: 'employee' }>,
): Promise<NextResponse> {
  try {
    const parsed = await parseJsonBody(req, ReviewPermitCheckSchema)
    if (!parsed.ok) return parsed.response
    const check = await reviewPermitCheck(id, parsed.data, actor)
    return NextResponse.json({ check })
  } catch (e) {
    if (e instanceof PermitLinkError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return apiErrorResponse(e, 'admin permit-check review POST', 'Не удалось выполнить пересмотр')
  }
}
