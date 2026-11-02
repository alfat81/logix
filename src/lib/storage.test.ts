import { afterAll, describe, expect, it } from 'vitest'
import {
  buildDocStorageKey,
  getLocalStorage,
  getStorage,
  readS3Config,
  resetStorageForTests,
  STORAGE_GET_EXPIRES,
  STORAGE_PUT_EXPIRES,
} from './storage'

// ─── DF-11 «Хранилище файлов»: unit ─────────────────────────────────
// Карточка DF-11, проверки: «unit: подпись запроса, …». Здесь — конфиг
// из env, формат ключей, подпись ссылок локального драйвера (op/ключ/
// срок в HMAC, подделка и просрочка отклоняются) и форма presigned URL
// S3 (X-Amz-Signature, virtual-host) — всё без сети.

const ENV_KEYS = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_FORCE_PATH_STYLE', 'STORAGE_LOCAL_DIR'] as const

afterAll(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  resetStorageForTests()
})

describe('readS3Config (провайдер — env, не код; D32/D36)', () => {
  it('полный набор S3_* → конфиг s3', () => {
    Object.assign(process.env, {
      S3_ENDPOINT: 'https://s3.cloud.ru',
      S3_REGION: 'ru-central-1',
      S3_BUCKET: 'logix-files',
      S3_ACCESS_KEY_ID: 'tenant:key1',
      S3_SECRET_ACCESS_KEY: 'secret',
    })
    resetStorageForTests()
    const cfg = readS3Config()
    expect(cfg).not.toBeNull()
    expect(cfg!.kind).toBe('s3')
    expect(cfg!.region).toBe('ru-central-1')
    expect(cfg!.forcePathStyle).toBe(false)
  })

  it('без S3_* → null (локальный драйвер); FORCE_PATH_STYLE читается', () => {
    for (const k of ENV_KEYS) delete process.env[k]
    resetStorageForTests()
    expect(readS3Config()).toBeNull()
    expect(getStorage().kind).toBe('local')
    Object.assign(process.env, {
      S3_ENDPOINT: 'https://s3.cloud.ru',
      S3_BUCKET: 'logix-files',
      S3_ACCESS_KEY_ID: 'tenant:key1',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'true',
    })
    resetStorageForTests()
    expect(readS3Config()!.forcePathStyle).toBe(true)
    for (const k of ENV_KEYS) delete process.env[k]
    resetStorageForTests()
  })


})

describe('buildDocStorageKey (без ПДн, уникален по построению)', () => {
  it('docs/<id сделки>/<uuid>/<имя>', () => {
    const key = buildDocStorageKey('deal-123', 'инвойс №1.pdf')
    expect(key).toMatch(/^docs\/deal-123\/[0-9a-f-]{36}\/инвойс №1\.pdf$/)
    // Уникальность по построению: uuid на каждый вызов.
    expect(key).not.toBe(buildDocStorageKey('deal-123', 'инвойс №1.pdf'))
  })
})

describe('локальный драйвер: подписи ссылок-возможностей', () => {
  const local = () => {
    resetStorageForTests()
    return getLocalStorage()
  }

  it('presignPut: /api/storage/local/<key>?exp&sig, срок по умолчанию 600 с', async () => {
    const l = local()!
    const ticket = await l.presignPut('docs/d1/x.pdf', { contentType: 'application/pdf' })
    expect(ticket.method).toBe('PUT')
    expect(ticket.expiresIn).toBe(STORAGE_PUT_EXPIRES)
    expect(ticket.headers['Content-Type']).toBe('application/pdf')
    expect(ticket.url).toContain('/api/storage/local/docs/d1/x.pdf?')
    expect(ticket.url).toMatch(/exp=\d+/)
    expect(ticket.url).toMatch(/sig=[0-9a-f]{64}/)
  })

  it('verifyToken: верная подпись/срок — да; чужой ключ — нет; просрочка — нет', async () => {
    const l = local()!
    const ticket = await l.presignPut('docs/d1/x.pdf', { contentType: 'application/pdf' })
    const params = new URL('http://x' + ticket.url).searchParams
    const exp = Number(params.get('exp'))
    const sig = params.get('sig')!
    expect(l.verifyToken('put', 'docs/d1/x.pdf', exp, 'application/pdf', sig)).toBe(true)
    expect(l.verifyToken('put', 'docs/d2/other.pdf', exp, 'application/pdf', sig)).toBe(false)
    expect(l.verifyToken('put', 'docs/d1/x.pdf', exp, 'text/html', sig)).toBe(false)
    expect(l.verifyToken('put', 'docs/d1/x.pdf', exp - 10, 'application/pdf', sig)).toBe(false)
  })

  it('presignGet: disposition/имя/тип в подписи, 60 с', async () => {
    const l = local()!
    const url = await l.presignGet('docs/d1/x.pdf', {
      disposition: 'inline',
      fileName: 'инвойс.pdf',
      contentType: 'application/pdf',
    })
    expect(url).toContain('/api/storage/local/docs/d1/x.pdf?')
    expect(url).toMatch(/exp=\d+/)
    const params = new URL('http://x' + url).searchParams
    // Подпись при подмене disposition не проходит (inline нельзя превратить
    // в attachment без новой подписи — и наоборот).
    expect(l.parseGetToken('docs/d1/x.pdf', Number(params.get('exp')), params.get('sig')!, 'inline', 'инвойс.pdf', 'application/pdf')).toBe(true)
    expect(l.parseGetToken('docs/d1/x.pdf', Number(params.get('exp')), params.get('sig')!, 'attachment', 'инвойс.pdf', 'application/pdf')).toBe(false)
    expect(STORAGE_GET_EXPIRES).toBe(60)
  })

  it('putObject → head → readRange → deleteObject (roundtrip)', async () => {
    const l = local()!
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    await l.putObject('docs/rt/x.pdf', bytes, 'application/pdf')
    const head = await l.head('docs/rt/x.pdf')
    expect(head?.size).toBe(8)
    const first = await l.readRange('docs/rt/x.pdf', 0, 3)
    expect(Array.from(first)).toEqual([0x25, 0x50, 0x44, 0x46])
    const tail = await l.readRange('docs/rt/x.pdf', 0, Number.MAX_SAFE_INTEGER)
    expect(tail.length).toBe(8)
    await l.deleteObject('docs/rt/x.pdf')
    expect(await l.head('docs/rt/x.pdf')).toBeNull()
    // Повторное удаление отсутствующего — безопасно (идемпотентность).
    await l.deleteObject('docs/rt/x.pdf')
  })

  it('путь с .. отклоняется (escape каталога)', async () => {
    const l = local()!
    await expect(l.head('../secrets.env')).rejects.toThrow()
  })
})

describe('S3 presigned URL (aws4fetch, без сети)', () => {
  it('PUT: X-Amz-Signature в query, virtual-host бакета', async () => {
    Object.assign(process.env, {
      S3_ENDPOINT: 'https://s3.cloud.ru',
      S3_REGION: 'ru-central-1',
      S3_BUCKET: 'logix-files',
      S3_ACCESS_KEY_ID: 'tenant:key1',
      S3_SECRET_ACCESS_KEY: 'secret',
    })
    resetStorageForTests()
    const storage = getStorage()
    expect(storage.kind).toBe('s3')
    const ticket = await storage.presignPut('docs/d1/x.pdf', { contentType: 'application/pdf' })
    const url = new URL(ticket.url)
    expect(url.host).toBe('logix-files.s3.cloud.ru')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(STORAGE_PUT_EXPIRES))
    expect(url.pathname).toBe('/docs/d1/x.pdf')
  })

  it('GET: response-content-disposition в подписанном query', async () => {
    const storage = getStorage()
    const url = await storage.presignGet('docs/d1/x.pdf', {
      disposition: 'attachment',
      fileName: 'a.pdf',
      contentType: 'application/pdf',
    })
    const u = new URL(url)
    expect(u.searchParams.get('response-content-disposition')).toContain('attachment')
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('S3_FORCE_PATH_STYLE → путь-style URL', async () => {
    Object.assign(process.env, {
      S3_ENDPOINT: 'https://s3.cloud.ru',
      S3_BUCKET: 'logix-files',
      S3_ACCESS_KEY_ID: 'tenant:key1',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'true',
    })
    resetStorageForTests()
    const ticket = await getStorage().presignPut('docs/d1/x.pdf')
    expect(new URL(ticket.url).host).toBe('s3.cloud.ru')
    expect(new URL(ticket.url).pathname.startsWith('/logix-files/docs/')).toBe(true)
    for (const k of ENV_KEYS) delete process.env[k]
    resetStorageForTests()
  })


})
