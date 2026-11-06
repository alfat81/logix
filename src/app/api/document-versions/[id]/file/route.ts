import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentEmployee } from '@/lib/auth'
import { getCurrentClient } from '@/lib/client-auth'
import { getCurrentBroker } from '@/lib/broker-auth'
import { apiErrorResponse } from '@/lib/api-errors'
import { documentVisibleToBroker, documentVisibleToClient, type DocActor } from '@/lib/documents'
import { documentEventAudience } from '@/lib/audience'
import { emitEvent } from '@/lib/events'
import { DOC_INLINE_MIME } from '@/lib/document-constants'
import { resolveFileMime } from '@/lib/file-signature'
import { getStorage, StorageError, STORAGE_GET_EXPIRES } from '@/lib/storage'

type Params = { params: Promise<{ id: string }> }

// ─── Скачивание файла версии (Е) — единственная точка выдачи ──────
// Публичных URL у файлов нет. Ссылка вида /api/document-versions/[id]/file
// открывается браузером напрямую (куки уходят сами) — поэтому авторизация
// по кукам, а не по заголовку. Право доступа проверяется по первой
// подошедшей сессии, приоритет от широкой к узкой:
//   сотрудник — любые документы (внутренние тоже);
//   клиент    — свои сделки, не внутренние;
//   брокер    — связанные сделки, не внутренние (won-лиды скрыты, Д).
// Права проверяются ДО любого чтения тела (карточка DF-11); чужое/
// внутреннее/несуществующее — единый 404 (паттерн И1).
// DF-11: версия со storageKey → 302 на presigned GET (60 с, disposition
// в подписи); легаси-версия (байты в БД) — потоковая отдача 200, как
// было, с повторной проверкой сигнатуры для inline.

// Событие скачивания (DF-26 §6.2, уточнения 1.1/1.2): 302 →
// document_link_issued («выдана ссылка», передача НЕ подтверждена);
// стрим легаси-версии (200) → document_downloaded (сервер отдал байты).
// Актёр — читатель; аудитория — по isInternal документа; писем нет (O5).
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    // ── Периметр ПЕРЕД поиском версии: без какой-либо сессии — 401
    // на любом id (периметр не зависит от существования ресурса);
    // сессия есть, а версии нет/не ваша — единый 404.
    let actor: DocActor | null = null
    let clientId: string | null = null
    let brokerId: string | null = null

    const employee = await getCurrentEmployee(req)
    if (employee) {
      actor = { type: 'employee', id: employee.id, name: employee.name }
    } else {
      const client = await getCurrentClient(req)
      if (client) {
        actor = { type: 'client', id: client.userId, name: client.name }
        clientId = client.id
      } else {
        const broker = await getCurrentBroker(req)
        if (broker) {
          actor = { type: 'broker', id: broker.userId, name: broker.companyName }
          brokerId = broker.id
        }
      }
    }

    if (!actor) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }
    const actorKind = actor.type

    // fileData в select НЕ входит: права решаются до чтения тела, а
    // байты легаси-версии читаются отдельным запросом после проверки.
    const version = await db.documentVersion.findUnique({
      where: { id },
      select: {
        fileName: true,
        mimeType: true,
        fileSize: true,
        storageKey: true,
        status: true,
        documentId: true,
        document: {
          select: { title: true, isInternal: true, orderId: true, leadId: true },
        },
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

    // ── DF-26 §6.2: событие скачивания — цель-сделка берётся с
    // документа (заявка/запрос), аудитория по isInternal.
    const deal = version.document.orderId
      ? { orderId: version.document.orderId }
      : { leadId: version.document.leadId! }
    const audience = documentEventAudience(version.document.isInternal)
    const emitDownloadEvent = (type: 'document_link_issued' | 'document_downloaded') =>
      emitEvent(db, {
        target: deal,
        actor,
        type,
        description:
          type === 'document_link_issued'
            ? `Выдана ссылка на скачивание: «${version.document.title}» (${version.fileName})`
            : `Документ «${version.document.title}» скачан (${version.fileName})`,
        documentId: version.documentId,
        audience,
      })

    const asciiFallback = version.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    const dispositionHeader = (value: string) =>
      `${value}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(version.fileName)}`

    // ── DF-11: подтверждённая версия в хранилище → 302 на presigned GET.
    // Сигнатура уже проверена на confirm (обязательное условие ready),
    // inline — по белому списку MIME. pending/недозагруженная — 404.
    if (version.storageKey) {
      if (version.status !== 'ready') {
        return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })
      }
      const inline = (DOC_INLINE_MIME as readonly string[]).includes(version.mimeType)
      try {
        const location = await getStorage().presignGet(version.storageKey, {
          disposition: inline ? 'inline' : 'attachment',
          fileName: version.fileName,
          // attachment без интерпретации браузером; inline — честный тип.
          contentType: inline ? version.mimeType : 'application/octet-stream',
          expiresIn: STORAGE_GET_EXPIRES,
        })
        await emitDownloadEvent('document_link_issued')
        return new NextResponse(null, {
          status: 302,
          headers: {
            Location: location,
            'Cache-Control': 'private, no-store',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        })
      } catch (e) {
        if (e instanceof StorageError) {
          return NextResponse.json({ error: 'Хранилище недоступно' }, { status: 503 })
        }
        throw e
      }
    }

    // ── Легаси: байты в БД. Inline — только PDF и картинкам, и только
    // если содержимое реально совпадает с типом (повторная проверка
    // сигнатуры защищает и файлы, загруженные до E0-07). Всё остальное —
    // attachment как application/octet-stream, без интерпретации браузером.
    const row = await db.documentVersion.findUnique({
      where: { id },
      select: { fileData: true },
    })
    if (!row || !row.fileData) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 404 })
    }
    const bytes = new Uint8Array(row.fileData)
    const verified = resolveFileMime(version.mimeType, version.fileName, bytes) === version.mimeType
    const inline = verified && (DOC_INLINE_MIME as readonly string[]).includes(version.mimeType)
    const disposition = inline ? 'inline' : 'attachment'
    const contentType = verified ? version.mimeType : 'application/octet-stream'
    const isImage = contentType.startsWith('image/')

    // Стрим легаси-версии — подтверждённая сервером передача (§6.2).
    await emitDownloadEvent('document_downloaded')
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(version.fileSize),
        'Content-Disposition': dispositionHeader(disposition),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        // Картинка открывается в изолированном контексте без скриптов.
        // PDF sandbox не ставим: Chrome не рендерит PDF в sandbox-документе
        ...(isImage ? { 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (e) {
    return apiErrorResponse(e, 'document version file GET', 'Не удалось отдать файл')
  }
}
