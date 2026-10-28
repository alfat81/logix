import { randomUUID } from 'node:crypto'
import type { NotificationTransport, SendResult } from '../transport'

// ─── DF-03: фиктивный транспорт (e2e/CI/стенд) ────────────────────────
// Карточка DF-03: «fake-транспорт: пишет status=sent, providerId=fake:<id>;
// мастеру доступен GET /api/admin/notifications?... для проверки тел
// писем в e2e (в CI EMAIL_PROVIDER=fake)». Письмо считается доставленным:
// e2e читает очередь через админ-API и проверяет тела/получателей/ссылки.
// Никаких внешних вызовов — прогон безопасен на любой сети.
export function createFakeTransport(): NotificationTransport {
  return {
    async send(): Promise<SendResult> {
      return { ok: true, providerId: `fake:${randomUUID()}` }
    },
  }
}
