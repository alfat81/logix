// ─── Конфигурация меню кабинета сотрудников (Ж7) ────────────────────
// Единый источник состава меню: AdminNav (сайдбар md+) и AdminBottomNav
// (нижняя панель телефона ≤768px, DF-21) читают ОДИН список — рассинхрон
// навигации невозможен по построению (IC-14).
//
// DF-21 (G1): названия сверены с глоссарием RULES 2.6 — «Запросы» (не
// «Лиды»), «Подрядчики», «Заявки»; термины «Котировки», «Мониторинг»,
// «Перевозчики» (как разделы) запрещены. Все пункты — существующие
// разделы, несуществующих в меню нет. Файл БЕЗ 'use client' и без
// next/link — читается и клиентскими компонентами, и unit-тестом
// (гард состава меню, DF-21).
import {
  Activity,
  BookOpen,
  Building2,
  ClipboardList,
  FileSignature,
  Home,
  Inbox,
  Landmark,
  ListChecks,
  Mail,
  Settings,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  // Ж6в / DF-00D: пункт виден только мастеру (Сотрудники, Настройки,
  // Пульс, Журнал отправок).
  masterOnly?: boolean
}

export type NavSection = {
  // null — секция без заголовка (верхний одиночный пункт «Главная»).
  title: string | null
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      // DF-07: «Пульс» — первый пункт МАСТЕРА (вход мастера открывает
      // его же — редирект после логина); менеджеру сводка всего дела
      // не показана (API отдаёт 403, страница ведёт на главную).
      { href: '/admin/pulse', label: 'Пульс', icon: Activity, masterOnly: true },
      { href: '/admin', label: 'Главная', icon: Home },
    ],
  },
  {
    title: 'Сделки',
    items: [
      { href: '/admin/orders', label: 'Заявки', icon: ClipboardList },
      { href: '/admin/leads', label: 'Запросы', icon: Inbox },
    ],
  },
  {
    title: 'Справочники',
    items: [
      { href: '/admin/customers', label: 'Клиенты', icon: Users },
      { href: '/admin/contracts', label: 'Договоры', icon: FileSignature },
      { href: '/admin/legal-entities', label: 'Юрлица', icon: Building2 },
      { href: '/admin/stage-catalog', label: 'Этапы', icon: ListChecks },
      { href: '/admin/contractors', label: 'Подрядчики', icon: Truck },
      { href: '/admin/brokers', label: 'Брокеры', icon: Landmark },
      { href: '/admin/employees', label: 'Сотрудники', icon: UserCog, masterOnly: true },
      // DF-17: страны/валюты/упаковка/условия поставки — источник выбора
      // для всех форм (мастер и менеджер, правки write:true)
      { href: '/admin/references', label: 'Справочники', icon: BookOpen },
    ],
  },
  {
    title: null,
    items: [
      // DF-04: журнал отправок — инструмент мастера (очередь писем со
      // всеми сторонами сделки); меню и раздел master-only (Ж6в).
      { href: '/admin/notifications', label: 'Журнал отправок', icon: Mail, masterOnly: true },
      { href: '/admin/settings', label: 'Настройки', icon: Settings, masterOnly: true },
    ],
  },
]

// Плоский список по роли — для нижней панели телефона и гард-теста.
export function visibleNavItems(isMaster: boolean): NavItem[] {
  return NAV_SECTIONS.flatMap((s) => s.items).filter((i) => !i.masterOnly || isMaster)
}
