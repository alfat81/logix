import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { AwsClient } from 'aws4fetch'

// ─── DF-11: хранилище файлов (S3-совместимое по образцу apexmoto, O-8) ──
// Провайдер, регион и эндпоинт — переменные окружения, не код (D32/D36):
//   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
//   S3_SECRET_ACCESS_KEY, опц. S3_FORCE_PATH_STYLE (Cloud.ru: tenant:key).
// Если S3 не настроен — локальный драйвер (каталог .storage): dev-режим и
// e2e-стенд «fake-хранилище» из карточки DF-11; на проде S3 обязателен
// (DEPLOY.md). Локальные presigned-ссылки живут ровно до рестарта процесса
// (секрет генерируется в памяти): capability-ссылка не должна переживать
// процесс, который её выдал.
// Бакет приватный; публичных ссылок нет — есть только короткоживущие
// подписанные URL (PUT на загрузку, GET на скачивание через 302).

export const STORAGE_PUT_EXPIRES = 600 // 10 минут на загрузку 25 МБ с запасом
export const STORAGE_GET_EXPIRES = 60 // карточка DF-11: presigned GET 60 с

export class StorageError extends Error {
  status: number
  readonly statusCode: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
    this.statusCode = status
  }
}

export type UploadTicket = {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresIn: number
}

export type StorageHead = { size: number; contentType: string | null }

export type StorageDisposition = 'inline' | 'attachment'

export interface StorageDriver {
  readonly kind: 's3' | 'local'
  /** Подписанный PUT: браузер грузит байты напрямую, минуя функцию. */
  presignPut(key: string, opts?: { contentType?: string; expiresIn?: number }): Promise<UploadTicket>
  /** Подписанный GET (для 302 при скачивании), disposition в подписи. */
  presignGet(key: string, opts: {
    disposition: StorageDisposition
    fileName: string
    contentType: string
    expiresIn?: number
  }): Promise<string>
  /** Размер и тип объекта; null — объекта нет. */
  head(key: string): Promise<StorageHead | null>
  /** Первые байты объекта (проверка сигнатуры на confirm). */
  readRange(key: string, start: number, end: number): Promise<Uint8Array<ArrayBuffer>>
  /** Серверная загрузка байтов (скрипт переноса легаси). */
  putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>
  deleteObject(key: string): Promise<void>
}

// Ключ объекта: без ПДн — только префикс сделки (cuid), случайный uuid и
// санитизированное имя файла. Секреты/логины в ключ не попадают.
export function buildDocStorageKey(dealId: string, fileName: string): string {
  return `docs/${dealId}/${randomUUID()}/${fileName}`
}

// ── Конфигурация из env ──────────────────────────────────────────────

type S3Config = { kind: 's3'; endpoint: string; region: string; bucket: string; forcePathStyle: boolean; accessKeyId: string; secretAccessKey: string }

export function readS3Config(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim()
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim()
  const endpoint = process.env.S3_ENDPOINT?.trim()
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null
  return {
    kind: 's3',
    endpoint: endpoint.replace(/\/+$/, ''),
    region: process.env.S3_REGION?.trim() || 'ru-central-1',
    bucket,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE?.trim() === 'true',
    accessKeyId,
    secretAccessKey,
  }
}

function s3ObjectUrl(cfg: S3Config, key: string): URL {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  if (cfg.forcePathStyle) return new URL(`${cfg.endpoint}/${cfg.bucket}/${encoded}`)
  const url = new URL(cfg.endpoint)
  return new URL(`${url.protocol}//${cfg.bucket}.${url.host}/${encoded}`)
}

function contentDisposition(value: string, fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${value}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

class S3Storage implements StorageDriver {
  readonly kind = 's3' as const
  private client: AwsClient

  constructor(private cfg: S3Config) {
    this.client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey })
  }

  async presignPut(key: string, opts?: { contentType?: string; expiresIn?: number }): Promise<UploadTicket> {
    const expiresIn = opts?.expiresIn ?? STORAGE_PUT_EXPIRES
    const contentType = opts?.contentType ?? 'application/octet-stream'
    const url = s3ObjectUrl(this.cfg, key)
    // aws4fetch читает срок presigned-ссылки из query (X-Amz-Expires).
    url.searchParams.set('X-Amz-Expires', String(expiresIn))
    const req = new Request(url, { method: 'PUT', headers: { 'content-type': contentType } })
    const signed = await this.client.sign(req, { aws: { signQuery: true, region: this.cfg.region, service: 's3' } })
    return { url: signed.url, method: 'PUT', headers: { 'Content-Type': contentType }, expiresIn }
  }

  async presignGet(key: string, opts: {
    disposition: StorageDisposition
    fileName: string
    contentType: string
    expiresIn?: number
  }): Promise<string> {
    const url = s3ObjectUrl(this.cfg, key)
    url.searchParams.set('response-content-disposition', contentDisposition(opts.disposition, opts.fileName))
    url.searchParams.set('response-content-type', opts.contentType)
    url.searchParams.set('X-Amz-Expires', String(opts.expiresIn ?? STORAGE_GET_EXPIRES))
    const req = new Request(url, { method: 'GET' })
    const signed = await this.client.sign(req, { aws: { signQuery: true, region: this.cfg.region, service: 's3' } })
    return signed.url
  }

  async head(key: string): Promise<StorageHead | null> {
    const req = new Request(s3ObjectUrl(this.cfg, key), { method: 'HEAD' })
    const signed = await this.client.sign(req, { aws: { region: this.cfg.region, service: 's3' } })
    const res = await fetch(signed)
    if (res.status === 404) return null
    if (!res.ok) throw new StorageError(`Хранилище недоступно (HEAD ${res.status})`)
    const size = Number(res.headers.get('content-length') ?? '0')
    return { size, contentType: res.headers.get('content-type') }
  }

  async readRange(key: string, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
    const req = new Request(s3ObjectUrl(this.cfg, key), {
      method: 'GET',
      headers: { range: `bytes=${start}-${end}` },
    })
    const signed = await this.client.sign(req, { aws: { region: this.cfg.region, service: 's3' } })
    const res = await fetch(signed)
    if (res.status === 404) throw new StorageError('Объект не найден в хранилище', 400)
    if (!res.ok && res.status !== 206) throw new StorageError(`Хранилище недоступно (GET ${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  }

  async putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
    const req = new Request(s3ObjectUrl(this.cfg, key), { method: 'PUT', body, headers: { 'content-type': contentType } })
    const signed = await this.client.sign(req, { aws: { region: this.cfg.region, service: 's3' } })
    const res = await fetch(signed)
    if (!res.ok) throw new StorageError(`Загрузка в хранилище не удалась (PUT ${res.status})`)
  }

  async deleteObject(key: string): Promise<void> {
    const req = new Request(s3ObjectUrl(this.cfg, key), { method: 'DELETE' })
    const signed = await this.client.sign(req, { aws: { region: this.cfg.region, service: 's3' } })
    const res = await fetch(signed)
    if (!res.ok && res.status !== 404) throw new StorageError(`Удаление из хранилища не удалось (DELETE ${res.status})`)
  }
}

// ── Локальный драйвер (dev / e2e «fake-хранилище») ───────────────────
// Файлы в каталоге (по умолчанию .storage), подпись — HMAC-SHA256 со
// случайным секретом процесса: ссылки-возможности живут до рестарта.

class LocalStorage implements StorageDriver {
  readonly kind = 'local' as const
  private secret = randomBytes(32)

  constructor(private root: string) {}

  private filePath(key: string): string {
    if (key.includes('..') || key.startsWith('/')) throw new StorageError('Некорректный ключ объекта', 400)
    const path = `${this.root}/${key}`
    if (!path.startsWith(this.root)) throw new StorageError('Некорректный ключ объекта', 400)
    return path
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex')
  }

  /** Проверка подписи локальной ссылки (роут /api/storage/local/[...key]). */
  verifyToken(op: string, key: string, exp: number, extra: string, sig: string): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
    const expected = this.sign(`${op}:${key}:${exp}:${extra}`)
    const a = Buffer.from(expected)
    const b = Buffer.from(sig)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private localUrl(key: string, op: string, expiresIn: number, extra: string, params?: Record<string, string>): string {
    const exp = Math.floor(Date.now() / 1000) + expiresIn
    const encoded = key.split('/').map(encodeURIComponent).join('/')
    const sig = this.sign(`${op}:${key}:${exp}:${extra}`)
    const q = new URLSearchParams({ exp: String(exp), ...(params ?? {}) })
    q.set('sig', sig)
    return `/api/storage/local/${encoded}?${q.toString()}`
  }

  async presignPut(key: string, opts?: { contentType?: string; expiresIn?: number }): Promise<UploadTicket> {
    const expiresIn = opts?.expiresIn ?? STORAGE_PUT_EXPIRES
    const contentType = opts?.contentType ?? 'application/octet-stream'
    return {
      url: this.localUrl(key, 'put', expiresIn, contentType),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn,
    }
  }

  async presignGet(key: string, opts: {
    disposition: StorageDisposition
    fileName: string
    contentType: string
    expiresIn?: number
  }): Promise<string> {
    const extra = [opts.disposition, opts.fileName, opts.contentType].join('\n')
    // disposition/имя/тип едут в query И в подпись: роут сверяет их с HMAC —
    // inline нельзя превратить в attachment (и наоборот) без новой подписи.
    return this.localUrl(key, 'get', opts.expiresIn ?? STORAGE_GET_EXPIRES, extra, {
      d: opts.disposition,
      n: opts.fileName,
      t: opts.contentType,
    })
  }

  /** Расшифровка подписанных параметров GET (роут локального драйвера). */
  parseGetToken(key: string, exp: number, sig: string, disposition: string, fileName: string, contentType: string): boolean {
    return this.verifyToken('get', key, exp, [disposition, fileName, contentType].join('\n'), sig)
  }

  async head(key: string): Promise<StorageHead | null> {
    const { stat } = await import('node:fs/promises')
    // Проверка пути ДО try: escape каталога — ошибка, а не «нет файла».
    const path = this.filePath(key)
    try {
      const st = await stat(path)
      return { size: st.size, contentType: null }
    } catch {
      return null
    }
  }

  async readRange(key: string, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
    const { open } = await import('node:fs/promises')
    const fh = await open(this.filePath(key), 'r')
    try {
      const size = (await fh.stat()).size
      // end может быть больше файла (MAX_SAFE_INTEGER как «до конца») —
      // ограничиваем фактическим размером.
      const length = Math.max(0, Math.min(end - start + 1, size - start))
      if (length === 0) return new Uint8Array(0)
      const buf = new Uint8Array(length)
      const { bytesRead } = await fh.read(buf, 0, length, start)
      return buf.subarray(0, bytesRead)
    } finally {
      await fh.close()
    }
  }

  async putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
    void contentType
    const { mkdir, writeFile } = await import('node:fs/promises')
    const path = this.filePath(key)
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true })
    await writeFile(path, body)
  }

  async deleteObject(key: string): Promise<void> {
    const { rm } = await import('node:fs/promises')
    await rm(this.filePath(key), { force: true })
  }
}

let cached: StorageDriver | null = null

export function getStorage(): StorageDriver {
  if (cached) return cached
  const cfg = readS3Config()
  const driver: StorageDriver = cfg
    ? new S3Storage(cfg)
    : new LocalStorage(process.env.STORAGE_LOCAL_DIR?.trim() || '.storage')
  cached = driver
  return driver
}

// Для тестов: сброс singleton (после смены env в тестовом процессе).
export function resetStorageForTests(): void {
  cached = null
}

// Для локального драйвера: экспорт класса закрыт, роут получает доступ
// через getStorage() с проверкой kind.
export function getLocalStorage(): LocalStorage | null {
  const s = getStorage()
  return s instanceof LocalStorage ? s : null
}
