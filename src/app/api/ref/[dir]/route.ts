import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getEmployeeByToken, SESSION_COOKIE } from '@/lib/auth'
import { getClientByToken, CLIENT_SESSION_COOKIE } from '@/lib/client-auth'
import { getBrokerByToken, BROKER_SESSION_COOKIE } from '@/lib/broker-auth'
import { isRefDir, REF_DIRS, REF_DIR_LABELS } from '@/lib/ref'
import { listRefItems, getActiveCurrencyOptions } from '@/lib/ref-db'
import { apiErrorResponse } from '@/lib/api-errors'

// GET /api/ref/[dir] — справочник для ВСЕХ авторизованных кабинетов
// (сотрудник, клиент, брокер — карточка DF-17: «клиент и брокер получают
// только активные записи и публичные поля»).
//
// Активные записи: клиент/брокер выбирают страны, упаковку и условия
// поставки в своих формах; отключённые мастером записи из форм исчезают.
// Публичные поля: code/name/nameEn/meta — meta нужен клиенту ради
// разъяснений Инкотермс рядом с выбором (карточка DF-17); секретов в
// meta нет (собственные формулировки и флаги правил).
//
// Пустая таблица валют отдаёт запасной список money.ts (свежий деплой
// без сидажа не ломает формы — карточка DF-17).
export async function GET(req: NextRequest, { params }: { params: Promise<{ dir: string }> }) {
  const { dir } = await params
  if (!isRefDir(dir)) {
    return NextResponse.json(
      { error: `Неизвестный справочник: ${dir}`, available: REF_DIRS.map((d) => ({ dir: d, label: REF_DIR_LABELS[d] })) },
      { status: 404 }
    )
  }

  // Один эндпоинт — три кабинета: достаточно ЛЮБОЙ сессии. Без сессии —
  // 401 (IC-02: у каждого роута есть guard аутентификации).
  const jar = await cookies()
  const employee = await getEmployeeByToken(jar.get(SESSION_COOKIE)?.value)
  const client = employee ? null : await getClientByToken(jar.get(CLIENT_SESSION_COOKIE)?.value)
  const broker = employee || client ? null : await getBrokerByToken(jar.get(BROKER_SESSION_COOKIE)?.value)
  if (!employee && !client && !broker) {
    return NextResponse.json({ error: 'Требуется вход' }, { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const q = url.searchParams.get('q') ?? undefined
    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '200', 10)
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200
    const items =
      dir === 'currency'
        ? await getActiveCurrencyOptions()
        : await listRefItems(dir, { q, limit, activeOnly: true })
    return NextResponse.json({ dir, items })
  } catch (e) {
    return apiErrorResponse(e, 'ref GET', 'Не удалось загрузить справочник')
  }
}
