import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentEmployee } from '@/lib/auth'
import { getCurrentClient } from '@/lib/client-auth'
import { getCurrentBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { documentVisibleToBroker, documentVisibleToClient } from '@/lib/documents'
import { DOC_INLINE_MIME } from '@/lib/document-constants'

type Params = { params: Promise<{ id: string }> }

// ─── Скачивание файла версии (Е) — единственная точка выдачи ──────
// Публичных URL у файлов нет: байты живут в БД и покидают её только
// через этот роут. Ссылка вида /api/document-versions/[id]/file
// открывается браузером напрямую (куки уходят сами) — поэтому авторизация
// по кукам, а не по заголовку. Право доступа проверяется по первой
// подошедшей сессии, приоритет от широкой к узкой:
//   сотрудник — любые документы (внутренние тоже);
//   клиент    — свои сделки, не внутренние;
//   брокер    — связанные сделки, не внутренние (won-лиды скрыты, Д).
// Подрядчик в контуре Е отсутствует — его кука здесь не проверяется
// вовсе. Чужое/внутреннее/несуществующее — единый 404: факт
// существования не раскрываем (паттерн И1).

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    // ── Периметр ПЕРЕД поиском версии: без какой-либо сессии — 401
    // на любом id (периметр не зависит от существования ресурса);
    // сессия есть, а версии нет/не ваша — единый 404.
    let actorKind: 'employee' | 'client' | 'broker' | null = null
    let clientId: string | null = null
    let brokerId: string | null = null

    const employee = await getCurrentEmployee(req)
    if (employee) {
      actorKind = 'employee'
    } else {
      const client = await getCurrentClient(req)
      if (client) {
        actorKind = 'client'
        clientId = client.id
      } else {
        const broker = await getCurrentBroker(req)
        if (broker) {
          actorKind = 'broker'
          brokerId = broker.id
        }
      }
    }

    if (!actorKind) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }

    const version = await db.documentVersion.findUnique({
      where: { id },
      select: {
        fileName: true,
        mimeType: true,
        fileSize: true,
        fileData: true,
        documentId: true,
      },
    })
    if (!version) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })
    }

    let allowed: boolean
    if (actorKind === 'employee') {
      allowed = true
    } else if (actorKind === 'client') {
      const doc = await documentVisibleToClient(version.documentId, clientId!)
      allowed = doc !== null
    } else {
      const doc = await documentVisibleToBroker(version.documentId, brokerId!)
      allowed = doc !== null
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })
    }

    // Inline отдаём только форматам, безопасным для рендера браузером
    // (PDF, картинки) — предпросмотр в одну клику; офисные документы и
    // архивы — attachment, без интерпретации. nosniff запрещает браузеру
    // додумывать тип мимо заголовка.
    const disposition = (DOC_INLINE_MIME as readonly string[]).includes(version.mimeType)
      ? 'inline'
      : 'attachment'
    const asciiFallback = version.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')

    return new NextResponse(new Uint8Array(version.fileData), {
      status: 200,
      headers: {
        'Content-Type': version.mimeType,
        'Content-Length': String(version.fileSize),
        'Content-Disposition': `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(version.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'document version file GET', 'Не удалось отдать файл')
  }
}
