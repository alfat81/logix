import type { Prisma } from '@prisma/client'
import {
  LEAD_TRANSITIONS,
  expectedLeadStatus,
} from '@/lib/status-machine'
import type { LeadStatus } from '@/lib/leads'
import { completeness, type CompletenessRow } from '@/lib/option-snapshots'
import { LEAD_STATUS_LABELS } from '@/lib/leads'

// ─── DF-27 волна 2 (§6.4, D75): серверный автомат статуса лида ──────
// Единственная точка применения expectedLeadStatus к записи лида:
// считает полноту анкеты (completeness) по состоянию-ПОСЛЕ правки и
// выставляет переход — только если он разрешён матрицей LEAD_TRANSITIONS.
// Так автомат не ломает осознанные запреты топологии: например,
// calculated→new в матрице нет — удаление последнего варианта не
// откатывает «Рассчитан» (симметрия с 8.1: статус меняет человек,
// автомат только доводит до допустимого).
//
// Вызывается ВНУТРИ транзакций сохранения анкеты (клиентский PATCH,
// менеджерский PATCH), создания/удаления варианта и заполнения из
// запроса (план §6.4: назначение и снятие — только сервером, в той же
// транзакции, что изменение данных). Событие lead_status_changed пишет
// вызывающая сторона (ему известен актёр) — здесь только переход.

export type AutoStatusResult = { from: LeadStatus; to: LeadStatus } | null

// Чистая часть: целевой статус с проверкой матрицы (unit-тесты)
export function autoLeadStatus(
  current: LeadStatus,
  optionsCount: number,
  missingCount: number
): LeadStatus | null {
  const next = expectedLeadStatus(current, optionsCount, missingCount)
  if (next === current) return null
  // client_approved/won/lost автомат не трогает — ожидаемо; прочие
  // переходы обязаны быть в матрице (calculated→new — нет)
  if (!(LEAD_TRANSITIONS[current] ?? []).includes(next)) return null
  return next
}

// Применение в транзакции: missing считается по бланку-ПОСЛЕ правки
// (вызывающая сторона собирает его из применённых полей — «состояние-после»).
export async function applyAutoLeadStatus(
  tx: Prisma.TransactionClient,
  leadId: string,
  current: LeadStatus,
  optionsCount: number,
  blankAfter: CompletenessRow
): Promise<AutoStatusResult> {
  const missingCount = completeness(blankAfter).missing.length
  const next = autoLeadStatus(current, optionsCount, missingCount)
  if (!next) return null
  await tx.lead.update({ where: { id: leadId }, data: { status: next } })
  return { from: current, to: next }
}

// ─── DF-27 волна 2 (Р-1/§6.4, D75): разрешение статуса при правке анкеты
// Общая точка для админского PATCH (leads/[id]/patch.ts) и клиентского
// (client/leads/[id]/patch.ts). Правило Р-1: правка анкеты при активном
// согласовании атомарно сбрасывает его (снимок остаётся в истории),
// статус пересчитывается по полноте анкеты в состоянии-ПОСЛЕ:
// needs_data либо calculated; полная анкета без вариантов — new.
// Явный статус в том же PATCH: lost (закрытие) разрешён всегда,
// прочие — только при совпадении с автоматом (иначе 409).
export type LeadEditStatusResolution =
  | { ok: true; willResetApproval: boolean; autoStatus: LeadStatus | null }
  | { ok: false; status: number; error: string }

export function resolveLeadEditStatus(args: {
  // Статус лида ДО правки
  existingStatus: LeadStatus
  // Строка лида ДО правки (полная — completeness читает колонки и cargoInfo)
  existing: CompletenessRow
  optionsCount: number
  incoming: {
    anketaChanged: boolean
    mergedCargo?: Record<string, unknown> | null
    // Разрешённые route-колонки (resolveDealCodes) — ключи с undefined
    // отфильтрованы вызывающей стороной
    routeColumns?: Record<string, unknown>
    incotermCode?: string | null
    incotermPlace?: string | null
  }
  explicitStatus?: LeadStatus
}): LeadEditStatusResolution {
  const willResetApproval = args.existingStatus === 'client_approved' && args.incoming.anketaChanged
  if (!args.incoming.anketaChanged) {
    return { ok: true, willResetApproval: false, autoStatus: null }
  }
  // Бланк «состояние-после»: только реально меняемые ключи
  const blankAfter: CompletenessRow = {
    ...args.existing,
    ...(args.incoming.mergedCargo !== undefined
      ? { cargoInfo: args.incoming.mergedCargo }
      : {}),
    ...(args.incoming.routeColumns ?? {}),
    ...(args.incoming.incotermCode !== undefined
      ? { incotermCode: args.incoming.incotermCode }
      : {}),
    ...(args.incoming.incotermPlace !== undefined
      ? { incotermPlace: args.incoming.incotermPlace }
      : {}),
  }
  const missingAfter = completeness(blankAfter).missing.length
  if (args.explicitStatus !== undefined) {
    // lost — ручное закрытие, разрешено при любой полноте
    if (args.explicitStatus === 'lost') {
      return { ok: true, willResetApproval, autoStatus: null }
    }
    const expected = expectedLeadStatus(
      willResetApproval ? 'calculated' : args.existingStatus,
      args.optionsCount,
      missingAfter
    )
    if (expected !== args.explicitStatus) {
      return {
        ok: false,
        status: 409,
        error: `По полноте анкеты автомат ставит статус «${LEAD_STATUS_LABELS[expected]}» — статус «${LEAD_STATUS_LABELS[args.explicitStatus]}» с этой анкетой несовместим`,
      }
    }
    return { ok: true, willResetApproval, autoStatus: null }
  }
  const autoStatus = willResetApproval
    ? // Сброс согласования — выделенный переход мимо матрицы (как у
      // ручного «Изменить условия»); база после сброса — calculated
      expectedLeadStatus('calculated', args.optionsCount, missingAfter)
    : autoLeadStatus(args.existingStatus, args.optionsCount, missingAfter)
  return { ok: true, willResetApproval, autoStatus }
}
