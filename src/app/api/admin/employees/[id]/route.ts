import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEmployee } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { normalizePhone } from '@/lib/phone'
import { parseEmployeeRoles, PatchEmployeeSchema, EMPLOYEE_PUBLIC_FIELDS } from '@/lib/employees'
import { apiErrorResponse } from '@/lib/api-errors'

// ─── PATCH /api/admin/employees/[id] — управление учёткой (Ж6в) ──
// Единственный write-роут сотрудника: имя, телефон-логин, сброс
// пароля, роли, деактивация/возврат. Всё — только мастер (очередь).
// DELETE не существует вовсе — «удаление» = isActive=false: на
// сотруднике висят сессии, а имена-актёры в журнале Ж2 — снимки,
// историю не переписываем (симметрия с подрядчиками Г3 и юрлицами
// Ж6б).
//
// Две защиты от «выстрелить себе в ногу», обе — 400 (дело не в правах,
// а в недопустимой операции — как «нечего обновлять» и край списка
// в Ж6б):
//
//   1. СЕБЯ нельзя деактивировать и нельзя снять с себя роль мастера —
//      своя сессия умрёт мгновенно, и даже при другом мастере это
//      UX-ловушка: «деактивировал себя и вылетел».
//   2. ПОСЛЕДНЕГО активного мастера нельзя ни деактивировать, ни
//      разжаловать — иначе в системе не останется никого, кто может
//      управлять учётками, включая возврат этого решения.
//      Честно о достижимости: сегодня эта ветка прикрыта проверками
//      себя — актёр роута всегда активный мастер, значит при цели
//      «не-я» второй активный мастер уже существует. Предохранитель
//      оставлен как страховка на расширение прав (будущая роль
//      department_head из роадмапа 1а, пакетные операции): инвариант
//      «хотя бы один активный мастер» должен держать код, а не
//      удачное сочетание проверок выше.
//
// Сессии (EmployeeSession) рвём в двух случаях, оба — «доступ больше
// не считается доверенным»:
//   • сброс пароля — закрывает вход, ГДЕ пароль уже введён (утёк,
//     уволился): все сессии сотрудника, включая собственную сессию
//     мастера при сбросе себе (UI предупреждает);
//   • деактивация — getEmployeeByToken и так не пускает неактивного,
//     но строки сессий не должны «воскреснуть» при реактивации через
//     месяц: деактивация означает «никакого доступа сейчас».
// Роли НЕ рвут сессии: роли читаются из БД живьём на каждом запросе
// (getEmployeeByToken парсит employee.roles) — смена роли применяется
// к существующим сессиям немедленно и без теневых дверей.
//
// События в журнал Ж2 НЕ пишутся — осознанно: цель Activity — ровно
// одна из {заявка, лид, подрядчик}, событие управления доступом цели
// не имеет. Расширять модель ради аудита учёток — будущая очередь
// (если она понадобится), Ж6в формулировки про журнал не содержит.
type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireEmployee(req, { write: true, roles: ['master'] })
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const parsed = PatchEmployeeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Некорректные данные', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const data = parsed.data

    const existing = await db.employee.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 })
    }

    // ── Телефон: нормализация обязательна (см. POST), занятость —
    // понятный 409 ДО update (паттерн подрядчика Г3).
    let loginPhone: string | undefined
    if (data.phone) {
      loginPhone = normalizePhone(data.phone) ?? undefined
      if (!loginPhone) {
        return NextResponse.json(
          {
            error:
              'Телефон — логин кабинета: укажите российский номер, который приводится к +7XXXXXXXXXX',
          },
          { status: 400 }
        )
      }
      const phoneOwner = await db.employee.findUnique({
        where: { phone: loginPhone },
        select: { id: true, name: true },
      })
      if (phoneOwner && phoneOwner.id !== id) {
        return NextResponse.json(
          {
            error: `Телефон уже используется сотрудником «${phoneOwner.name}» — укажите другой`,
          },
          { status: 409 }
        )
      }
    }

    // ── Защита 1: себя деактивировать / разжаловать нельзя ────────
    const isSelf = existing.id === auth.employee.id
    if (isSelf && data.isActive === false) {
      return NextResponse.json(
        { error: 'Нельзя деактивировать свой аккаунт — вы сразу потеряете вход' },
        { status: 400 }
      )
    }
    if (isSelf && data.roles !== undefined && !data.roles.includes('master')) {
      return NextResponse.json(
        { error: 'Нельзя снять с себя роль мастера — в системе всегда должен остаться мастер, это вы' },
        { status: 400 }
      )
    }

    // ── Защита 2: последний активный мастер ───────────────────────
    // Считаем по ЦЕЛЕВОМУ сотруднику: если он сейчас активный мастер,
    // а после этого PATCH'а перестаёт быть им (деактивация, разжалование
    // или оба сразу) — обязан существовать ДРУГОЙ активный мастер.
    // Роли — JSON-строка, SQL-фильтра по ним нет (урок Ж5) и не нужно:
    // таблица командного размера, честный JS-проход.
    const existingRoles = parseEmployeeRoles(existing.roles)
    const wasActiveMaster = existing.isActive && existingRoles.includes('master')
    const willBeActive =
      (data.isActive !== undefined ? data.isActive : existing.isActive) === true
    const willBeRoles = data.roles !== undefined ? data.roles : existingRoles
    if (wasActiveMaster && !(willBeActive && willBeRoles.includes('master'))) {
      const activeEmployees = await db.employee.findMany({
        where: { isActive: true },
        select: { id: true, roles: true },
      })
      const otherActiveMasters = activeEmployees.filter(
        (e) => e.id !== existing.id && parseEmployeeRoles(e.roles).includes('master')
      ).length
      if (otherActiveMasters === 0) {
        return NextResponse.json(
          {
            error:
              'Это последний активный мастер — деактивировать или разжаловать его нельзя, ' +
              'сначала передайте роль мастера другому сотруднику',
          },
          { status: 400 }
        )
      }
    }

    const employee = await db.employee.update({
      where: { id },
      select: EMPLOYEE_PUBLIC_FIELDS,
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(loginPhone !== undefined ? { phone: loginPhone } : {}),
        ...(data.password !== undefined ? { password: hashPassword(data.password) } : {}),
        ...(data.roles !== undefined ? { roles: JSON.stringify(data.roles) } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    })

    // ── Сессии: сброс пароля и деактивация рвут их (см. шапку) ────
    if (data.password !== undefined || data.isActive === false) {
      await db.employeeSession.deleteMany({ where: { employeeId: id } })
    }

    // Сообщение по частям (паттерн подрядчика Г3): деактивация/возврат,
    // сброс пароля и правка профиля — разные события для тоста.
    const parts: string[] = []
    if (data.isActive !== undefined) {
      parts.push(data.isActive ? 'снова активен' : 'деактивирован, сессии завершены')
    }
    if (data.password !== undefined) {
      parts.push(data.isActive === false ? 'пароль обновлён' : 'пароль обновлён, сессии завершены')
    }
    if (
      data.name !== undefined ||
      data.phone !== undefined ||
      data.roles !== undefined
    ) {
      parts.push('профиль обновлён')
    }

    return NextResponse.json({
      employee: { ...employee, roles: parseEmployeeRoles(employee.roles) },
      message: `${employee.name} — ${parts.join(', ')}`,
    })
  } catch (e) {
    return apiErrorResponse(e, 'employees PATCH', 'Не удалось сохранить сотрудника')
  }
}
