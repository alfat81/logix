import { describe, it, expect } from 'vitest'
import { businessDaysElapsed } from '@/lib/business-days'

// ─── D45: рабочие дни (пн–пт, МСК) ───────────────────────────────────
// Гранулярность — MSK-день: считаются рабочие дни ПОСЛЕ MSK-дня якоря,
// включая текущий. «Через 2 рабочих дня» = 00:00 МСК второго рабочего
// дня после якоря (пт → сб/вс пропущены → во вторник).

// Полдень UTC = 15:00 МСК — середина MSK-дня, безопасно для границ.
const utc = (y: number, m: number, d: number, hh = 12, mm = 0) =>
  new Date(Date.UTC(y, m, d, hh, mm))

describe('businessDaysElapsed (D45, пн–пт МСК)', () => {
  it('тот же момент → 0', () => {
    const t = utc(2026, 10, 2) // пн 02.11.2026
    expect(businessDaysElapsed(t, t)).toBe(0)
  })

  it('now раньше якоря (мусор) → 0', () => {
    expect(businessDaysElapsed(utc(2026, 10, 5), utc(2026, 10, 2))).toBe(0)
  })

  it('в пределах MSK-дня якоря → 0 (пн 15:00 МСК → пн 18:00 МСК)', () => {
    expect(businessDaysElapsed(utc(2026, 10, 2, 12), utc(2026, 10, 2, 15))).toBe(0)
  })

  it('следующий рабочий день → 1 (пн → вт)', () => {
    expect(businessDaysElapsed(utc(2026, 10, 2), utc(2026, 10, 3))).toBe(1)
  })

  it('два рабочих дня → 2 (пн → ср): порог «через 2 рабочих дня»', () => {
    expect(businessDaysElapsed(utc(2026, 10, 2), utc(2026, 10, 4))).toBe(2)
  })

  it('пт → пн = 1 (выходные не считаются)', () => {
    expect(businessDaysElapsed(utc(2026, 9, 30), utc(2026, 10, 2))).toBe(1)
  })

  it('пт → вт = 2 (сб/вс пропущены — плашка во вторник)', () => {
    expect(businessDaysElapsed(utc(2026, 9, 30), utc(2026, 10, 3))).toBe(2)
  })

  it('якорь в субботу → пн = 1', () => {
    expect(businessDaysElapsed(utc(2026, 9, 31), utc(2026, 10, 2))).toBe(1)
  })

  it('якорь в воскресенье → вт = 2 (1 ноября 2026 — вс)', () => {
    expect(businessDaysElapsed(utc(2026, 10, 1), utc(2026, 10, 3))).toBe(2)
  })

  it('день считается по МСК, не по UTC: якорь ср 21:00 UTC = чт 00:00 МСК, теперь чт 23:00 МСК → 0 (в пределах MSK-дня якоря)', () => {
    // По UTC-календарю якорь — среда и чт 20:00 UTC дало бы чт(1);
    // по МСК якорь уже четверг, а «после четверга» до четверга — ничего.
    expect(businessDaysElapsed(utc(2026, 9, 28, 21), utc(2026, 9, 29, 20))).toBe(0)
  })

  it('граница месяца: пт 30.01 → вт 03.02 = 2 (пн 02.02, вт 03.02)', () => {
    expect(businessDaysElapsed(utc(2026, 0, 30), utc(2026, 1, 3))).toBe(2)
  })

  it('две полные недели → 10 рабочих дней (пн → пн через неделю+)', () => {
    expect(businessDaysElapsed(utc(2026, 10, 2), utc(2026, 10, 16))).toBe(10)
  })

  it('D45-эскалация: якорь ср 20:59 UTC (23:59 МСК) → пт 00:00 МСК (чт 21:00 UTC) = ровно 2 р.д. при ~24 ч реального времени', () => {
    const anchor = utc(2026, 9, 28, 20, 59) // ср 23:59 МСК
    expect(businessDaysElapsed(anchor, utc(2026, 9, 29, 20, 59))).toBe(1) // чт — ещё нет
    expect(businessDaysElapsed(anchor, utc(2026, 9, 29, 21, 0))).toBe(2) // пт 00:00 МСК — да
  })
})
