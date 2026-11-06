import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { clearSettingsCache, setSetting, resetSetting } from './settings'
import { employeeActor } from './activity'
import { detectFamily, mimeForFileName, resolveFileMime } from './file-signature'
import {
  createPendingDocument,
  maxUploadBytes,
  normalizeUploadMime,
  uploadSizeError,
  UploadValidationError,
} from './document-upload'

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
  it('псевдонимы браузеров сводятся к канону: x-zip-compressed (Firefox) → zip, image/jpg (Android) → jpeg', () => {
    // Регресс 0.8.3: ZIP не проходил фильтр — браузер заявлял алиас, не
    // входящий в белый список, и fallback по расширению не срабатывал.
    expect(normalizeUploadMime('application/x-zip-compressed', 'документы.zip')).toBe('application/zip')
    expect(normalizeUploadMime('image/jpg', 'скан.jpg')).toBe('image/jpeg')
    // Алиясы форматов вне белого списка наружу не пробиваются.
    expect(normalizeUploadMime('application/x-7z-compressed', 'архив.7z')).toBeNull()
  })
  it('настоящий ZIP (PK\\x03\\x04) проходит сигнатуру по каноническому типу', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00])
    expect(detectFamily(zip)).toBe('zip')
    expect(resolveFileMime('application/zip', 'документы.zip', zip)).toBe('application/zip')
    // DOCX-контейнер — тоже zip-семейство: pdf-тип с zip-байтами не пройдёт.
    expect(resolveFileMime('application/pdf', 'подмена.pdf', zip)).toBeNull()
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

// ─── DF-26/AUD-11 + §3.3.6 (T21-04): ранняя валидация привязок ───────
// stageCode — этап ЭТОЙ заявки; permitRequirementId — строка той же
// сделки в pending (T21-02). Проверки выполняются ДО отправки файла в
// хранилище (fail-fast): успех полного цикла — e2e двухфазной загрузки.

const CREATE_INPUT = {
  kind: 'customs_declaration' as const,
  title: 'ДТ',
  fileName: 'dt.pdf',
  mimeType: 'application/pdf',
  size: 1024,
}

describe('createPendingDocument: привязки stageCode/permitRequirementId (AUD-11, T21-02)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stageCode на лиде — 400 (этапы есть только у заявки)', async () => {
    await expect(
      createPendingDocument({ leadId: 'lead-1' }, MASTER, { ...CREATE_INPUT, stageCode: 'import_customs' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Этап указывается только у документов заявки',
    } satisfies Partial<UploadValidationError>)
  })

  it('stageCode не из этой заявки — 400, а не тихий null', async () => {
    vi.spyOn(db.orderStageInstance, 'findFirst').mockResolvedValue(null)
    await expect(
      createPendingDocument({ orderId: 'ord-1' }, MASTER, { ...CREATE_INPUT, stageCode: 'warehouse' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Этап не найден в этой заявке',
    } satisfies Partial<UploadValidationError>)
    expect(db.orderStageInstance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'ord-1', stageCode: 'warehouse' } }),
    )
  })

  it('permitRequirementId чужой сделки — 404 (факт существования не раскрываем)', async () => {
    vi.spyOn(db.permitRequirement, 'findUnique').mockResolvedValue({
      id: 'p1',
      status: 'pending',
      orderId: 'other-order',
      leadId: null,
    } as never)
    await expect(
      createPendingDocument({ orderId: 'ord-1' }, MASTER, {
        ...CREATE_INPUT,
        permitRequirementId: 'p1',
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Разрешительное требование не найдено в этой сделке',
    } satisfies Partial<UploadValidationError>)
  })

  it('permitRequirementId закрытой строки — 409 (документ правится версиями)', async () => {
    vi.spyOn(db.permitRequirement, 'findUnique').mockResolvedValue({
      id: 'p2',
      status: 'received',
      orderId: 'ord-1',
      leadId: null,
    } as never)
    await expect(
      createPendingDocument({ orderId: 'ord-1' }, MASTER, {
        ...CREATE_INPUT,
        permitRequirementId: 'p2',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Строка уже закрыта — документ прикладывается версиями к загруженному',
    } satisfies Partial<UploadValidationError>)
  })

  it('строка той же сделки в pending проходит проверку (ошибка дальше — по циклу e2e)', async () => {
    vi.spyOn(db.permitRequirement, 'findUnique').mockResolvedValue({
      id: 'p3',
      status: 'pending',
      orderId: 'ord-1',
      leadId: null,
    } as never)
    // Дальше валидации идёт presign хранилища — в unit не заходим:
    // ловим ЛЮБУЮ ошибку после проверки привязки и сверяем, что она не
    // про требование (успешный полный цикл — e2e POST documents).
    await expect(
      createPendingDocument({ orderId: 'ord-1' }, MASTER, {
        ...CREATE_INPUT,
        permitRequirementId: 'p3',
      }),
    ).rejects.not.toMatchObject({
      message: 'Разрешительное требование не найдено в этой сделке',
    })
  })
})
