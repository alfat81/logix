import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { emitEvent } from '@/lib/events'

// ─── DF-27 волна 2 (Р-3, D75): неизменяемые печатные редакции заявки ─
// Каждая значимая правка заявки после согласования формирует НОВУЮ
// редакцию (append-only, модель LeadPrintRevision): содержимое и hash
// после создания не меняются, исправление — новая редакция со своим
// seq. Клиент и менеджер подтверждают ОДНУ И ТУ ЖЕ редакцию по
// revisionId + contentHash (модель LeadPrintRevisionConfirmation,
// @@unique([revisionId, partyRole])); подтверждение менеджера не
// заменяет подтверждение клиента и наоборот. Подтверждение редакции —
// согласие с СОСТАВОМ сведений на дату, не превращение предварительной
// цены в окончательное обязательство (D41/D73 в силе).

// Версия структуры leadSnapshot (толерантные читатели, прецедент снимков)
export const LEAD_PRINT_SNAPSHOT_VERSION = 1

// Роль подтверждения (одна запись на роль на редакцию)
export const PRINT_REVISION_PARTY_ROLES = ['client', 'manager'] as const
export type PrintRevisionPartyRole = (typeof PRINT_REVISION_PARTY_ROLES)[number]

export const PRINT_REVISION_PARTY_LABELS: Record<PrintRevisionPartyRole, string> = {
  client: 'клиентом',
  manager: 'менеджером',
}

// Строка лида для сборки снимка печатной формы (полный бланк: контакты,
// маршрут/метрики, анкета груза целиком; желания — wishes)
export type PrintLeadRow = {
  id: string
  createdAt: Date
  rawContact?: unknown
  cargoInfo?: unknown
  wishes?: unknown
  originCity?: unknown
  originCountry?: unknown
  originCountryCode?: unknown
  destinationCity?: unknown
  destinationCountry?: unknown
  destinationCountryCode?: unknown
  transportType?: unknown
  readyDate?: unknown
  weightKg?: unknown
  volumeM3?: unknown
  placesCount?: unknown
  incotermCode?: unknown
  incotermPlace?: unknown
  customer?: { name: string; phone: string | null } | null
}

// Снимок печатной формы заявки: все поля бланка verbatim (неизвестные
// ключи cargoInfo не теряются — прецедент cargoSnapshot), клиент —
// снимком имени/телефона
export function buildLeadPrintSnapshot(lead: PrintLeadRow): Record<string, unknown> {
  return {
    v: LEAD_PRINT_SNAPSHOT_VERSION,
    leadId: lead.id,
    createdAt: lead.createdAt.toISOString(),
    contact:
      lead.customer
        ? { name: lead.customer.name, phone: lead.customer.phone }
        : (lead.rawContact ?? null),
    route: {
      originCity: lead.originCity ?? null,
      originCountry: lead.originCountry ?? null,
      originCountryCode: lead.originCountryCode ?? null,
      destinationCity: lead.destinationCity ?? null,
      destinationCountry: lead.destinationCountry ?? null,
      destinationCountryCode: lead.destinationCountryCode ?? null,
      transportType: lead.transportType ?? null,
      readyDate: lead.readyDate instanceof Date ? lead.readyDate.toISOString().slice(0, 10) : null,
      weightKg: lead.weightKg ?? null,
      volumeM3: lead.volumeM3 ?? null,
      placesCount: lead.placesCount ?? null,
      incotermCode: lead.incotermCode ?? null,
      incotermPlace: lead.incotermPlace ?? null,
    },
    cargo: lead.cargoInfo ?? null,
    wishes: lead.wishes ?? null,
  }
}

// Хеш содержимого редакции: sha256 канонического JSON (стабильный
// порядок ключей — сортировка), подтверждение сверяет его (Р-3)
export function printRevisionContentHash(snapshot: unknown): string {
  const canonical = JSON.stringify(snapshot, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      )
    }
    return value
  })
  return createHash('sha256').update(canonical).digest('hex')
}

// Создание неизменяемой редакции (seq = max+1, @@unique([leadId, seq])).
// ВЫЗЫВАТЬ в транзакции с блокировкой строки лида; содержимое/hash после
// создания не меняются — правка состава = новая редакция.
export async function createPrintRevision(
  tx: Prisma.TransactionClient,
  leadId: string,
  actor: { id: string | null; name: string },
  options?: { renderedFileId?: string | null }
): Promise<{ id: string; seq: number; contentHash: string }> {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      createdAt: true,
      rawContact: true,
      cargoInfo: true,
      wishes: true,
      originCity: true,
      originCountry: true,
      originCountryCode: true,
      destinationCity: true,
      destinationCountry: true,
      destinationCountryCode: true,
      transportType: true,
      readyDate: true,
      weightKg: true,
      volumeM3: true,
      placesCount: true,
      incotermCode: true,
      incotermPlace: true,
      customer: { select: { name: true, phone: true } },
    },
  })
  if (!lead) throw new Error('LEAD_NOT_FOUND')
  const snapshot = buildLeadPrintSnapshot(lead)
  const contentHash = printRevisionContentHash(snapshot)
  const last = await tx.leadPrintRevision.findFirst({
    where: { leadId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  })
  const seq = (last?.seq ?? 0) + 1
  const created = await tx.leadPrintRevision.create({
    data: {
      leadId,
      seq,
      leadSnapshot: snapshot as unknown as Prisma.InputJsonObject,
      renderedFileId: options?.renderedFileId ?? null,
      contentHash,
      createdById: actor.id,
      createdByName: actor.name,
    },
  })
  return { id: created.id, seq, contentHash }
}

// Подтверждение редакции стороной (Р-3): сверка contentHash (защита от
// устаревшей страницы), одна запись на роль, повторное подтверждение —
// 409 (история не перезаписывается). Событие — в той же транзакции.
export async function confirmPrintRevision(
  tx: Prisma.TransactionClient,
  leadId: string,
  revisionId: string,
  partyRole: PrintRevisionPartyRole,
  actor: { type: 'employee' | 'client'; id: string; name: string; userName?: string },
  args: { contentHash: string; method: string; comment?: string | null }
): Promise<{ ok: true; bothConfirmed: boolean } | { ok: false; status: number; error: string }> {
  const revision = await tx.leadPrintRevision.findFirst({
    where: { id: revisionId, leadId },
    select: { id: true, seq: true, contentHash: true },
  })
  if (!revision) return { ok: false, status: 404, error: 'Редакция не найдена' }
  if (revision.contentHash !== args.contentHash) {
    return {
      ok: false,
      status: 409,
      error: 'Хеш редакции не совпадает — обновите страницу и подтвердите актуальную редакцию',
    }
  }
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: { status: true },
  })
  if (!lead) return { ok: false, status: 404, error: 'Запрос не найден' }
  if (lead.status === 'won' || lead.status === 'lost') {
    return { ok: false, status: 409, error: 'Запрос закрыт — подтверждение редакции недоступно' }
  }
  const existing = await tx.leadPrintRevisionConfirmation.findUnique({
    where: { revisionId_partyRole: { revisionId, partyRole } },
    select: { id: true, confirmedAt: true },
  })
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: `Редакция №${revision.seq} уже подтверждена ${PRINT_REVISION_PARTY_LABELS[partyRole]} — повторное подтверждение не требуется`,
    }
  }
  await tx.leadPrintRevisionConfirmation.create({
    data: {
      revisionId,
      partyRole,
      actorId: actor.id,
      actorName: actor.userName ? `${actor.name} (${actor.userName})` : actor.name,
      method: args.method,
      comment: args.comment ?? null,
    },
  })
  const confirmations = await tx.leadPrintRevisionConfirmation.findMany({
    where: { revisionId },
    select: { partyRole: true },
  })
  const bothConfirmed = confirmations.length >= 2
  await emitEvent(tx, {
    target: { leadId },
    actor,
    type: 'lead_print_revision_confirmed',
    description:
      `Печатная редакция №${revision.seq} подтверждена ${PRINT_REVISION_PARTY_LABELS[partyRole]} (${actor.name})` +
      (bothConfirmed ? ' — редакция подтверждена обеими сторонами' : ''),
  })
  return { ok: true, bothConfirmed }
}


// Парс тела подтверждения печатной редакции (общий для админского и
// клиентского confirm-роутов; Р-3): contentHash обязателен, комментарий ≤500.
export const PrintRevisionConfirmSchema = z
  .object({
    contentHash: z.string().min(8),
    comment: z.string().max(500).optional(),
  })
  .strict()

export async function parsePrintRevisionConfirm(
  req: Request
): Promise<{ ok: true; contentHash: string; comment: string | null } | { ok: false; status: number; error: string }> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { ok: false, status: 400, error: 'Некорректный JSON в теле запроса' }
  }
  const parsed = PrintRevisionConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'Некорректные данные подтверждения (contentHash обязателен)' }
  }
  return { ok: true, contentHash: parsed.data.contentHash, comment: parsed.data.comment ?? null }
}
