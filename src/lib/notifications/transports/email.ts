import { randomUUID } from 'node:crypto'
import type { NotificationTransport, SendResult, TransportMessage } from '../transport'
import { NOT_CONFIGURED } from '../transport'
import { createFakeTransport } from './fake'

// ─── DF-03: email-транспорт — Resend HTTP API через fetch ────────────
// Карточка DF-03: «Email-транспорт: Resend, HTTP API через fetch» —
// без SMTP-библиотек (ограничение §4 на зависимости). Отправитель —
// поддомен домена владельца (O-2, рекомендация notify.fatyanov.com):
// адрес — env EMAIL_FROM, имя — настройка email.from_name (бренд не
// хардкодится), Reply-To — настройка email.reply_to.
//
// Провайдер выбирается env EMAIL_PROVIDER (по умолчанию none):
//   none   — ничего не отправляется: { ok:false, error:'not_configured' }
//            → диспетчер ставит skipped (заводы/тесты/до включения O-2);
//   fake   — фиктивная доставка (e2e/CI): ok, providerId = fake:<uuid>
//            (сам транспорт живёт transports/fake.ts);
//   resend — боевой HTTP API; секрет — env RESEND_API_KEY (D32).

export type EmailProvider = 'none' | 'fake' | 'resend'

export function readEmailProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER ?? 'none').trim().toLowerCase()
  return raw === 'resend' ? 'resend' : raw === 'fake' ? 'fake' : 'none'
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

class ResendTransport implements NotificationTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(msg: TransportMessage): Promise<SendResult> {
    const payload: Record<string, unknown> = {
      from: msg.fromName ? `${msg.fromName} <${this.from}>` : this.from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.body,
    }
    if (msg.replyTo) payload.reply_to = msg.replyTo
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // Письмо не должно висеть дольше запроса диспетчера (cron):
        // таймаут меньше паузы повтора (1 мин), иначе пачка копится.
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` }
      }
      const data = (await res.json().catch(() => null)) as { id?: string } | null
      return { ok: true, providerId: data?.id ?? `resend:${randomUUID()}` }
    } catch (e) {
      return { ok: false, error: `resend network: ${String(e).slice(0, 200)}` }
    }
  }
}

// Фабрика email-канала. fromName/replyTo приходят в сообщении
// (диспетчер читает настройки один раз на пачку), секрет/адрес — env.
export function createEmailTransport(): NotificationTransport {
  const provider = readEmailProvider()
  if (provider === 'fake') {
    return createFakeTransport()
  }
  if (provider === 'resend') {
    const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
    const from = (process.env.EMAIL_FROM ?? '').trim()
    if (!apiKey || !from) {
      // Ключ/адрес не заданы — канал фактически не настроен: skipped
      // вместо гарантированного сбоя каждого письма (и подсказка в лог).
      console.error('[email-transport] EMAIL_PROVIDER=resend, но RESEND_API_KEY/EMAIL_FROM не заданы')
      return { send: async () => ({ ok: false, error: NOT_CONFIGURED }) }
    }
    return new ResendTransport(apiKey, from)
  }
  return { send: async () => ({ ok: false, error: NOT_CONFIGURED }) }
}
