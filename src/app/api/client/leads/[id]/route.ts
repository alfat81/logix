import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireClient } from '@/lib/client-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { projectActors } from '@/lib/actor-name'
import { CLIENT_LEAD_DETAIL_SELECT } from '@/lib/client-lead-select'
import { patchClientLead } from '@/lib/client-lead-patch'

type Params = { params: Promise<{ id: string }> }

// ─── Карточка запроса (лида) в кабинете клиента (Е, P1-02) ─────────
// До Е клиент видел свои запросы только списком; теперь у запроса есть
// карточка — анкета, которую он отправлял, статус и документы.
// Проекция без lostReason, только свои запросы (404 на чужие).
// Поток A волна 1 (BL-7): клиент видит варианты и продажные цены
// (пересмотр решения №1 — решение владельца от 04.11.2026, D49):
// наружная проекция вариантов БЕЗ costEstimate/costCurrency (комментарий
// в коде — пересмотр решения №1); согласованная карточка дополнительно
// отдаёт метаданные согласования (дата/способ/имя) и зафиксированные
// условия из активного снимка согласования (что клиент видел в момент
// согласия — то и отображается). Клиент НЕ видит: себестоимость, валюту
// себестоимости, маржу, внутренние события (спецификация п. 7).
//
// P1-02 + DF-27 волна 2 (Р-1/D75): правка анкеты — до конвертации/закрытия
// (canEdit подсказывает UI, показывать ли кнопку правки; логика правки —
// lib/client-lead-patch.ts). Каждая правка — событие «lead_edited» в журнале,
// менеджер видит её в ленте.

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const lead = await db.lead.findFirst({
      where: { id, customerId: auth.client.id },
      select: CLIENT_LEAD_DETAIL_SELECT,
    })
    if (!lead) {
      return NextResponse.json({ error: 'Запрос не найден' }, { status: 404 })
    }
    const { _count, ...rest } = lead
    void _count // _count нужен PATCH-логике (общий SELECT), в ответ не отдаётся
    // DF-21: проекция имён актёров журнала под ридера клиента
    const activities = await projectActors(lead.activities, {
      kind: 'client',
      customerId: auth.client.id,
      companyName: auth.client.name,
    })
    // BL-7: активный снимок согласования — наружу только при активном
    // согласовании (история снимков клиенту не отдаётся).
    const activeSnapshot =
      rest.status === 'client_approved' && rest.clientConfirmedAt
        ? (lead.approvalSnapshots.find(
            (s) => s.confirmedAt.getTime() === rest.clientConfirmedAt!.getTime()
          ) ?? null)
        : null
    return NextResponse.json({
      lead: {
        ...rest,
        activities,
        approvalSnapshot: activeSnapshot,
        // DF-27 волна 2 (Р-1/D75): правка открыта до конвертации/закрытия
        // (после правки варианты требуют актуализации — см. PATCH)
        canEdit: !rest.order && rest.status !== 'won' && rest.status !== 'lost',
        // BL-1 + Р-3: клиент может согласовать вариант (в т.ч.
        // предварительный при needs_data), пока согласование не активно
        canConfirm:
          (rest.status === 'calculated' || rest.status === 'needs_data') && !rest.order,
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'client lead detail GET', 'Не удалось загрузить запрос')
  }
}

// ─── PATCH — правка анкеты запроса клиентом (P1-02 + Р-1/D75) ──────
// no-event: события (lead_edited/lead_status_changed/lead_confirmation_reset)
// пишет lib/client-lead-patch.ts в той же транзакции сохранения.
// Логика — lib/client-lead-patch.ts (роуты тонкие, RULES 2.5/2.14)
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireClient(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  return patchClientLead(req, id, auth)
}
