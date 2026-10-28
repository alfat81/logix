import { EVENT_TYPES } from '@/lib/event-registry'
import type { ActivityType } from '@/lib/activity'
import { getBrand } from '@/lib/brand'
import { getSetting } from '@/lib/settings'
import type { NotificationEnvelope } from './rules'

// ─── DF-03: шаблоны писем (одиночное письмо и подвал) ────────────────
// Карточка DF-03: «templates.ts (одиночное письмо и письмо-дайджест;
// без цен для брокера, без себестоимости; ссылка ${APP_BASE_URL}/
// <кабинет>/orders/<id>; название и подпись — из настроек, DF-00D)».
// Текст письма — text/plain: клиентские кабинеты и так дают полную
// картину, письмо — сигнал со ссылкой (аудит 22.10).
//
// ЦЕНА В ПИСЬМАХ: только клиенту (D3/D19) и только если она уже в
// description события; брокеру — никогда (проверка IC-04/e2e:
// «шаблон брокеру не содержит цены»), себестоимость и маржа — никому.
// Шаблон сам числа не добавляет — только текст события и ссылку.
//
// APP_BASE_URL (D11) — env: без него письма уходят без ссылки
// (стенды без публичного адреса не должны ломать отправку).

export type DealRef = {
  kind: 'order' | 'lead'
  id: string
  // Человекочитаемый ярлык сделки: «заявка №17-1» / «запрос — ООО Ромб».
  label: string
}

export function readAppBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? '').trim().replace(/\/+$/, '')
}

// Ссылка на сделку в кабинете получателя (§8: клиент видит свою
// заявку, брокер — свою, сотрудник — админку). null — без публичного
// адреса письмо не строит ссылку.
export function dealLink(kind: NotificationEnvelope['kind'], deal: DealRef): string | null {
  const base = readAppBaseUrl()
  if (!base) return null
  if (kind === 'employee') return `${base}/admin/${deal.kind === 'order' ? 'orders' : 'leads'}/${deal.id}`
  const cabinet = kind === 'client' ? 'client' : 'broker'
  return `${base}/${cabinet}/${deal.kind === 'order' ? 'orders' : 'leads'}/${deal.id}`
}

export type LetterDraft = {
  subject: string
  body: string
}

// Подвал: название и подпись — настройки; отключение — ответ на письмо
// (служебные письма о ходе сделки, не рекламные — карточка DF-03).
export async function renderFooter(): Promise<string> {
  const brand = await getBrand()
  const lines = ['--', brand.name]
  if (brand.signature.trim()) lines.push(brand.signature.trim())
  lines.push('Вы получили письмо как участник сделки. Чтобы отключить уведомления, ответьте на это письмо.')
  return lines.join('\n')
}

// Одиночное письмо по событию. Нейтральный вариант (аудит №16) не
// пересказывает description события («Проблема» сотрудникам виден в
// ленте) — клиенту уходит формулировка «задержка» без деталей.
export async function renderSingleLetter(
  type: ActivityType,
  description: string,
  envelope: NotificationEnvelope,
  deal: DealRef
): Promise<LetterDraft> {
  const [meta, brand, redPrefix] = await Promise.all([
    Promise.resolve(EVENT_TYPES[type]),
    getBrand(),
    getSetting('notifications.red_subject_prefix'),
  ])
  const link = dealLink(envelope.kind, deal)
  const label = meta.label

  // Префикс из настройки нормализуется валидатором (trim) — пробел-разделитель
  // добавляет шаблон, чтобы «Срочно:» и «Срочно: » вели себя одинаково.
  const prefix = redPrefix ? `${redPrefix.trim()} ` : ''
  let subject: string
  let bodyLines: string[]
  if (envelope.mode === 'red' && envelope.neutral) {
    subject = `${prefix}Задержка на этапе — ${deal.label}`
    bodyLines = [
      `По сделке ${deal.label} возникла задержка на одном из этапов.`,
      'Мы уже занимаемся решением — подробности в кабинете:',
      link ?? '(ссылка будет доступна в кабинете)',
    ]
  } else {
    subject = envelope.mode === 'red' ? `${prefix}${label} — ${deal.label}` : `${brand.name}: ${label} — ${deal.label}`
    bodyLines = [description, ...(link ? ['', `Открыть в кабинете: ${link}`] : [])]
  }
  bodyLines.push('', await renderFooter())
  return { subject, body: bodyLines.join('\n') }
}
