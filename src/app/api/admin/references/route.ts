import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { isRefDir, normalizeRefCode, type RefDir } from '@/lib/ref'
import { listRefItems } from '@/lib/ref-db'
import { apiErrorResponse } from '@/lib/api-errors'
import { z } from 'zod'

// GET /api/admin/references?dir=&q=&active= — список записей справочника
// для экрана /admin/references (DF-17). Чтение — любой сотрудник
// (справочники — общее знание кабинета); изменения — write:true (P1-09).
// Включает отключённые записи — управление видно целиком; фильтр
// active=true сужает до включённых.
export async function GET(req: NextRequest) {
  const auth = await requireEmployee(req)
  if (!auth.ok) return auth.response
  try {
    const url = new URL(req.url)
    const dir = url.searchParams.get('dir')
    const q = url.searchParams.get('q') ?? undefined
    const activeOnly = url.searchParams.get('active') === 'true'
    if (!isRefDir(dir)) {
      return NextResponse.json({ error: 'Укажите dir справочника' }, { status: 400 })
    }
    const items = await listRefItems(dir, { q, activeOnly })
    // Последний известный курс (для dir=currency): пометка «курс на дату»
    // рядом с валютой — сбой импорта виден сразу (DF-17).
    let rates: { date: string; items: { code: string; nominal: number; value: string }[] } | null = null
    if (dir === 'currency') {
      const latest = await db.currencyRate.findFirst({ orderBy: [{ date: 'desc' }] })
      if (latest) {
        const rows = await db.currencyRate.findMany({ where: { date: latest.date } })
        rates = {
          date: latest.date.toISOString().slice(0, 10),
          items: rows.map((r) => ({ code: r.code, nominal: r.nominal, value: r.value.toString() })),
        }
      }
    }
    return NextResponse.json({ dir, items, rates })
  } catch (e) {
    return apiErrorResponse(e, 'references GET', 'Не удалось загрузить справочник')
  }
}

// POST /api/admin/references — добавить запись (мастер/менеджер, P1-09).
// no-event: цель — строка справочника, не сделка (сделочные события не
// заводятся; инвентаризация справочника — docs/REFERENCES-SOURCES.md).
const CreateRefSchema = z.object({
  dir: z.string().refine((v) => isRefDir(v), 'Неизвестный справочник'),
  code: z.string().trim().min(1, 'Укажите код').max(10, 'Код — до 10 знаков'),
  name: z.string().trim().min(1, 'Укажите название').max(120),
  nameEn: z.string().trim().max(120).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true })
  if (!auth.ok) return auth.response
  try {
    const parsed = CreateRefSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Некорректное тело' }, { status: 400 })
    }
    const data = parsed.data
    const dir = data.dir as RefDir
    const code = normalizeRefCode(dir, data.code)
    // Код уникален внутри dir: дубль — осознанный 409 (молчаливый дубль
    // плодил бы две записи с одним кодом и разными именами).
    const dup = await db.refItem.findUnique({ where: { dir_code: { dir, code } } })
    if (dup) {
      return NextResponse.json({ error: `Код ${code} уже есть в справочнике` }, { status: 409 })
    }
    const item = await db.refItem.create({
      data: {
        dir,
        code,
        name: data.name,
        ...(data.nameEn ? { nameEn: data.nameEn } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        isActive: true,
      },
    })
    return NextResponse.json({ item }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e, 'references POST', 'Не удалось добавить запись')
  }
}
