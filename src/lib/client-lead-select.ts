// ─── DF-27 (кабинет клиента): единые проекции чтения запроса ────────
// CLIENT_OPTION_FIELDS — наружная проекция варианта (белый список,
// D3/RULES 2.15); CLIENT_LEAD_DETAIL_SELECT — состав чтения карточки
// запроса (GET-роут и PATCH-логика lib/client-lead-patch.ts — один
// состав полей, включая _count для автомата статуса).
import { ROUTE_COLUMN_SELECT } from '@/lib/route-fields'
import { ACTIVITY_FEED_TAKE, ACTIVITY_PUBLIC_FIELDS } from '@/lib/activity'
import { eventWhereFor } from '@/lib/audience'
import { PERMIT_EXTERNAL_FIELDS } from '@/lib/permits-db'

// Наружная проекция варианта расчёта: продажные поля без себестоимости
// (belt-and-suspenders — наружу уходят ТОЛЬКО перечисленные поля).
const CLIENT_OPTION_FIELDS = {
  id: true,
  description: true,
  transportModes: true,
  price: true,
  currency: true,
  vatMode: true,
  etaDays: true,
  priorityFit: true,
  isSelected: true,
  createdAt: true,
  // DF-27 (план §11.2): в клиентскую проекцию варианта добавляется
  // ТОЛЬКО пометка предварительного расчёта (строки расчёта, итоги,
  // provenance и флаг пересмотра цены — не покидают сервер)
  isPreliminary: true,
} as const

export const CLIENT_LEAD_DETAIL_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  cargoInfo: true,
  // P1-03: маршрут/метрики — колонки (карточка + diff правки)
  ...ROUTE_COLUMN_SELECT,
  // DF-27 волна 2: условие поставки — часть бланка запроса клиента
  // (нужна completeness автомата статуса; данные самого клиента, не D3)
  incotermCode: true,
  incotermPlace: true,
  order: { select: { id: true, number: true } },
  // BL-7: варианты с продажными ценами (без себестоимости)
  options: { orderBy: { createdAt: 'asc' }, select: CLIENT_OPTION_FIELDS },
  // BL-3: метаданные активного согласования (факт: кто/как/когда)
  selectedOptionId: true,
  clientConfirmedAt: true,
  clientConfirmedVia: true,
  clientConfirmedByName: true,
  // BL-7: активный снимок согласования — зафиксированные условия
  // (история снимков наружу не отдаётся; себестоимости в снимке нет
  // по схеме — belt-and-suspenders)
  approvalSnapshots: {
    orderBy: { confirmedAt: 'desc' },
    take: 1,
    select: {
      description: true,
      transportModes: true,
      price: true,
      currency: true,
      vatMode: true,
      etaDays: true,
      priorityFit: true,
      confirmedAt: true,
      confirmedVia: true,
    },
  },
  _count: { select: { options: true } },
  // DF-21: журнал запроса — только события с аудиторией 'client'
  // (eventWhereFor); имена актёров — ридер клиента (DF-02A)
  activities: {
    where: eventWhereFor('client'),
    orderBy: { createdAt: 'desc' },
    take: ACTIVITY_FEED_TAKE,
    select: ACTIVITY_PUBLIC_FIELDS,
  },
  // DF-16: разрешительные запроса — строки видит клиент (наружная
  // проекция, staffNote не покидает сервер; сортировку делает UI —
  // константа with as const, mutable orderBy туда не вставить).
  permitRequirements: {
    select: PERMIT_EXTERNAL_FIELDS,
  },
} as const
