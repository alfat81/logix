// no-event: capability-роут локального драйвера (аналог presigned URL S3) — бизнес-событий нет, авторизация HMAC-подписью
import { NextRequest, NextResponse } from 'next/server'
import { getLocalStorage, StorageError } from '@/lib/storage'
import { getSetting } from '@/lib/settings'

type Params = { params: Promise<{ key: string[] }> }

// ─── Локальный драйвер хранилища (DF-11, dev/e2e «fake-хранилище») ──
// Работает ТОЛЬКО когда S3_* не настроены (getLocalStorage вернёт null
// на проде с настроенным S3 — роут молча отвечает 404). Роль presigned
// URL из S3 играет HMAC-подписанная ссылка-возможность: op, ключ, срок
// и (для GET) disposition/имя/тип — в подписи, подделать нельзя.
// Авторизация сессией НЕ проверяется сознательно — это точный аналог
// presigned URL S3, Capability живёт ≤10 минут (PUT) / 60 секунд (GET).

export async function PUT(req: NextRequest, { params }: Params) {
  const local = getLocalStorage()
  if (!local) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const { key: segments } = await params
  const key = segments.map(decodeURIComponent).join('/')
  const url = new URL(req.url)
  const exp = Number(url.searchParams.get('exp') ?? '0')
  const sig = url.searchParams.get('sig') ?? ''
  const contentType = req.headers.get('content-type') ?? 'application/octet-stream'

  if (!local.verifyToken('put', key, exp, contentType, sig)) {
    return NextResponse.json({ error: 'Ссылка недействительна или истекла' }, { status: 403 })
  }

  // Лимит — настройка files.max_mb (как на confirm, но до приёма тела).
  const maxBytes = (await getSetting('files.max_mb')) * 1024 * 1024
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > maxBytes) {
    return NextResponse.json(
      { error: `Файл больше ${Math.floor(maxBytes / (1024 * 1024))} МБ` },
      { status: 413 }
    )
  }

  const body = new Uint8Array(await req.arrayBuffer())
  if (body.length > maxBytes) {
    return NextResponse.json(
      { error: `Файл больше ${Math.floor(maxBytes / (1024 * 1024))} МБ` },
      { status: 413 }
    )
  }
  try {
    await local.putObject(key, body, contentType)
  } catch (e) {
    if (e instanceof StorageError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
  return new NextResponse(null, { status: 200 })
}

export async function GET(req: NextRequest, { params }: Params) {
  const local = getLocalStorage()
  if (!local) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const { key: segments } = await params
  const key = segments.map(decodeURIComponent).join('/')
  const url = new URL(req.url)
  const exp = Number(url.searchParams.get('exp') ?? '0')
  const sig = url.searchParams.get('sig') ?? ''
  const disposition = url.searchParams.get('d') === 'inline' ? 'inline' : 'attachment'
  const fileName = url.searchParams.get('n') ?? 'file'
  const contentType = url.searchParams.get('t') ?? 'application/octet-stream'

  if (!local.parseGetToken(key, exp, sig, disposition, fileName, contentType)) {
    return NextResponse.json({ error: 'Ссылка недействительна или истекла' }, { status: 403 })
  }

  try {
    const bytes = await local.readRange(key, 0, Number.MAX_SAFE_INTEGER)
    const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    const isImage = contentType.startsWith('image/')
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        ...(isImage
          ? { 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }
          : {}),
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Объект не найден' }, { status: 404 })
  }
}
