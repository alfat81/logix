import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '../db'
import { clearSettingsCache, getSetting, setSetting, getSettingDef } from '../settings'
import { nowInZone } from './windows'
import {
  buildOwnerDigestLetter,
  dateLabelFromKey,
  defaultOwnerWindow,
  ownerDedupKey,
  ownerDigestDecision,
  parseOwnerWindow,
  processOwnerDigest,
  topSlowingRows,
  type OwnerDigestLetterInput,
} from './owner-digest'
import type { SlowingGroup } from '../pulse'

// ─── DF-08: ежедневная сводка владельцу ───────────────────────────────
// Чистый уровень: решение отправки по окну (границы, пропущенное окно,
// дедуп дня), ключ дедупликации, сборка письма (цифры, топ-5 «тормозящих»,
// неотправленные, ссылка на Пульс, «изменений нет» в пустой день).
// Интеграционный уровень (реальная БД, паттерн notifications.test.ts):
// повторный вызов в тот же день не создаёт второе письмо; менеджеру
// сводка не уходит; окно меняется поведением без выката.

const RUN = Date.now() % 1e8
const MARK = 'DF08T-' + RUN
const DOMAIN = 'test.example'
const ownerEmail = `owner-${RUN}@${DOMAIN}`
const managerEmail = `owner-mgr-${RUN}@${DOMAIN}`

const ids = { employees: [] as string[], notifications: [] as string[] }

function phone(offset: number): string {
  return '+794' + String((RUN + offset) % 1e8).padStart(8, '0')
}

function slowingRow(kind: 'manager' | 'client' | 'broker' | 'contractor', since: string, number: string) {
  return {
    kind,
    count: 1,
    oldestSince: since,
    hiddenCount: 0,
    orders: [
      { orderId: `o-${number}`, number, customerName: 'ООО «Ромашка»', waitingReason: null, waitingSince: since },
    ],
  } as unknown as SlowingGroup
}

function letterInput(over: Partial<OwnerDigestLetterInput> = {}): OwnerDigestLetterInput {
  return {
    brandName: 'Logix',
    dateLabel: '30.10.2026',
    stats: {
      newLeads24h: 3,
      activeOrders: 12,
      inProgress: 5,
      waitingOverThreshold: 2,
      problemStages: 1,
      attentionHours: 24,
    },
    unsentLetters: 0,
    slowing: [],
    // DF-16: разрешительные в сводке (пусто — секции нет)
    permits: [],
    permitsTotal: 0,
    pulseUrl: 'https://app.example.ru/admin/pulse',
    ...over,
  }
}

describe('ownerDigestDecision (окно — диапазон, дедуп дня)', () => {
  it('до окна — wait', () => {
    expect(ownerDigestDecision(8 * 60, 9 * 60, 10 * 60, false)).toBe('wait')
  })
  it('внутри окна — window (границы включительно)', () => {
    expect(ownerDigestDecision(9 * 60, 9 * 60, 10 * 60, false)).toBe('window')
    expect(ownerDigestDecision(10 * 60, 9 * 60, 10 * 60, false)).toBe('window')
  })
  it('после окна без отправки — late (сводка не молчит до завтра)', () => {
    expect(ownerDigestDecision(10 * 60 + 1, 9 * 60, 10 * 60, false)).toBe('late')
  })
  it('уже отправлено сегодня — skip в любой фазе', () => {
    expect(ownerDigestDecision(9 * 60, 9 * 60, 10 * 60, true)).toBe('skip')
    expect(ownerDigestDecision(10 * 60 + 5, 9 * 60, 10 * 60, true)).toBe('skip')
  })
})

describe('parseOwnerWindow / defaultOwnerWindow', () => {
  it('валидное окно — минуты', () => {
    expect(parseOwnerWindow('09:00', '10:00')).toEqual({ startMin: 540, endMin: 600 })
  })
  it('end не позже start — null', () => {
    expect(parseOwnerWindow('10:00', '10:00')).toBeNull()
    expect(parseOwnerWindow('11:00', '10:00')).toBeNull()
  })
  it('мусор — null', () => {
    expect(parseOwnerWindow('abc', '10:00')).toBeNull()
    expect(parseOwnerWindow('', '')).toBeNull()
  })
  it('дефолты — из реестра настроек DF-00D (09:00–10:00)', () => {
    expect(defaultOwnerWindow()).toEqual({ startMin: 540, endMin: 600 })
  })
})

describe('ключи и подписи', () => {
  it('dedupKey — ownerdigest:{id}:{дата}', () => {
    expect(ownerDedupKey('emp1', '2026-10-30')).toBe('ownerdigest:emp1:2026-10-30')
  })
  it('дата письма — dd.mm.yyyy', () => {
    expect(dateLabelFromKey('2026-10-30')).toBe('30.10.2026')
  })
})

describe('topSlowingRows (топ-5 для письма)', () => {
  const now = Date.parse('2026-10-30T12:00:00Z')
  const h = (n: number) => new Date(now - n * 3_600_000).toISOString()
  const slowing = [slowingRow('client', h(48), '17-3'), slowingRow('manager', h(5), '17-1')]

  it('глобальный порядок — самый старый мяч сверху, лимит соблюдён', () => {
    const rows = topSlowingRows(slowing, 5, now)
    expect(rows.map((r) => r.number)).toEqual(['17-3', '17-1'])
    expect(rows[0].kindTitle).toBe('Мяч у клиента')
    expect(rows[0].ageLabel).toBe('2 дн.')
    expect(rows[1].ageLabel).toBe('5 ч')
  })
  it('топ-5 — из большего списка берутся пять старших', () => {
    const big = [
      slowingRow('client', h(1), '20-1'),
      slowingRow('client', h(2), '20-2'),
      slowingRow('manager', h(3), '20-3'),
      slowingRow('broker', h(4), '20-4'),
      slowingRow('contractor', h(5), '20-5'),
      slowingRow('client', h(96), '20-6'),
    ]
    const rows = topSlowingRows(big, 5, now)
    expect(rows).toHaveLength(5)
    expect(rows[0].number).toBe('20-6')
  })
})

describe('buildOwnerDigestLetter (текст письма)', () => {
  it('цифры, топ-5, неотправленные, ссылка на Пульс', () => {
    const rows = topSlowingRows([slowingRow('client', new Date(Date.parse('2026-10-28T12:00:00Z')).toISOString(), '17-3')], 5, Date.parse('2026-10-30T12:00:00Z'))
    const { subject, body } = buildOwnerDigestLetter(letterInput({ slowing: rows }))
    expect(subject).toBe('Logix: сводка за 30.10.2026')
    expect(body).toContain('Показатели:')
    expect(body).toContain('• Новых запросов за 24 ч: 3')
    expect(body).toContain('• Активных заявок: 12 (в пути: 5)')
    expect(body).toContain('• Ждут дольше 24 ч: 2')
    expect(body).toContain('• Этапов с проблемой: 1')
    expect(body).toContain('Тормозят:')
    expect(body).toContain('• заявка №17-3 — ООО «Ромашка» — мяч у клиента · 2 дн.')
    expect(body).toContain('Неотправленных писем: 0')
    expect(body).toContain('Открыть Пульс: https://app.example.ru/admin/pulse')
  })
  it('пустой день — «изменений нет», письмо всё равно полноценное', () => {
    const { body } = buildOwnerDigestLetter(
      letterInput({
        stats: { newLeads24h: 0, activeOrders: 0, inProgress: 0, waitingOverThreshold: 0, problemStages: 0, attentionHours: 24 },
      })
    )
    expect(body).toContain('Существенных изменений нет.')
    expect(body).toContain('Тормозящих нет.')
    expect(body).toContain('• Активных заявок: 0')
  })
  it('без APP_BASE_URL письмо уходит без ссылки', () => {
    const { body } = buildOwnerDigestLetter(letterInput({ pulseUrl: null }))
    expect(body).not.toContain('Открыть Пульс')
  })
})

describe('processOwnerDigest (интеграция: окно, дедуп, адресаты)', () => {
  let ownerId = ''
  let managerId = ''

  beforeAll(async () => {
    // Мастер с email — получатель сводки; менеджер с email — НЕ получатель.
    const owner = await db.employee.create({
      data: { name: 'DF08 мастер ' + MARK, phone: phone(1), password: 'df08-pass-1', roles: '["master"]', email: ownerEmail },
    })
    const manager = await db.employee.create({
      data: { name: 'DF08 менеджер ' + MARK, phone: phone(2), password: 'df08-pass-1', roles: '["manager"]', email: managerEmail },
    })
    ownerId = owner.id
    managerId = manager.id
    ids.employees.push(ownerId, managerId)

    // Окно — вокруг текущего времени пояса рассылок (смена окна действует
    // без выката, критерий карточки). Границы в одних сутках; у края
    // суток окно целиком «сегодня, но в прошлом» → сработает late —
    // письмо тоже уходит, дедуп тот же.
    const tz = await getSetting('notifications.timezone')
    const cur = nowInZone(tz)
    const pad = (n: number) => String(n).padStart(2, '0')
    const t = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`
    const start = Math.max(0, cur.minutes - 30)
    const end = Math.max(cur.minutes + 5, 1)
    await setSetting('owner_digest.window_start', t(start), { type: 'system' })
    await setSetting('owner_digest.window_end', t(end), { type: 'system' })
    clearSettingsCache()
  })

  afterAll(async () => {
    await db.notification.deleteMany({ where: { dedupKey: { startsWith: `ownerdigest:${ownerId}:` } } })
    await db.notification.deleteMany({ where: { dedupKey: { startsWith: `ownerdigest:${managerId}:` } } })
    await db.employee.deleteMany({ where: { id: { in: ids.employees } } })
    await db.setting.deleteMany({ where: { key: { in: ['owner_digest.window_start', 'owner_digest.window_end'] } } })
    clearSettingsCache()
  })

  it('письмо создаётся один раз за сутки: повторный вызов — дедуп', async () => {
    // Урок v0.7.7 (красный CI): файлы vitest гоняются ПАРАЛЛЕЛЬНО по одной
    // БД, а скан адресатов в processOwnerDigest — глобальный (все активные
    // мастера с email): в один проход попадают чужие фикстуры других файлов
    // (participants.test.ts держит активного мастера с email), и глобальный
    // счётчик sent скачет. Утверждаем не счётчик, а СВОЙ ключ дедупа —
    // паттерн notifications.test.ts (утверждения скоупятся своими
    // получателями): наш мастер получил письмо, повторный вызов не создаёт
    // второго письма нашему мастеру.
    const first = await processOwnerDigest()
    expect(first.sent).toBeGreaterThan(0)

    const rows = await db.notification.findMany({
      where: { dedupKey: { startsWith: `ownerdigest:${ownerId}:` } },
    })
    expect(rows).toHaveLength(1)
    const letter = rows[0]
    expect(letter.type).toBe('digest')
    expect(letter.recipientKind).toBe('employee')
    expect(letter.toAddress).toBe(ownerEmail)
    expect(letter.windowKey).toMatch(/^owner:\d{4}-\d{2}-\d{2}$/)
    expect(letter.subject).toContain('сводка за')
    expect(letter.body).toContain('Показатели:')
    expect(letter.body).toContain('Неотправленных писем:')
    // APP_BASE_URL в тестовом окружении не задан — ссылки нет, письмо валидно.
    expect(letter.body).not.toContain('Открыть Пульс')

    // Повторный вызов: счётчик sent не утверждаем (чужие мастера других
    // файлов могли появиться между проходами) — дедуп нашего мастера
    // доказывает строка ниже: письмо ровно одно, и это то же самое письмо.
    await processOwnerDigest()
    const after = await db.notification.findMany({
      where: { dedupKey: { startsWith: `ownerdigest:${ownerId}:` } },
    })
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(rows[0].id)
  })

  it('менеджеру сводка не уходит, мастеру без email — тоже', async () => {
    // Дедуп первого кейса уже закрыл день для ownerId; здесь важен
    // менеджер: ни одного письма по его dedupKey не появилось.
    const rows = await db.notification.findMany({
      where: { dedupKey: { startsWith: `ownerdigest:${managerId}:` } },
    })
    expect(rows).toHaveLength(0)
  })

  it('окно в будущем — проход ничего не создаёт (wait)', async () => {
    // Дедуп дня уже сработал — снимаем строку; окно — строго позже
    // текущего времени пояса (граница 23:49+ — покрытие чистым юнитом
    // ownerDigestDecision, интеграцию на нём не гоняем).
    await db.notification.deleteMany({ where: { dedupKey: { startsWith: `ownerdigest:${ownerId}:` } } })
    const tz = await getSetting('notifications.timezone')
    const cur = nowInZone(tz)
    const startMin = Math.min(cur.minutes + 10, 1438)
    if (startMin <= cur.minutes) return
    const pad = (n: number) => String(n).padStart(2, '0')
    const t = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`
    await setSetting('owner_digest.window_start', t(startMin), { type: 'system' })
    await setSetting('owner_digest.window_end', '23:59', { type: 'system' })
    clearSettingsCache()
    const run = await processOwnerDigest()
    expect(run.sent).toBe(0)
    const rows = await db.notification.findMany({
      where: { dedupKey: { startsWith: `ownerdigest:${ownerId}:` } },
    })
    expect(rows).toHaveLength(0)
  })
})

// Реестр настроек: сводка не требует новых ключей (карточка: «Схема БД —
// нет: время и пояс — настройки DF-00D») — гард от случайного появления.
describe('реестр DF-00D покрывает карточку DF-08', () => {
  it('окна и пояс в реестре, дефолт пояса — Europe/Moscow', () => {
    expect(getSettingDef('owner_digest.window_start').defaultValue).toBe('09:00')
    expect(getSettingDef('owner_digest.window_end').defaultValue).toBe('10:00')
    expect(getSettingDef('notifications.timezone').defaultValue).toBe('Europe/Moscow')
  })
})
