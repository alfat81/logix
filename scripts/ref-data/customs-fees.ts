// ─── DF-19: справочные данные — ТАМОЖЕННЫЕ СБОРЫ (шкала «ТС → сбор») ──
// Редакция с 01.01.2026: постановление Правительства РФ от 28.11.2024
// № 1637 в редакции ПП от 23.10.2025 № 1638. Скобка 2,7–4,2 млн ₽ →
// 18 465 ₽ подтверждена эталонными ДТ №2–№3 (сверка шага 1 DF-19,
// 30.10.2026); полная шкала сверена по вторичным источникам — строки
// «ТС не определяется» (по числу товаров) в расчёте не участвуют и в
// сид не включены (реквизиты сверяются по IC-16 —
// docs/REFERENCES-SOURCES.md, раздел «Таможенные сборы»).
//
// ДАННЫЕ ДЛЯ СИДА (IC-16: единственный источник — справочник в БД,
// CustomsFeeScale; файл импортирует ТОЛЬКО scripts/seed.ts).
//
// validFrom — дата вступления редакции в силу (обязательное поле
// карточки: шкала индексируется, смена ПП = новая редакция с новой
// датой, при пересиде строки редакции заменяются целиком).
// upperBound — верхняя граница ТС, ₽ (включительно); null — открытая
// верхняя скобка. Сбор считается от ОБЩЕЙ ТС одной ступенью.
export type CustomsFeeSeed = {
  validFrom: string // yyyy-mm-dd
  upperBound: number | null
  feeRub: number
  sortOrder: number
}

export const CUSTOMS_FEE_SCALE_EDITIONS: CustomsFeeSeed[] = [
  // ── Редакция с 01.01.2026 (ПП РФ № 1637 в ред. ПП № 1638) ──
  { validFrom: '2026-01-01', upperBound: 200000, feeRub: 1231, sortOrder: 0 },
  { validFrom: '2026-01-01', upperBound: 450000, feeRub: 2462, sortOrder: 1 },
  { validFrom: '2026-01-01', upperBound: 1200000, feeRub: 4924, sortOrder: 2 },
  { validFrom: '2026-01-01', upperBound: 2700000, feeRub: 13541, sortOrder: 3 },
  { validFrom: '2026-01-01', upperBound: 4200000, feeRub: 18465, sortOrder: 4 },
  { validFrom: '2026-01-01', upperBound: 5500000, feeRub: 21344, sortOrder: 5 },
  { validFrom: '2026-01-01', upperBound: 10000000, feeRub: 49240, sortOrder: 6 },
  { validFrom: '2026-01-01', upperBound: null, feeRub: 73860, sortOrder: 7 },
]
