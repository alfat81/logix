import type { NotificationTransport, SendResult } from '../transport'
import { NOT_CONFIGURED } from '../transport'

// ─── DF-03: заглушка WhatsApp-транспорта ─────────────────────────────
// См. transports/telegram.ts: канал зарезервирован интерфейсом
// NotificationTransport, доставку добавит P2-01 (D8/D29, §3).
export function createWhatsappTransport(): NotificationTransport {
  return {
    async send(): Promise<SendResult> {
      return { ok: false, error: NOT_CONFIGURED }
    },
  }
}
