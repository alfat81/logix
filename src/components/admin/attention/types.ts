import { LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/leads'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/order-constants'

// v0.5.0 (P1-22): типы экрана «Требует внимания» (Ж5) и общие
// хелперы — выезд из AttentionScreen.tsx (резка под лимит 300,
// RULES 2.14). LEAD/ORDER_STATUS_LABELS реэкспортируются, чтобы
// секции не тянули lib повторно.

export type StageAttention = {
  orderId: string
  orderNumber: string
  orderStatus: OrderStatus
  customerName: string
  stageName: string
  stageStatus: string
  plannedDate: string | null
  daysOverdue: number | null
  contractorName: string | null
}

export type LeadAttention = {
  leadId: string
  status: LeadStatus
  contactName: string
  daysIdle: number
  updatedAt: string
}

export type AttentionData = {
  generatedAt: string
  overdueStages: StageAttention[]
  problemStages: StageAttention[]
  unassignedStages: StageAttention[]
  staleLeads: LeadAttention[]
  counts: {
    overdue: number
    problem: number
    unassigned: number
    staleLeads: number
    waitingLong: number
  }
  // DF-04: счётчик failed-писем — только мастеру (журнал master-only);
  // не-мастеру поле приходит null'ом — секция «Письма не ушли» скрыта.
  notificationsFailed: number | null
  // DF-05: секция «Ждут дольше N часов» (порог — настройка
  // waiting.attention_hours, значение приходит для подписи).
  waitingLong: WaitingLongAttention[]
  attentionHours: number
}

// DF-05: сделка, чей «мяч» висит дольше порога — заявки и запросы
// одним списком, ссылки разводятся по dealKind.
export type WaitingLongAttention = {
  dealId: string
  dealKind: 'order' | 'lead'
  label: string
  status: string
  waitingOnKind: string
  hoursWaiting: number
}

export const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—'

// Русская плюрализация дней: 1 день / 2 дня / 5 дней.
export function daysWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня'
  return 'дней'
}

// Русская плюрализация часов: 1 час / 2 часа / 5 часов (DF-05).
export function hoursWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'час'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'часа'
  return 'часов'
}

export { LEAD_STATUS_LABELS, ORDER_STATUS_LABELS }
