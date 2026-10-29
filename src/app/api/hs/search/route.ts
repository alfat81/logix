import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { getClientByToken, CLIENT_SESSION_COOKIE } from '@/lib/client-auth'
import { getBrokerByToken, BROKER_SESSION_COOKIE } from '@/lib/broker-auth'
import { searchHsCodes, HS_SEARCH_LIMIT_DEFAULT, HS_SEARCH_LIMIT_MAX } from '@/lib/hs-db'
import { apiErrorResponse } from '@/lib/api-errors'

// GET /api/hs/search?q=&limit= — поиск по справочнику ТН ВЭД (DF-17C)
// для ВСЕХ авторизованных кабинетов. Клиенту эндпоинт не запрещён
// (справочник открыт, секретов нет), но Combobox кода клиенту не
// показывается — он даёт описание товара и видит код read-only
// (карточка DF-17C, e2e — DF-18).
//
// Поиск: цифровой запрос — префикс кода («0101», «0101 21» → 010121),
// иначе — вхождение в наименование. Отдаются только позиции текущей
// редакции (validTo IS NULL); ставка ЕТТ — подсказка, НЕ автоподстановка
// (брокер вносит ставку из своей Альты, DF-18).
export async function GET(req: NextRequest) {
  // Любая из трёх сессий — достаточно (IC-02: guard на каждом роуте).
  const jar = await cookies()
  const employee = await getEmployeeByToken(jar.get(SESSION_COOKIE)?.value)
  const client = employee ? null : await getClientByToken(jar.get(CLIENT_SESSION_COOKIE)?.value)
  const broker = employee || client ? null : await getBrokerByToken(jar.get(BROKER_SESSION_COOKIE)?.value)
  if (!employee && !client && !broker) {
    return NextResponse.json({ error: 'Требуется вход' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').slice(0, 200)
    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? String(HS_SEARCH_LIMIT_DEFAULT), 10)
    const limit = Number.isFinite(limitRaw) ? limitRaw : HS_SEARCH_LIMIT_DEFAULT
    const result = await searchHsCodes(q, { limit: Math.min(limit, HS_SEARCH_LIMIT_MAX) })
    return NextResponse.json(result)
  } catch (e) {
    return apiErrorResponse(e, 'hs search GET', 'Не удалось выполнить поиск по ТН ВЭД')
  }
}
