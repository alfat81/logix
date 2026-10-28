import type { NotificationTransport, SendResult } from '../transport'
import { NOT_CONFIGURED } from '../transport'

// ─── DF-03: заглушка Telegram-транспорта ─────────────────────────────
// Карточка DF-03 и граница фазы (§3): Telegram/WhatsApp — заглушки за
// общим интерфейсом (D8/D29), «возвращающие skipped: not_configured».
// Транспорты поверх интерфейса появится в P2-01 (после DF-03/DF-04);
// очередь и правила уже готовы к новому каналу без правок диспетчера.
export function createTelegramTransport(): NotificationTransport {
  return {
    async send(): Promise<SendResult> {
      return { ok: false, error: NOT_CONFIGURED }
    },
  }
}
