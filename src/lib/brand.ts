import { getSetting } from './settings'

// ─── DF-03: бренд писем и интерфейса — из настроек, не из кода ───────
// Карточка DF-03 (ROADMAP-DEALFLOW §4): «Не хардкодить название
// "Logix", домен и адрес отправителя: брать из src/lib/brand.ts и env
// APP_BASE_URL (D11)». Название и подпись — настройки DF-00D
// (brand.name, brand.signature), имя отправителя и Reply-To — группа
// email. Домен/ключ/адрес — секреты и адреса инфраструктуры → env
// (D32), сюда не входят.
//
// Файл серверный (тянет settings → db) — импорт из клиентских
// компонентов запрещён.

export type Brand = {
  name: string
  signature: string
}

export async function getBrand(): Promise<Brand> {
  const [name, signature] = await Promise.all([
    getSetting('brand.name'),
    getSetting('brand.signature'),
  ])
  return { name, signature }
}

export type EmailSender = {
  fromName: string
  replyTo: string | null
}

export async function getEmailSender(): Promise<EmailSender> {
  const [fromName, replyTo] = await Promise.all([
    getSetting('email.from_name'),
    getSetting('email.reply_to'),
  ])
  return { fromName, replyTo: replyTo || null }
}
