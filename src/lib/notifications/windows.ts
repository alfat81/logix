// ─── DF-03: математика окон рассылок (таймзона без зависимостей) ─────
// Окна — настройка notifications.client_digest_times (['09:00','16:00']),
// пояс — notifications.timezone (по умолчанию Europe/Moscow). Все
// вычисления — через Intl (встроенный), новых зависимостей нет (§4:
// зависимость только с обоснованием; Intl покрывает IANA-пояса).
//
// Правило выполнения окна (карточка DF-03 + критерий приёмки):
// «окно считается выполненным, если вызов пришёл в течение 15 минут
// после его начала» — погрешность внешнего планировщика (GitHub
// Actions) допускается явно. Пропущенное окно (cron лежал дольше)
// НЕ отправляется: содержимое уезжает в следующее окно (строки
// остаются pending — ничего не теряется).

export type ZonedNow = {
  // Календарная дата в поясе: yyyy-mm-dd (ключ суток для лимитов).
  dateStr: string
  // Время в поясе: HH:MM.
  timeStr: string
  // Минуты от полуночи в поясе (0..1439).
  minutes: number
}

export function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => Number.parseInt(x, 10))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1
  return h * 60 + m
}

// Текущее «настенное» время в поясе IANA.
export function nowInZone(tz: string, at: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`
  // hour12:false может дать '24' в некоторых средах — нормализуем.
  const hour = get('hour') === '24' ? '00' : get('hour')
  const timeStr = `${hour}:${get('minute')}`
  return { dateStr, timeStr, minutes: parseTimeToMinutes(timeStr) }
}

// Допуск планировщика (карточка DF-03): окно выполняется, если вызов
// пришёл в течение 15 минут после его начала.
export const WINDOW_GRACE_MINUTES = 15

// Первое окно, которое пора исполнять прямо сейчас (с учётом допуска),
// или null.
export function dueWindow(windows: readonly string[], tz: string, at: Date = new Date()): string | null {
  const now = nowInZone(tz, at)
  for (const w of windows) {
    const start = parseTimeToMinutes(w)
    if (start < 0) continue
    if (now.minutes >= start && now.minutes <= start + WINDOW_GRACE_MINUTES) return w
  }
  return null
}

// Ключ окна: «yyyy-mm-dd:HH:MM» в поясе рассылок (Notification.windowKey,
// дедупликация дайджеста и лимит «в сутки» считаются по этой дате).
export function windowKeyOf(tz: string, windowTime: string, at: Date = new Date()): string {
  return `${nowInZone(tz, at).dateStr}:${windowTime}`
}

// Двухпроходное преобразование «настенное время в поясе» → UTC Date
// (учитывает сдвиг пояса на нужную дату; для Europe/Moscow сдвиг
// постоянен, алгоритм общий — пояс является настройкой).
export function zonedWallTimeToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [h, m] = timeStr.split(':').map((x) => Number.parseInt(x, 10))
  let guess = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  for (let i = 0; i < 2; i += 1) {
    const zoned = nowInZone(tz, guess)
    const [zh, zm] = zoned.timeStr.split(':').map((x) => Number.parseInt(x, 10))
    const target = parseTimeToMinutes(timeStr)
    const actual = zh * 60 + zm
    const diffMin = target - actual
    if (diffMin === 0) break
    guess = new Date(guess.getTime() + diffMin * 60_000)
  }
  return guess
}

// Ближайшее время СЛЕДУЮЩЕГО окна (для отложенных «красных» сверх
// лимита: «в ближайшее окно с пометкой "срочно"» — D33). Окна раньше
// текущего времени (и текущее, если допуск прошёл) — на завтра.
export function nextWindowTime(windows: readonly string[], tz: string, at: Date = new Date()): Date | null {
  if (windows.length === 0) return null
  const now = nowInZone(tz, at)
  const sorted = [...windows].sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b))
  for (const w of sorted) {
    const start = parseTimeToMinutes(w)
    if (start > now.minutes) return zonedWallTimeToUtc(now.dateStr, w, tz)
  }
  // Все окна сегодня прошли — первое окно завтра (дата +1 день в поясе).
  const nextDay = new Date(at.getTime() + 24 * 60 * 60_000)
  const tomorrow = nowInZone(tz, nextDay).dateStr
  return zonedWallTimeToUtc(tomorrow, sorted[0], tz)
}
