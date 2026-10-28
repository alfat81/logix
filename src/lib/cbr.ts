import { db } from '@/lib/db'

// ─── DF-17: курсы ЦБ РФ — ежедневный импорт проходом диспетчера ──────
// Источник — официальный XML ЦБ (cbr.ru/development/sxml):
//   http://www.cbr.ru/scripts/XML_daily.asp?date_req=ДД/ММ/ГГГГ
// без date_req — последняя зарегистрированная дата (курс, установленный
// накануне; публикация до ~15:30 МСК на следующий день — проверено,
// docs/REFERENCES-SOURCES.md). Бесплатный открытый источник (D37/O-10),
// платные сервисы не подключаются.
//
// Формат: windows-1251 (перекодируем сами — TextDecoder('windows-1251')),
// значения с запятой как десятичным разделителем («79,7653»), НОМИНАЛ
// (у JPY/KRW/HUF — 100/1000 единиц на курс), VunitRate = курс одной
// единицы (в новых выгрузках; если нет — Value/Номинал).
//
// Идемпотентность: (date, code) unique + upsert — повторный проход не
// дублирует; валидные строки за уже импортированную дату не ломают.
// Сбой сети/разбора НЕ валит проход диспетчера — расчёты (DF-19)
// используют последний известный курс с пометкой даты.

const CBR_URL = process.env.CBR_RATE_URL ?? 'https://www.cbr.ru/scripts/XML_daily.asp'
// Выключатель для CI/e2e (без внешней сети): CBR_IMPORT=off.
export function cbrImportEnabled(): boolean {
  return (process.env.CBR_IMPORT ?? 'on').trim().toLowerCase() !== 'off'
}

export type CbrRate = { code: string; nominal: number; value: number }

// Строгое число из формата ЦБ: «79,7653» / «1 234,56» → number; мусор → null.
export function parseCbrNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s|\u00a0/g, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// Разбор XML без зависимостей (нулевая поверхность атаки вместо парсера):
// блоки <Valute>…</Valute>, внутри CharCode (ISO), Nominal, Value,
// VunitRate, Date в шапке ValCurs Date="dd.mm.yyyy".
export function parseCbrXml(xml: string): { date: string; rates: CbrRate[] } {
  const dateMatch = /Date="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml)
  if (!dateMatch) throw new Error('Курсы ЦБ: в ответе нет даты выгрузки')
  const date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`

  const rates: CbrRate[] = []
  const blocks = xml.split(/<Valute[^>]*>/).slice(1)
  for (const block of blocks) {
    const end = block.indexOf('</Valute>')
    if (end === -1) continue
    const body = block.slice(0, end)
    const code = /<CharCode>([^<]+)<\/CharCode>/.exec(body)?.[1]?.trim().toUpperCase()
    if (!code || !/^[A-Z]{3}$/.test(code)) continue
    const nominal = parseCbrNumber(/<Nominal>([^<]+)<\/Nominal>/.exec(body)?.[1] ?? '')
    // VunitRate приоритетен: курс одной единицы (номинал уже учтён).
    const vunit = parseCbrNumber(/<VunitRate>([^<]+)<\/VunitRate>/.exec(body)?.[1] ?? '')
    const value = parseCbrNumber(/<Value>([^<]+)<\/Value>/.exec(body)?.[1] ?? '')
    let perUnit: number | null = null
    if (vunit !== null) perUnit = vunit
    else if (value !== null && nominal !== null && nominal > 0) perUnit = value / nominal
    if (perUnit === null || !Number.isFinite(perUnit) || perUnit <= 0) continue
    rates.push({ code, nominal: nominal ?? 1, value: Math.round(perUnit * 10000) / 10000 })
  }
  return { date, rates }
}

// Сегодняшняя дата в Москве (yyyy-mm-dd): курс считается «у нас» по МСК —
// публикация ЦБ привязана к московскому дню.
export function mskToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date())
}

export type RatesImportResult = { imported: number; date: string | null; skipped: boolean; error?: string }

// Импорт курсов за последний доступный день. Возвращается число
// СИМУЛЯЦИЙ ЗАПИСЕЙ (upsert: созданные или обновлённые), 0 — если курс
// за последний день уже в базе (нормальный случай при проходах каждые
// 5 минут: импорт делается раз в сутки, остальное — короткое замыкание).
export async function importCbrRates(): Promise<RatesImportResult> {
  if (!cbrImportEnabled()) return { imported: 0, date: null, skipped: true }
  // Короткое замыкание: курс за сегодня (МСК) уже есть — ЦБ публикует
  // раз в сутки, ходить по сети каждые 5 минут незачем.
  const today = mskToday()
  const latest = await db.currencyRate.findFirst({ orderBy: [{ date: 'desc' }], select: { date: true } })
  if (latest && latest.date.toISOString().slice(0, 10) >= today) {
    return { imported: 0, date: latest.date.toISOString().slice(0, 10), skipped: true }
  }
  try {
    const res = await fetch(CBR_URL, {
      headers: { 'User-Agent': 'logix/0.6 (+internal rate import)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`ЦБ ответил ${res.status}`)
    // windows-1251 → UTF-8 (формат источника, см. шапку).
    const buf = await res.arrayBuffer()
    const xml = new TextDecoder('windows-1251').decode(buf)
    const { date, rates } = parseCbrXml(xml)
    if (rates.length === 0) throw new Error('Курсы ЦБ: пустая выгрузка')
    const day = new Date(`${date}T00:00:00.000Z`)
    let imported = 0
    for (const r of rates) {
      await db.currencyRate.upsert({
        where: { date_code: { date: day, code: r.code } },
        create: { date: day, code: r.code, nominal: r.nominal, value: r.value },
        update: { nominal: r.nominal, value: r.value },
      })
      imported += 1
    }
    return { imported, date, skipped: false }
  } catch (e) {
    // Сбой импорта не валит проход диспетчера (письма важнее курсов).
    console.error('[cbr] импорт курсов не удался:', e)
    return { imported: 0, date: null, skipped: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}
