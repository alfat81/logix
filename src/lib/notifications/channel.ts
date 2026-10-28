import type { NotificationTransport } from './transport'
import { createEmailTransport } from './transports/email'
import { createTelegramTransport } from './transports/telegram'
import { createWhatsappTransport } from './transports/whatsapp'

// ─── DF-03: выбор транспорта по каналу письма ────────────────────────
// Канал письма живёт в строке очереди (Notification.channel). Сегодня
// реально доставляется только email (Resend/fake/none — по env);
// telegram/whatsapp — заглушки not_configured (D8/D29, §3) — очередь и
// диспетчер готовы к ним без правок, доставку добавит P2-01.
export function getTransport(channel: string): NotificationTransport {
  if (channel === 'telegram') return createTelegramTransport()
  if (channel === 'whatsapp') return createWhatsappTransport()
  return createEmailTransport()
}
