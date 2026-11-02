import { afterAll, describe, expect, it } from 'vitest'
import { db } from './db'
import { clearSettingsCache, setSetting, resetSetting } from './settings'
import { employeeActor } from './activity'
import { detectFamily, mimeForFileName, resolveFileMime } from './file-signature'
import { maxUploadBytes, normalizeUploadMime, uploadSizeError } from './document-upload'

// ─── DF-11: unit — лимиты из настроек, MIME двухфазной загрузки ──────
// Карточка DF-11: «unit: … проверка сигнатуры, лимиты». Сигнатура —
// file-signature (E0-07: HTML под видом PDF); лимит — files.max_mb
// (D32: параметр в настройках, без выката). Полный двухфазный цикл —
// в e2e (загрузка/confirm/404/20 МБ).

const RUN = 'df11-upload-test'
const MASTER = employeeActor({ id: 'df11-test', name: 'Мастер DF-11' })

afterAll(async () => {
  await resetSetting('files.max_mb', MASTER).catch(() => undefined)
  await clearSettingsCache()
  await db.$disconnect()
})

describe('mimeForFileName / resolveFileMime (сигнатура — create и confirm)', () => {
  it('пустой тип + .docx → docx MIME; HTML под видом PDF не проходит (E0-07)', () => {
    expect(mimeForFileName('Акт.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    const html = new TextEncoder().encode('<html><body>x</body></html>')
    expect(resolveFileMime('application/pdf', 'документ.pdf', html)).toBeNull()
    expect(detectFamily(html)).toBeNull()
  })
  it('настоящий PDF с типом pdf проходит', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 …')
    expect(resolveFileMime('application/pdf', 'документ.pdf', pdf)).toBe('application/pdf')
  })
  it('HTML-байты с расширением .txt не входят в белый список', () => {
    expect(normalizeUploadMime('text/html', 'страница.html')).toBeNull()
  })
  it('octet-stream уточняется расширением; вне белого списка — null', () => {
    expect(normalizeUploadMime('application/octet-stream', 'счёт.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    expect(normalizeUploadMime('', 'файл.bin')).toBeNull()
    expect(normalizeUploadMime('application/x-msdownload', 'вирус.pdf')).toBeNull()
  })
})

describe('maxUploadBytes (настройка files.max_mb, D32)', () => {
  it('по умолчанию 25 МБ; смена настройки меняет лимит без выката', async () => {
    await clearSettingsCache()
    expect(await maxUploadBytes()).toBe(25 * 1024 * 1024)
    await setSetting('files.max_mb', 3, MASTER)
    expect(await maxUploadBytes()).toBe(3 * 1024 * 1024)
  })
})

describe('uploadSizeError (формулировка 2.7: что случилось + что делать)', () => {
  it('называет лимит и предлагает уменьшить файл', async () => {
    const text = uploadSizeError(30 * 1024 * 1024, 25 * 1024 * 1024)
    expect(text).toContain('25.0 МБ')
    expect(text).toContain('уменьшите файл')
  })
})
