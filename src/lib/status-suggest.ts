// DF-06: подсказка статуса заявки по этапам. Чистая функция без
// серверных зависимостей: импортируется unit-тестами и компонентом
// StatusSuggestion. Статусная машина не меняется — функция только
// предлагает переход, который матрица (lib/status-machine.ts)
// уже разрешает; вручную менеджер по-прежнему волен выбирать любой.
import { ORDER_TRANSITIONS, TERMINAL_ORDER_STATUSES } from '@/lib/status-machine'
import type { OrderStatus, StageStatus } from '@/lib/order-constants'

export type OrderStatusSuggestion = {
  to: OrderStatus
  question: string
  button: string
}

// «Работа началась» — этап уже трогали: идёт, завершён или на нём
// проблема. not_started работу не начинает.
const WORK_STARTED: readonly StageStatus[] = ['in_progress', 'done', 'problem']

function allowsTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to)
}

export function suggestOrderStatus(
  stages: ReadonlyArray<{ status: StageStatus }>,
  current: OrderStatus
): OrderStatusSuggestion | null {
  if (stages.length === 0) return null

  // Терминальные («Завершена»/«Отменена»): формально матрица пускает
  // их в «В работе», но роут требует мастера и причину — это осознанный
  // возврат, а не шаг «в одно нажатие»; подсказкой его не предлагаем.
  if (TERMINAL_ORDER_STATUSES.includes(current)) return null

  // 1) Все этапы завершены → предложить «Завершить заявку», если
  // матрица разрешает (только из «В работе»). Из «Расчёта»/«Согласования»
  // завершать нельзя — подсказка не рисуется (критерий приёмки).
  const allDone = stages.every((s) => s.status === 'done')
  if (allDone && allowsTransition(current, 'completed')) {
    return {
      to: 'completed',
      question: 'Все этапы завершены — завершить заявку?',
      button: 'Завершить заявку',
    }
  }

  // 2) Работа началась, а заявка ещё в «Расчёте»/«Согласовании» →
  // предложить «В работе». Это и лестница для случая «этапы завершены,
  // но заявка не двигалась»: сначала «В работе», после — подсказка 1.
  const started = stages.some((s) => WORK_STARTED.includes(s.status))
  if (started && allowsTransition(current, 'in_progress')) {
    return {
      to: 'in_progress',
      question: 'Работа началась — перевести в «В работе»?',
      button: 'Перевести в «В работе»',
    }
  }

  return null
}
