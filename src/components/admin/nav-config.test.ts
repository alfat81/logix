import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS, visibleNavItems } from '@/components/admin/nav-config'

// DF-21 (G1): гард состава меню администратора. Набросок макета содержал
// несуществующие разделы («Котировки», «Мониторинг», «Перевозчики»
// вместо «Подрядчики») — тест запрещает их навсегда и фиксирует
// обязательный состав реальных разделов. Названия — по глоссарию
// RULES 2.6 («Запросы», не «Лиды»).

const FORBIDDEN_LABELS = ['Котировки', 'Мониторинг', 'Перевозчики', 'Лиды']

const REQUIRED_HREFS = [
  '/admin/pulse',
  '/admin',
  '/admin/orders',
  '/admin/leads',
  '/admin/customers',
  '/admin/contractors',
  '/admin/brokers',
  '/admin/references',
  '/admin/settings',
]

describe('nav-config (DF-21: меню без несуществующих разделов)', () => {
  it('запрещённые термины макета отсутствуют в любом пункте', () => {
    const labels = visibleNavItems(true).map((i) => i.label)
    for (const bad of FORBIDDEN_LABELS) {
      expect(labels).not.toContain(bad)
    }
    // и по подстроке — «Котировки» не возвращается даже как часть слова
    for (const label of labels) {
      expect(label).not.toMatch(/Котиров|Мониторинг|Перевозчик|Лид/)
    }
  })

  it('обязательные разделы на месте (Пульс, Заявки, Запросы, Настройки…)', () => {
    const hrefs = visibleNavItems(true).map((i) => i.href)
    for (const href of REQUIRED_HREFS) {
      expect(hrefs).toContain(href)
    }
  })

  it('маршруты уникальны, у каждого пункта есть иконка и непустая подпись', () => {
    const items = visibleNavItems(true)
    const hrefs = items.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    for (const item of items) {
      expect(item.label.trim().length).toBeGreaterThan(0)
      // Иконка — компонент lucide-react (в тестовой среде это объект
      // ForwardRef, в рантайме — функция): проверяем наличие.
      expect(item.icon).toBeTruthy()
    }
  })

  it('мастер видит больше пунктов, чем менеджер (masterOnly фильтруется)', () => {
    const master = visibleNavItems(true).map((i) => i.href)
    const manager = visibleNavItems(false).map((i) => i.href)
    expect(master.length).toBeGreaterThan(manager.length)
    expect(manager).not.toContain('/admin/settings')
    expect(manager).not.toContain('/admin/employees')
    expect(manager).not.toContain('/admin/pulse')
  })

  it('секции без пустых групп (структура сайдбара согласована)', () => {
    for (const section of NAV_SECTIONS) {
      expect(section.items.length).toBeGreaterThan(0)
    }
  })
})
