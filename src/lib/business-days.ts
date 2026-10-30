// ─── D45: рабочие дни (пн–пт, МСК) ───────────────────────────────────
// Чистый модуль без серверных зависимостей (как waiting.ts): нужен
// правилу «выбор расчёта не сделан 2 рабочих дня» (waiting.ts), роуту
// внимания и плашке WaitingBadge.
//
// Календарь — пн–пт по МОСКВЕ (UTC+3, без перехода на летнее время,
// поэтому сдвиг константой). Гос. праздники РФ НЕ учитываются —
// осознанное допущение D45: календарь праздников меняется постановлениями
// каждый год; когда потребуется точность до праздника — отдельный
// справочник (как CustomsFeeScale), правило станет консервативнее
// (плашка появится днём позже), не раньше.

// Сдвиг МСК от UTC: якорь ожидания хранится в UTC, а «рабочий день»
// определяется по календарю Москвы.
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

// Сколько рабочих дней (пн–пт, МСК) прошло ПОСЛЕ MSK-дня якоря,
// включая текущий MSK-день. Гранулярность — день: «через 2 рабочих
// дня» наступает в 00:00 МСК второго рабочего дня после якоря
// (пт → сб/вс пропущены → плашка во вторник).
export function businessDaysElapsed(fromUtc: Date, nowUtc: Date): number {
  if (nowUtc.getTime() <= fromUtc.getTime()) return 0
  const from = new Date(fromUtc.getTime() + MSK_OFFSET_MS)
  const to = new Date(nowUtc.getTime() + MSK_OFFSET_MS)
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  let count = 0
  let guard = 0
  for (let t = start + DAY_MS; t <= end; t += DAY_MS) {
    const dow = new Date(t).getUTCDay()
    if (dow !== 0 && dow !== 6) count += 1
    // Защита от мусорных дат (waitingSince в далёком прошлом): цикл
    // не длиннее ~8 лет дней, дальше считаем приблизительно 5/7.
    if (++guard >= 3000) {
      const restDays = Math.floor((end - t) / DAY_MS)
      return count + Math.floor((restDays * 5) / 7)
    }
  }
  return count
}
