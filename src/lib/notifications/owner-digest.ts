import { db } from '@/lib/db'
import { getBrand } from '@/lib/brand'
import { getSetting, getSettingDef } from '@/lib/settings'
import { formatWaitingHours } from '@/lib/waiting'
import { fmtPermitDate, PERMIT_PROVIDER_LABELS, type PermitProvider } from '@/lib/permits'
import { PULSE_KIND_TITLES, type PulseStats, type SlowingGroup } from '@/lib/pulse'
import { loadPulseCore } from '@/lib/pulse-db'
import { nowInZone, parseTimeToMinutes } from './windows'
import { readAppBaseUrl, renderFooter } from './templates'

// ─── DF-08: ежедневная сводка владельцу (письмо type=digest) ─────────
// Карточка DF-08: «письмо мастеру раз в сутки: цифры блока 1 Пульса,
// топ-5 „тормозящих“ заявок, число неотправленных писем, ссылка на
// Пульс». Запуск — ходом диспетчера DF-03 (dispatchNow), который по
// настройкам решает, что пора; схем БД нет — окна и пояс в реестре
// DF-00D (owner_digest.window_start/window_end, notifications.timezone).
//
// Окно — ДИАПАЗОН [start, end] в поясе рассылок: письмо уходит первым
// же проходом диспетчера внутри окна (планировщик ходит каждые 5 минут,
// так что — практически в window_start). Пропущенное окно (сервис был
// недоступен) НЕ молчит до завтра: сводка уходит ближайшим проходом
// после end, всё равно одна за сутки (dedupKey по дате) — «владелец
// знает, что система жива» (карточка). Решение отправки — чистая
// функция ownerDigestDecision, тесты покрывают границы.
//
// Идемпотентность — dedupKey = ownerdigest:{employeeId}:{yyyy-mm-dd}
// (уникальный индекс Notification.dedupKey): повторный вызов в тот же
// день не создаёт второе письмо (гонка двух диспетчеров гасится
// P2002 — тот же приём, что в digest.ts).
//
// Пустой день — письмо всё равно («изменений нет»). Письмо строится из
// lib/pulse-db.ts (общая с Пульсом выборка) один раз на проход, даже
// если мастеров несколько; windowKey = owner:{дата} — в отличие от
// дайджестов DF-03 НЕ начинается с даты, чтобы не занимать слот лимита
// regular-дайджестов получателя (digest.ts считает окна по префиксу
// даты).

// ─── Чистая часть (без БД — unit-тесты) ──────────────────────────────

export type OwnerDigestDecision = 'window' | 'late' | 'wait' | 'skip'

// Решение прохода для одного мастера: 'window' — пора (внутри окна),
// 'late' — окно пропущено, но сегодня сводки ещё не было (шлём),
// 'wait' — окно ещё не наступило, 'skip' — сегодня уже отправлено.
export function ownerDigestDecision(
  nowMinutes: number,
  startMin: number,
  endMin: number,
  sentToday: boolean
): OwnerDigestDecision {
  if (sentToday) return 'skip'
  if (nowMinutes >= startMin && nowMinutes <= endMin) return 'window'
  if (nowMinutes > endMin) return 'late'
  return 'wait'
}

export function ownerDedupKey(employeeId: string, dateStr: string): string {
  return `ownerdigest:${employeeId}:${dateStr}`
}

// Окно валидно, если обе границы распознаны и end позже start (подсказка
// экрана настроек). Невалидное — откат на дефолты реестра DF-00D.
export function parseOwnerWindow(
  start: string,
  end: string
): { startMin: number; endMin: number } | null {
  const startMin = parseTimeToMinutes(start)
  const endMin = parseTimeToMinutes(end)
  if (startMin < 0 || endMin < 0 || endMin <= startMin) return null
  return { startMin, endMin }
}

// Дефолты окна — из реестра настроек (не литералы: владелец меняет
// дефолт реестра — меняется и откат).
export function defaultOwnerWindow(): { startMin: number; endMin: number } | null {
  return parseOwnerWindow(
    getSettingDef('owner_digest.window_start').defaultValue as string,
    getSettingDef('owner_digest.window_end').defaultValue as string
  )
}

export type TopSlowingRow = {
  // «Мяч у менеджера/клиента/брокера/перевозчика» — те же заголовки, что
  // в блоке 3 Пульса (PULSE_KIND_TITLES), письмо не вводит свой словарь.
  kindTitle: string
  number: string
  customerName: string
  ageLabel: string
  sinceMs: number
}

// DF-16: строка «ждём от вас» в сводке — незакрытые разрешительные
// (блокирующие первыми, затем ближайший срок; потолок 5 — письмо краткое).
export type OwnerPermitRow = {
  dealLabel: string // «заявка №17-1» / «запрос — ООО …» / «запрос»
  title: string
  providerLabel: string
  dueLabel: string | null
}

// Чистый форматировщик (unit-тесты): «• заявка №17-1 — «Сертификат…» —
// предоставить: клиент, срок 05.11.2026».
export function formatOwnerPermitLines(rows: OwnerPermitRow[]): string[] {
  return rows.map(
    (r) =>
      `• ${r.dealLabel} — «${r.title}» — предоставить: ${r.providerLabel}` +
      (r.dueLabel ? `, срок ${r.dueLabel}` : '')
  )
}

// Топ-5 «тормозящих» для письма: самые старые мячи по всем группам
// (slowing уже отсортирован по возрасту внутри групп; между группами
// берём глобальный порядок по waitingSince). nowMs — точка отсчёта
// возраста (тесты передают фиксированное «сейчас»).
export function topSlowingRows(slowing: SlowingGroup[], limit = 5, nowMs = Date.now()): TopSlowingRow[] {
  const rows: TopSlowingRow[] = []
  for (const g of slowing) {
    for (const o of g.orders) {
      rows.push({
        kindTitle: PULSE_KIND_TITLES[g.kind],
        number: o.number,
        customerName: o.customerName,
        ageLabel: formatWaitingHours(
          Math.max(0, Math.floor((nowMs - new Date(o.waitingSince).getTime()) / 3_600_000))
        ),
        sinceMs: new Date(o.waitingSince).getTime(),
      })
    }
  }
  rows.sort((a, b) => a.sinceMs - b.sinceMs)
  return rows.slice(0, limit)
}

export type OwnerDigestLetterInput = {
  brandName: string
  // Дата сводки «30.10.2026» — календарная дата в поясе рассылок.
  dateLabel: string
  stats: PulseStats
  // Неотправленные письма: очередь (pending) + неудачные (failed).
  unsentLetters: number
  slowing: TopSlowingRow[]
  // DF-16: ожидаемые разрешительные (топ-5) + общее число ждущих.
  permits: OwnerPermitRow[]
  permitsTotal: number
  pulseUrl: string | null
}

// «30.10.2026» из ключа суток '2026-10-30' (пояс рассылок — windows.ts).
export function dateLabelFromKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return y && m && d ? `${d}.${m}.${y}` : dateStr
}

export function buildOwnerDigestLetter(input: OwnerDigestLetterInput): { subject: string; body: string } {
  const s = input.stats
  const empty =
    s.newLeads24h === 0 &&
    s.activeOrders === 0 &&
    s.waitingOverThreshold === 0 &&
    s.problemStages === 0 &&
    input.slowing.length === 0 &&
    input.permits.length === 0

  const lines: string[] = [`${input.brandName} — сводка за ${input.dateLabel}`, '']
  if (empty) {
    lines.push('Существенных изменений нет.', '')
  }
  lines.push('Показатели:')
  lines.push(`• Новых запросов за 24 ч: ${s.newLeads24h}`)
  lines.push(`• Активных заявок: ${s.activeOrders} (в пути: ${s.inProgress})`)
  lines.push(`• Ждут дольше ${s.attentionHours} ч: ${s.waitingOverThreshold}`)
  lines.push(`• Этапов с проблемой: ${s.problemStages}`)
  lines.push('')
  if (input.slowing.length === 0) {
    lines.push('Тормозящих нет.', '')
  } else {
    lines.push('Тормозят:')
    for (const r of input.slowing) {
      lines.push(`• заявка №${r.number} — ${r.customerName} — ${r.kindTitle.toLowerCase()} · ${r.ageLabel}`)
    }
    lines.push('')
  }
  // DF-16: разрешительные документы — обязательства, по которым сделка
  // стоит (карточка DF-16, п. (в): блок «ждём от вас» в сводке).
  if (input.permits.length > 0) {
    lines.push(`Разрешительные документы (ожидаются: ${input.permitsTotal}):`)
    lines.push(...formatOwnerPermitLines(input.permits))
    lines.push('')
  }
  lines.push(`Неотправленных писем: ${input.unsentLetters}`)
  if (input.pulseUrl) {
    lines.push('', `Открыть Пульс: ${input.pulseUrl}`)
  }
  return { subject: `${input.brandName}: сводка за ${input.dateLabel}`, body: lines.join('\n') }
}

// ─── Серверная часть (ход диспетчера DF-03) ──────────────────────────

// roles — JSON-массив строк (Employee.roles).
function rolesList(roles: string): string[] {
  try {
    const parsed: unknown = JSON.parse(roles)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export type OwnerDigestRun = {
  sent: number
  skipped: number
}

// «Не отправлено» — pending (в очереди, ещё уйдут) + failed (повторы
// исчерпаны): одно число по карточке; детально — журнал отправок DF-04.
async function countUnsentLetters(): Promise<number> {
  return db.notification.count({ where: { status: { in: ['pending', 'failed'] } } })
}

// DF-16: незакрытые разрешительные для сводки (топ-5: блокирующие,
// затем ближайший срок) + общее число; подпись сделки — номер заявки
// или имя клиента запроса.
async function loadOwnerPermitRows(): Promise<{ rows: OwnerPermitRow[]; total: number }> {
  const total = await db.permitRequirement.count({ where: { status: 'pending' } })
  if (total === 0) return { rows: [], total: 0 }
  const rows = await db.permitRequirement.findMany({
    where: { status: 'pending' },
    select: {
      title: true,
      providedBy: true,
      neededBy: true,
      orderId: true,
      leadId: true,
    },
    orderBy: [{ isBlocking: 'desc' }, { neededBy: 'asc' }, { createdAt: 'asc' }],
    take: 5,
  })
  const orderIds = [...new Set(rows.map((r) => r.orderId).filter((v): v is string => Boolean(v)))]
  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((v): v is string => Boolean(v)))]
  const [orders, leads] = await Promise.all([
    orderIds.length
      ? db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } })
      : Promise.resolve([]),
    leadIds.length
      ? db.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, customer: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ])
  const orderLabels = new Map(orders.map((o) => [o.id, `заявка №${o.number}`]))
  const leadLabels = new Map(
    leads.map((l) => [l.id, l.customer?.name ? `запрос — ${l.customer.name}` : 'запрос'])
  )
  return {
    total,
    rows: rows.map((r) => ({
      dealLabel:
        (r.orderId ? orderLabels.get(r.orderId) : undefined) ??
        (r.leadId ? leadLabels.get(r.leadId) : undefined) ??
        'сделка',
      title: r.title,
      providerLabel: PERMIT_PROVIDER_LABELS[r.providedBy as PermitProvider] ?? r.providedBy,
      dueLabel: r.neededBy ? fmtPermitDate(r.neededBy) : null,
    })),
  }
}

export async function processOwnerDigest(at: Date = new Date()): Promise<OwnerDigestRun> {
  const run: OwnerDigestRun = { sent: 0, skipped: 0 }

  const [tz, startRaw, endRaw] = await Promise.all([
    getSetting('notifications.timezone'),
    getSetting('owner_digest.window_start'),
    getSetting('owner_digest.window_end'),
  ])
  const window = parseOwnerWindow(startRaw, endRaw) ?? defaultOwnerWindow()
  if (!window) return run // реестр без валидных дефолтов — настройка сломана, сводку молча не шлём

  const masters = await db.employee.findMany({
    where: { isActive: true, email: { not: null } },
    select: { id: true, email: true, roles: true },
  })
  const targets = masters.filter((m) => rolesList(m.roles).includes('master'))
  if (targets.length === 0) return run

  const now = nowInZone(tz, at)
  const keys = new Map(targets.map((t) => [t.id, ownerDedupKey(t.id, now.dateStr)]))
  const existing = await db.notification.findMany({
    where: { dedupKey: { in: [...keys.values()] } },
    select: { dedupKey: true },
  })
  const sentToday = new Set(existing.map((e) => e.dedupKey))

  const pending = targets.filter((t) => {
    const decision = ownerDigestDecision(now.minutes, window.startMin, window.endMin, sentToday.has(keys.get(t.id) as string))
    if (decision === 'window' || decision === 'late') return true
    run.skipped += 1
    return false
  })
  if (pending.length === 0) return run

  // Содержимое — одно на проход: цифры Пульса общие для всех мастеров.
  const [brand, core, unsent, footer, permits] = await Promise.all([
    getBrand(),
    loadPulseCore(at),
    countUnsentLetters(),
    renderFooter(),
    loadOwnerPermitRows(),
  ])
  const pulseBase = readAppBaseUrl()
  const letter = buildOwnerDigestLetter({
    brandName: brand.name,
    dateLabel: dateLabelFromKey(now.dateStr),
    stats: core.stats,
    unsentLetters: unsent,
    slowing: topSlowingRows(core.slowing, 5, at.getTime()),
    permits: permits.rows,
    permitsTotal: permits.total,
    pulseUrl: pulseBase ? `${pulseBase}/admin/pulse` : null,
  })

  for (const t of pending) {
    try {
      await db.notification.create({
        data: {
          recipientKind: 'employee',
          recipientId: t.id,
          toAddress: t.email as string,
          channel: 'email',
          mode: 'regular',
          eventId: null,
          type: 'digest',
          subject: letter.subject,
          body: `${letter.body}\n\n${footer}`,
          status: 'pending',
          attempts: 0,
          nextAttemptAt: at,
          windowKey: `owner:${now.dateStr}`,
          dedupKey: keys.get(t.id) as string,
        },
        select: { id: true },
      })
      run.sent += 1
    } catch (e) {
      // P2002 — сводка на эту дату уже создана параллельным диспетчером.
      const code = (e as { code?: string }).code
      if (code !== 'P2002') throw e
      run.skipped += 1
    }
  }
  return run
}
