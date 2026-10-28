import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { normalizePhone, phoneVariants } from '@/lib/phone'
import { parseListQuery } from '@/lib/list-query'
import {
  parseEmployeeRoles,
  CreateEmployeeSchema,
  EMPLOYEE_PUBLIC_FIELDS,
} from '@/lib/employees'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── Справочник сотрудников (Ж6в) ──────────────────────────────────
// «Создание, роли, деактивация, сброс пароля — только мастер» (очередь).
// Мастер-only — ВЕСЬ роут, включая чтение: список раскрывает телефоны
// и роли всех учёток кабинета, менеджеру это знание не нужно (меню
// «Сотрудники» тоже видно только мастеру — см. AdminNav). API при
// этом остаётся единственной защитой: UI-блоки — удобство.
//
// Схема БД не менялась вовсе: Employee (А5) уже хранит роли JSON-
// строкой, isActive и пароль — Ж6в только открывает ими управление.

// ─── GET /api/admin/employees — список (паттерн Ж4) ───────────────
// ?q=&sort=&take=&skip= + hasMore + counts. Потребителей-легаси нет
// (новый роут), режим один — список.
//
// Фильтр и сортировка — в JS по образцу юрлиц Ж6б, осознанно: таблица
// командного размера, а корректная сортировка русских имён — locale-
// Compare('ru'), которой в SQL sqlite нет. Поиск: имя (регистр честно
// нечувствителен в JS в обоих мирах) + телефон по вариантам набора
// (phoneVariants: «8 900 555 01 05» и «9005550107» находят +7900…).
const EMPLOYEE_SORTS = ['name_asc', 'name_desc', 'newest', 'oldest'] as const

export async function GET(req: NextRequest) {
  // roles без write: это чтение, но привилегированное — как флаг
  // обязательности этапов в Ж6б, только здесь периметр — весь роут.
  const auth = await requireEmployee(req, { roles: ['master'] })
  if (!auth.ok) return auth.response

  const params = req.nextUrl.searchParams
  try {
    const parsed = parseListQuery(params, {
      allowedSorts: EMPLOYEE_SORTS,
      defaultSort: 'name_asc',
    })
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { q, sort, take, skip } = parsed

    const all = await db.employee.findMany({ select: EMPLOYEE_PUBLIC_FIELDS })

    const needle = q.toLowerCase()
    const variants = phoneVariants(q)
    const filtered = q
      ? all.filter(
          (e) =>
            e.name.toLowerCase().includes(needle) ||
            variants.some((v) => e.phone.includes(v))
        )
      : [...all]

    filtered.sort((a, b) => {
      switch (sort) {
        case 'name_desc':
          return b.name.localeCompare(a.name, 'ru') || a.id.localeCompare(b.id)
        case 'newest':
          return b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)
        case 'oldest':
          return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
        default:
          return a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id)
      }
    })

    const hasMore = skip + take < filtered.length
    const page = filtered.slice(skip, skip + take)

    return NextResponse.json({
      employees: page.map((e) => ({ ...e, roles: parseEmployeeRoles(e.roles) })),
      hasMore,
      counts: { all: filtered.length },
    })
  } catch (e) {
    return apiErrorResponse(e, 'employees GET', 'Не удалось загрузить сотрудников')
  }
}

// ─── POST /api/admin/employees — создать (Ж6в) ────────────────────
// Стартовый пароль задаёт мастер и передаёт сотруднику лично (паттерн
// рождения подрядчика Г2); сотруднику сменить пароль самому — отдель-
// ной фичи нет (вне периметра Ж6в), сброс — тоже мастер.
export async function POST(req: NextRequest) {
  const auth = await requireEmployee(req, { write: true, roles: ['master'] })
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const parsed = CreateEmployeeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Телефон обязан нормализоваться: логин А5 нормализует вход и
    // иначе не пускает — сырой иностранный номер сделал бы учётку
    // мертворождённой. Отличие от PATCH подрядчика (сырой фолбэк)
    // осознанное: там ЛК tolerate, здесь — нет.
    const phone = normalizePhone(parsed.data.phone)
    if (!phone) {
      return NextResponse.json(
        {
          error:
            'Телефон — логин кабинета: укажите российский номер, который приводится к +7XXXXXXXXXX',
        },
        { status: 400 }
      )
    }

    const phoneOwner = await db.employee.findUnique({
      where: { phone },
      select: { name: true },
    })
    if (phoneOwner) {
      return NextResponse.json(
        { error: `Телефон уже используется сотрудником «${phoneOwner.name}» — укажите другой` },
        { status: 409 }
      )
    }

    const employee = await db.employee.create({
      data: {
        name: parsed.data.name,
        phone,
        // DF-02: контактный email (необязателен; непустой — валиден по схеме).
        ...(parsed.data.email !== undefined ? { email: parsed.data.email } : {}),
        password: hashPassword(parsed.data.password),
        roles: JSON.stringify(parsed.data.roles),
      },
      select: EMPLOYEE_PUBLIC_FIELDS,
    })

    return NextResponse.json(
      { employee: { ...employee, roles: parseEmployeeRoles(employee.roles) } },
      { status: 201 }
    )
  } catch (e) {
    return apiErrorResponse(e, 'employees POST', 'Не удалось создать сотрудника')
  }
}
