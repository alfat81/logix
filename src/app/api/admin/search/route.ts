import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { ciContains, MAX_QUERY_LENGTH } from '@/lib/list-query'
import { phoneVariants } from '@/lib/phone'
import { MIN_QUERY_LENGTH, SEARCH_TAKE } from '@/lib/search-constants'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── GET /api/admin/search — глобальный поиск Ж7 ────────────────────
// Поиск «менеджер снял трубку / открыл вкладку и сразу нашёл»: строка
// ?q= ищет ЗАЯВКИ (номер, клиент, телефон, ТН ВЭД — набор полей как в
// списке Ж4, чтобы глобальный поиск не был хуже спискового) и ЛИДЫ
// (имя/телефон контакта из rawContact или связанного клиента).
// Ответ — две секции по SEARCH_TAKE строк, без пагинации: это
// typeahead-дропдаун в шапке, а не список; исчерпывающий результат —
// в разделах со списками.
//
// Схема НЕ меняется — db:push живой базе после j7 не нужен.

// ── Лиды: чтение rawContact без жёсткой формы ──────────────────────
// rawContact — толерантный Json (В1): известные ключи читаем мягко,
// чужую/старую структуру молча пропускаем (паттерн readLeadCargo).
function rawContactText(raw: unknown, key: 'name' | 'phone'): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = (raw as Record<string, unknown>)[key]
  return typeof v === 'string' && v.trim() ? v : null
}

export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response

  const q = (req.nextUrl.searchParams.get('q') ?? '')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)

  // Короткий запрос — не ошибка, а «ещё не ищем»: 200 с пустыми
  // секциями, UI по MIN_QUERY_LENGTH покажет подсказку.
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ orders: [], leads: [] })
  }

  const variants = phoneVariants(q)
  const qLower = q.toLowerCase()

  try {
    // ── Заявки: SQL-поиск (паттерн Ж4, работает в обоих мирах БД) ──
    const orderFilters: Prisma.OrderWhereInput[] = [
      { number: ciContains(q) },
      { hsCode: ciContains(q) },
      { customer: { name: ciContains(q) } },
      { customer: { phone: ciContains(q) } },
    ]
    for (const v of variants) {
      // Телефон клиента нормализован — ищем содержимое цифр напрямую,
      // регистр для цифр не важен (mode у contains безвреден).
      orderFilters.push({ customer: { phone: { contains: v } } })
    }

    // ── Лиды: JS-фильтр по недавним ────────────────────────────────
    // Почему не SQL: rawContact — Json, а sqlite-клиент Prisma не
    // принимает path-фильтры по Json (урок смоука Ж5). Два мира БД
    // должны искать одинаково, поэтому один код-путь: берём
    // LEAD_SCAN_LIMIT свежих лидов (по updatedAt — как сортируется
    // воронка) и фильтруем в JS. Объём честно ограничен: для
    // MVP-воронки это с запасом, а для боевой базы JS-скан заменится
    // на SQL вместе с Ж6а (когда у лида появится поиск в списке).
    const LEAD_SCAN_LIMIT = 500

    const [orders, leadCandidates] = await Promise.all([
      db.order.findMany({
        where: { OR: orderFilters },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: SEARCH_TAKE,
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: { name: true } },
        },
      }),
      db.lead.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: LEAD_SCAN_LIMIT,
        select: {
          id: true,
          status: true,
          createdAt: true,
          rawContact: true,
          customer: { select: { name: true, phone: true } },
        },
      }),
    ])

    const leads: { id: string; status: string; createdAt: Date; contactName: string }[] = []
    for (const lead of leadCandidates) {
      if (leads.length >= SEARCH_TAKE) break

      // Имя: сырой контакт приоритетнее справочника (у лида без
      // клиента его и нет); телефон — тот, что реально назвали.
      const name = rawContactText(lead.rawContact, 'name') ?? lead.customer?.name ?? ''
      const phone = rawContactText(lead.rawContact, 'phone') ?? lead.customer?.phone ?? ''
      const phoneDigits = phone.replace(/\D/g, '')

      const byName = name.toLowerCase().includes(qLower)
      const byPhone =
        phone.includes(q) || (variants.length > 0 && variants.some((v) => phoneDigits.includes(v)))
      if (!byName && !byPhone) continue

      leads.push({ id: lead.id, status: lead.status, createdAt: lead.createdAt, contactName: name })
    }

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        customerName: o.customer.name,
      })),
      leads: leads.map((l) => ({
        id: l.id,
        status: l.status,
        createdAt: l.createdAt,
        contactName: l.contactName,
      })),
    })
  } catch (e) {
    return apiErrorResponse(e, 'search GET', 'Не удалось выполнить поиск')
  }
}
