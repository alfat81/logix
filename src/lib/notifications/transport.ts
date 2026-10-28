// ─── DF-03: общий интерфейс транспортов уведомлений ──────────────────
// Карточка DF-03: «transports/{email,telegram,whatsapp,fake}.ts под
// общим интерфейсом NotificationTransport». Транспорт ТОЛЬКО доставляет:
// он не знает про очередь, лимиты и allowlist — это диспетчер
// (lib/notifications/dispatch.ts). Результат — { ok, providerId?, error? }:
// ok=true письмо принято провайдером; ok=false + error='not_configured'
// — канал не настроен (диспетчер переведёт письмо в skipped, без
// повторов); любой другой error — сбой доставки (повторы с паузами).
//
// Файл без серверных зависимостей — импортируется тестами.

export type TransportMessage = {
  to: string
  subject: string
  body: string
  // Имя отправителя и Reply-To — из настроек (brand.ts); транспорт
  // подставляет их в конверт, если провайдер их поддерживает.
  fromName?: string
  replyTo?: string | null
}

export type SendResult = {
  ok: boolean
  providerId?: string
  error?: string
}

export interface NotificationTransport {
  send(msg: TransportMessage): Promise<SendResult>
}

// Канал не настроен — терминальный статус skipped (не ошибка доставки:
// повтор бессмысленен, пока владелец не включит канал настройкой/env).
export const NOT_CONFIGURED = 'not_configured'
