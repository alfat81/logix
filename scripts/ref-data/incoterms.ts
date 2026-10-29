// ─── DF-17: справочные данные — УСЛОВИЯ ПОСТАВКИ (Инкотермс 2020) ─────
// Источник названий: свод Инкотермс 2020 (11 терминов) — публичный
// стандарт делового оборота; ПОЛНЫЕ ТЕКСТЫ ICC не копируются
// (авторское право) — разъяснения здесь СОБСТВЕННЫЕ формулировки,
// названия терминов и официальные английские полные имена — только
// как идентификация. Условия использования — docs/REFERENCES-SOURCES.md.
//
// ДАННЫЕ ДЛЯ СИДА (IC-16: единственный источник выбора — справочник в
// БД; файл импортирует ТОЛЬКО scripts/seed.ts).
//
// meta — правила для таможенной стоимости В СТРУКТУРИРОВАННОМ ВИДЕ
// (карточка DF-17, их читает DF-19): addFreightToArrival — фрахт до
// места прибытия на территорию ЕАЭС добавляется к стоимости товара;
// addInsurance — страхование добавляется (не включено в цену);
// deductPostArrival — перевозка после места прибытия включена в цену
// продавца и может вычитаться при документальном подтверждении;
// placeKind — смысл указанного места (для формы подсказки);
// warning — предупреждение особого случая (DDP и др.).
//
// ВАЖНО (O-12, обновлено D44): таблица флагов УТВЕРЖДЕНА брокером для
// тестового контура 30.10.2026 («утверждаю», «в тестовой версии
// оставляем эти» — справочник редактируемый). Draft-пометка снята
// релизом 0.7.0 с пометкой об утверждении; операционное подтверждение
// на прод — после первого живого расчёта, сошедшегося с фактической
// ДТ (карточка DF-19, шаг 1). Расчёт (DF-19) черновые правила
// (meta.draft: true, если вернутся) не применяет.
export type IncotermSeed = {
  code: string
  name: string
  nameEn: string
  active: boolean
  meta: {
    explanation: string
    transport: ('any' | 'sea')[]
    placeKind: 'origin' | 'port_dispatch' | 'border' | 'port_arrival' | 'destination'
    addFreightToArrival?: boolean
    addInsurance?: boolean
    deductPostArrival?: boolean
    warning?: string
    draft: boolean
  }
}

export const INCOTERM_ITEMS: IncotermSeed[] = [
  {
    code: 'EXW',
    name: 'Франко-завод (с склада продавца)',
    nameEn: 'Ex Works',
    active: true,
    meta: {
      explanation:
        'Продавец передаёт товар в своём помещении, не грузит и не вывозит: ' +
        'с этого момента все расходы и риски — на покупателе. Вывоз, ' +
        'экспортное оформление, основная перевозка, страхование и импорт — ' +
        'организует и оплачивает покупатель. Указанное место — помещение ' +
        'продавца.',
      transport: ['any'],
      placeKind: 'origin',
      addFreightToArrival: true,
      addInsurance: true,
      draft: false,
    },
  },
  {
    code: 'FCA',
    name: 'Франко-перевозчик',
    nameEn: 'Free Carrier',
    active: true,
    meta: {
      explanation:
        'Продавец передаёт товар перевозчику, назначенному покупателем. ' +
        'Если место — помещение продавца, продавец грузит товар на транспорт; ' +
        'если иное место — доставляет туда готовым к разгрузке. Экспортное ' +
        'оформление — продавец. Дальнейшая перевозка, страхование и импорт — ' +
        'покупатель.',
      transport: ['any'],
      placeKind: 'origin',
      addFreightToArrival: true,
      addInsurance: true,
      draft: false,
    },
  },
  {
    code: 'CPT',
    name: 'Перевозка оплачена до (места назначения)',
    nameEn: 'Carriage Paid To',
    active: true,
    meta: {
      explanation:
        'Продавец оплачивает основную перевозку до названного места ' +
        'назначения и передаёт товар своему перевозчику. Риск переходит ' +
        'в момент передачи первому перевозчику — раньше, чем товар прибудет ' +
        'в место назначения. Экспорт — продавец, импорт — покупатель. ' +
        'Страхование никто не обязан покупать.',
      transport: ['any'],
      placeKind: 'destination',
      addFreightToArrival: false,
      deductPostArrival: true,
      draft: false,
    },
  },
  {
    code: 'CIP',
    name: 'Перевозка и страхование оплачены до',
    nameEn: 'Carriage and Insurance Paid To',
    active: true,
    meta: {
      explanation:
        'Как CPT: продавец оплачивает перевозку до места назначения, риск ' +
        'переходит при передаче первому перевозчику. Плюс продавец ' +
        'обязан застраховать груз в пользу покупателя (в редакции 2020 — ' +
        'на максимальном покрытии, если не согласовано иное). Экспорт — ' +
        'продавец, импорт — покупатель.',
      transport: ['any'],
      placeKind: 'destination',
      addFreightToArrival: false,
      addInsurance: false,
      deductPostArrival: true,
      draft: false,
    },
  },
  {
    code: 'DAP',
    name: 'Доставлено в месте назначения',
    nameEn: 'Delivered at Place',
    active: true,
    meta: {
      explanation:
        'Продавец доставляет товар в названное место назначения и передаёт ' +
        'его покупателю на прибывшем транспорте, готовым к разгрузке — ' +
        'разгружает покупатель. Экспортное оформление — продавец; импорт, ' +
        'включая пошлины и налоги, — покупатель.',
      transport: ['any'],
      placeKind: 'destination',
      addFreightToArrival: false,
      addInsurance: false,
      deductPostArrival: true,
      draft: false,
    },
  },
  {
    code: 'DPU',
    name: 'Доставлено и разгружено в месте назначения',
    nameEn: 'Delivered at Place Unloaded',
    active: true,
    meta: {
      explanation:
        'Единственное условие, при котором продавец разгружает товар в месте ' +
        'назначения. Дальше как DAP: доставка — продавец, экспорт — продавец, ' +
        'импорт с пошлинами и налогами — покупатель.',
      transport: ['any'],
      placeKind: 'destination',
      addFreightToArrival: false,
      addInsurance: false,
      deductPostArrival: true,
      draft: false,
    },
  },
  {
    code: 'DDP',
    name: 'Поставлено с оплатой пошлин',
    nameEn: 'Delivered Duty Paid',
    active: true,
    meta: {
      explanation:
        'Продавец несёт все расходы и риски до места назначения, включая ' +
        'импортное оформление с оплатой пошлин и налогов. Покупатель только ' +
        'принимает готовый товар.',
      transport: ['any'],
      placeKind: 'destination',
      addFreightToArrival: false,
      addInsurance: false,
      deductPostArrival: true,
      warning:
        'Пошлины и налоги импорта уже включены в цену продавца: при расчёте ' +
        'таможенной стоимости они не добавляются и требуют ручного вычета. ' +
        'НДС импорта получает продавец-нерезидент — вариант часто неудобен ' +
        'обеим сторонам, согласуйте заранее.',
      draft: false,
    },
  },
  {
    code: 'FAS',
    name: 'Франко вдоль борта судна',
    nameEn: 'Free Alongside Ship',
    active: true,
    meta: {
      explanation:
        'Продавец доставляет товар к борту названного судна в порту ' +
        'отправления (причал, лихтер) и оформляет экспорт. С этого момента ' +
        'риски и расходы — покупателя: погрузка, фрахт, страхование, импорт. ' +
        'Только морская и внутренняя водная перевозка.',
      transport: ['sea'],
      placeKind: 'port_dispatch',
      addFreightToArrival: true,
      addInsurance: true,
      draft: false,
    },
  },
  {
    code: 'FOB',
    name: 'Франко-борт',
    nameEn: 'Free On Board',
    active: true,
    meta: {
      explanation:
        'Продавец погружает товар на судно, названное покупателем, в порту ' +
        'отправления и оформляет экспорт. Риски и расходы переходят, когда ' +
        'товар на борту. Только морская и внутренняя водная перевозка. ' +
        'Для контейнеров через терминал вместо FOB используют FCA: товар ' +
        'сдаётся терминалу задолго до борта.',
      transport: ['sea'],
      placeKind: 'port_dispatch',
      addFreightToArrival: true,
      addInsurance: true,
      draft: false,
    },
  },
  {
    code: 'CFR',
    name: 'Стоимость и фрахт (до порта назначения)',
    nameEn: 'Cost and Freight',
    active: true,
    meta: {
      explanation:
        'Продавец оплачивает фрахт до порта назначения, но риск переходит ' +
        'раньше — при погрузке товара на борт в порту отправления. Экспорт — ' +
        'продавец, страхование не обязательно, импорт — покупатель. Только ' +
        'морская и внутренняя водная перевозка.',
      transport: ['sea'],
      placeKind: 'port_arrival',
      addFreightToArrival: false,
      addInsurance: false,
      deductPostArrival: true,
      draft: false,
    },
  },
  {
    code: 'CIF',
    name: 'Стоимость, страхование и фрахт',
    nameEn: 'Cost, Insurance and Freight',
    active: true,
    meta: {
      explanation:
        'Как CFR: продавец оплачивает фрахт до порта назначения, риск ' +
        'переходит при погрузке на борт. Плюс продавец обязан застраховать ' +
        'груз в пользу покупателя (минимальное покрытие, если не согласовано ' +
        'иное). Только морская и внутренняя водная перевозка.',
      transport: ['sea'],
      placeKind: 'port_arrival',
      addFreightToArrival: false,
      addInsurance: false,
      deductPostArrival: true,
      draft: false,
    },
  },
  {
    // Редакция 2010, в 2020 заменён на DPU (карточка DF-17: «по запросу,
    // неактивна» — мастер включает через экран справочника).
    code: 'DAT',
    name: 'Доставлено на терминале (редакция 2010)',
    nameEn: 'Delivered at Terminal',
    active: false,
    meta: {
      explanation:
        'Редакция Инкотермс 2010: продавец доставляет товар на терминал ' +
        'порта или места назначения и разгружает. В редакции 2020 заменён ' +
        'на DPU — место любое, не только терминал. Включается по запросу, ' +
        'в формах по умолчанию не показывается.',
      transport: ['any'],
      placeKind: 'port_arrival',
      addFreightToArrival: false,
      addInsurance: false,
      deductPostArrival: true,
      draft: false,
    },
  },
]
