// ─── DF-17: справочные данные — ВАЛЮТЫ (ISO 4217) ────────────────────
// Источник: ISO 4217 (трёхбуквенные коды, число знаков после запятой —
// minor unit). Условия использования — docs/REFERENCES-SOURCES.md.
//
// ДАННЫЕ ДЛЯ СИДА (IC-16). По умолчанию ВКЛЮЧЕНЫ четыре валюты
// (карточка DF-17: RUB, USD, EUR, CNY); остальные ходовые в ВЭД —
// в справочнике, но ОТКЛЮЧЕНЫ (master включает через экран — e2e
// проверяет «отключённая валюта исчезает из форм»). minorUnits —
// число знаков после запятой стандарта.
export type CurrencySeed = {
  code: string
  name: string
  nameEn: string
  minorUnits: number
  active: boolean
}

export const CURRENCY_ITEMS: CurrencySeed[] = [
  { code: 'RUB', name: 'Российский рубль', nameEn: 'Russian Ruble', minorUnits: 2, active: true },
  { code: 'USD', name: 'Доллар США', nameEn: 'US Dollar', minorUnits: 2, active: true },
  { code: 'EUR', name: 'Евро', nameEn: 'Euro', minorUnits: 2, active: true },
  { code: 'CNY', name: 'Юань', nameEn: 'Yuan Renminbi', minorUnits: 2, active: true },

  { code: 'KZT', name: 'Тенге', nameEn: 'Tenge', minorUnits: 2, active: false },
  { code: 'BYN', name: 'Белорусский рубль', nameEn: 'Belarussian Ruble', minorUnits: 2, active: false },
  { code: 'UAH', name: 'Гривна', nameEn: 'Hryvnia', minorUnits: 2, active: false },
  { code: 'UZS', name: 'Узбекский сум', nameEn: 'Uzbek Sum', minorUnits: 2, active: false },
  { code: 'KGS', name: 'Сом', nameEn: 'Som', minorUnits: 2, active: false },
  { code: 'TJS', name: 'Сомони', nameEn: 'Somoni', minorUnits: 2, active: false },
  { code: 'TMT', name: 'Туркменский манат', nameEn: 'Turkmenistan New Manat', minorUnits: 2, active: false },
  { code: 'AZN', name: 'Азербайджанский манат', nameEn: 'Azerbaijan Manat', minorUnits: 2, active: false },
  { code: 'AMD', name: 'Армянский драм', nameEn: 'Armenian Dram', minorUnits: 2, active: false },
  { code: 'GEL', name: 'Лари', nameEn: 'Lari', minorUnits: 2, active: false },
  { code: 'TRY', name: 'Турецкая лира', nameEn: 'Turkish Lira', minorUnits: 2, active: false },
  { code: 'AED', name: 'Дирхам (ОАЭ)', nameEn: 'UAE Dirham', minorUnits: 2, active: false },
  { code: 'GBP', name: 'Фунт стерлингов', nameEn: 'Pound Sterling', minorUnits: 2, active: false },
  { code: 'CHF', name: 'Швейцарский франк', nameEn: 'Swiss Franc', minorUnits: 2, active: false },
  { code: 'JPY', name: 'Иена', nameEn: 'Yen', minorUnits: 0, active: false },
  { code: 'KRW', name: 'Вона', nameEn: 'Won', minorUnits: 0, active: false },
  { code: 'HKD', name: 'Гонконгский доллар', nameEn: 'Hong Kong Dollar', minorUnits: 2, active: false },
  { code: 'SGD', name: 'Сингапурский доллар', nameEn: 'Singapore Dollar', minorUnits: 2, active: false },
  { code: 'INR', name: 'Индийская рупия', nameEn: 'Indian Rupee', minorUnits: 2, active: false },
  { code: 'THB', name: 'Бат', nameEn: 'Baht', minorUnits: 2, active: false },
  { code: 'VND', name: 'Донг', nameEn: 'Dong', minorUnits: 0, active: false },
  { code: 'IDR', name: 'Рупия', nameEn: 'Rupiah', minorUnits: 2, active: false },
  { code: 'MYR', name: 'Малайзийский ринггит', nameEn: 'Malaysian Ringgit', minorUnits: 2, active: false },
  { code: 'PLN', name: 'Злотый', nameEn: 'Zloty', minorUnits: 2, active: false },
  { code: 'CZK', name: 'Чешская крона', nameEn: 'Czech Koruna', minorUnits: 2, active: false },
  { code: 'SEK', name: 'Шведская крона', nameEn: 'Swedish Krona', minorUnits: 2, active: false },
  { code: 'NOK', name: 'Норвежская крона', nameEn: 'Norwegian Krone', minorUnits: 2, active: false },
  { code: 'DKK', name: 'Датская крона', nameEn: 'Danish Krone', minorUnits: 2, active: false },
]
