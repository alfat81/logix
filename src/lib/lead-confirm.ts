import { Prisma } from '@prisma/client'
import { emitEvent } from '@/lib/events'
import type { ActivityActor } from '@/lib/activity'
import {
  LEAD_CONFIRM_VIA_LABELS,
  LEAD_STATUS_LABELS,
  type LeadConfirmVia,
} from '@/lib/leads'

// ─── Поток A волна 1 (BL): контур согласования расчёта ─────────────
// Общая серверная логика confirm-API (план ред. 3 §4.1):
//   • select-option  — POST /api/client/leads/[id]/select-option
//   • confirm        — POST /api/admin/leads/[id]/confirm
// Оба вызывают confirmLeadOption() — ОДНА интерактивная транзакция,
// первый шаг — блокировка строки лида `SELECT … FOR UPDATE`, затем
// перечитывание и валидация (по образцу convert-роута, DF-00).
// Все операции внутри tx: метаданные на лиде, isSelected на вариантах,
// исторический снимок LeadApprovalSnapshot (§2.5) и событие.
//
// Правила (спецификация владельца, раздел 1 плана):
//   • подтверждение возможно только из `calculated` (new — вариантов
//     нет; client_approved — уже согласован: 409);
//   • снимок — копия ВСЕХ коммерческих полей варианта на момент
//     блокировки строки лида; себестоимость в снимок не входит;
//   • повторное подтверждение → 409 «уже согласован» (К-02/К-10/К-11:
//     ровно один победитель — блокировка строки лида);
//   • сброс («Изменить условия») — resetLeadConfirmation(): статус →
//     calculated, метаданные очищаются, isSelected варианта остаётся
//     «текущим выбором», исторические снимки НЕ трогаются.

export type LeadConfirmActor = {
  actor: ActivityActor
  via: LeadConfirmVia
  byId: string
  byName: string
}

export type LeadConfirmOutcome =
  | { ok: true; confirmedAt: Date; optionId: string; description: string }
  | { ok: false; status: number; error: string }

export type LeadResetOutcome = { ok: true } | { ok: false; status: number; error: string }

// Подтверждение варианта (клиентом в кабинете или менеджером от имени).
// tx обязателен: роуты открывают транзакцию сами (конвертация/сброс
// могут идти параллельно — блокировка строки лида разводит гонки К-01…К-05).
export async function confirmLeadOption(
  tx: Prisma.TransactionClient,
  leadId: string,
  optionId: string,
  meta: LeadConfirmActor
): Promise<LeadConfirmOutcome> {
  // 1. Блокировка строки лида — гонки К-02/К-04/К-10/К-11 разводятся здесь
  await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    include: { order: { select: { id: true, number: true } } },
  })
  if (!lead) return { ok: false, status: 404, error: 'Запрос не найден' }
  if (lead.order || lead.status === 'won') {
    return {
      ok: false,
      status: 409,
      error: `Запрос уже конвертирован в заявку №${lead.order?.number ?? ''} — согласование недоступно`,
    }
  }
  if (lead.status === 'lost') {
    return { ok: false, status: 409, error: 'Запрос в отказе — согласование недоступно' }
  }
  if (lead.status === 'client_approved') {
    return { ok: false, status: 409, error: 'Вариант уже согласован — обновите карточку запроса' }
  }
  if (lead.status !== 'calculated') {
    return {
      ok: false,
      status: 409,
      error: 'Согласование доступно, когда запрос рассчитан — дождитесь вариантов расчёта',
    }
  }

  // 2. Вариант принадлежит этому запросу?
  const option = await tx.quoteOption.findFirst({ where: { id: optionId, leadId } })
  if (!option) {
    return { ok: false, status: 400, error: 'Вариант расчёта не принадлежит этому запросу' }
  }

  const now = new Date()

  // 3. Инвариант «ровно один isSelected» + фиксация выбранного
  await tx.quoteOption.updateMany({
    where: { leadId, isSelected: true },
    data: { isSelected: false },
  })
  await tx.quoteOption.update({ where: { id: optionId }, data: { isSelected: true } })

  // 4. Метаданные согласования на лиде (активный указатель факта)
  await tx.lead.update({
    where: { id: leadId },
    data: {
      status: 'client_approved',
      selectedOptionId: optionId,
      clientConfirmedAt: now,
      clientConfirmedVia: meta.via,
      clientConfirmedById: meta.byId,
      clientConfirmedByName: meta.byName,
    },
  })

  // 5. Исторический снимок согласованных условий (§2.5): копия
  //    коммерческих полей варианта; себестоимость сознательно не входит.
  await tx.leadApprovalSnapshot.create({
    data: {
      leadId,
      optionId,
      optionCreatedAt: option.createdAt,
      description: option.description,
      transportModes: (option.transportModes ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      price: option.price,
      currency: option.currency,
      vatMode: option.vatMode,
      etaDays: option.etaDays,
      priorityFit: option.priorityFit,
      confirmedAt: now,
      confirmedVia: meta.via,
      confirmedById: meta.byId,
      confirmedByName: meta.byName,
    },
  })

  // 6. Событие в обе ленты (аудитория staff+client, реестр §2.3);
  //    формулировка от имени — «Согласие зафиксировал {имя} от имени клиента».
  const money = `${LEAD_CONFIRM_VIA_LABELS[meta.via]}`
  await emitEvent(tx, {
    target: { leadId },
    actor: meta.actor,
    type: 'lead_client_confirmed',
    description:
      meta.via === 'manager_on_behalf'
        ? `Согласие зафиксировал ${meta.byName} от имени клиента: «${option.description}», ${option.etaDays} дн.`
        : `Согласован вариант расчёта: «${option.description}», ${option.etaDays} дн. (${money})`,
  })

  return { ok: true, confirmedAt: now, optionId, description: option.description }
}

// Сброс согласования — «Изменить условия» (уровень 1 защиты, п. 8):
// единственный путь изменить зафиксированные условия. Исторические
// снимки не удаляются и не правятся (уровень 2 — §2.5 п. 3).
export async function resetLeadConfirmation(
  tx: Prisma.TransactionClient,
  leadId: string,
  actor: ActivityActor
): Promise<LeadResetOutcome> {
  await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    include: { order: { select: { id: true, number: true } } },
  })
  if (!lead) return { ok: false, status: 404, error: 'Запрос не найден' }
  if (lead.order || lead.status === 'won') {
    return {
      ok: false,
      status: 409,
      error: `Запрос уже конвертирован в заявку №${lead.order?.number ?? ''} — сбрасывать нечего`,
    }
  }
  if (lead.status === 'lost') {
    return { ok: false, status: 409, error: 'Запрос в отказе — сброс согласования недоступен' }
  }
  if (lead.status !== 'client_approved') {
    return { ok: false, status: 409, error: 'Активного согласования нет — сбрасывать нечего' }
  }

  // Метаданные очищаются; isSelected варианта сохраняется — остаётся
  // «текущим выбором» до нового подтверждения (план §4.1 п. 3).
  await tx.lead.update({
    where: { id: leadId },
    data: {
      status: 'calculated',
      selectedOptionId: null,
      clientConfirmedAt: null,
      clientConfirmedVia: null,
      clientConfirmedById: null,
      clientConfirmedByName: null,
    },
  })

  await emitEvent(tx, {
    target: { leadId },
    actor,
    type: 'lead_confirmation_reset',
    description: `Согласование сброшено — условия изменены менеджером; запрос снова «${LEAD_STATUS_LABELS.calculated}», требуется повторное согласование`,
  })

  return { ok: true }
}
