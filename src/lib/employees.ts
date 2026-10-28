// ─── Сотрудники: константы и парсер ролей (Ж6в) ───────────────────
// Клиент-безопасный модуль по образцу lib/contractors.ts: без импортов
// из lib/auth (тот тянет Prisma-клиент — серверный), поэтому тип роли
// продублирован здесь локально. lib/auth.ts остаётся владельцем
// проверки прав; этот файл — общий словарь для роутов и UI.
import { z } from 'zod'
import { isEmail } from './phone'

// Роли сотрудников. Employee.roles в БД — JSON-строка ("["master"]"),
// а не enum: расширение списка ролей (будущий "department_head" из
// роадмапа 1а) — правка констант здесь и в requireEmployee, без
// миграции структуры (комментарий в schema.prisma).
export const EMPLOYEE_ROLES = ['master', 'manager'] as const
export type EmployeeRoleName = (typeof EMPLOYEE_ROLES)[number]

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRoleName, string> = {
  master: 'Мастер',
  manager: 'Менеджер',
}

// Имя для карточки справочника.
export const EMPLOYEE_NAME_MAX = 200

// DF-02: контактный email для уведомлений (адресат-человек, DF-03).
// Необязателен; непустое значение обязано быть адресом (isEmail,
// паттерн resolveEmail company-users: мусор не сохраняем). Тот же
// потолок длины, что у имени.
export const EMPLOYEE_EMAIL_MAX = 200
export const EmployeeEmailSchema = z
  .string()
  .trim()
  .max(EMPLOYEE_EMAIL_MAX, `Email — до ${EMPLOYEE_EMAIL_MAX} символов`)
  .refine((v) => isEmail(v), 'Некорректный email — ожидается адрес вида name@company.ru')
// Для PATCH: null = очистить поле, отсутствие = не менять.
export const PatchEmployeeEmailSchema = EmployeeEmailSchema.nullable()

// Стартовый/новый пароль сотрудника. Жёстче подрядчицкого (6, Г2 —
// урезанный ЛК): у сотрудника полный кабинет со сделками, клиентами
// и ставками. Значение встречается в подсказках UI — потому тут, а не
// в роуте.
export const EMPLOYEE_PASSWORD_MIN = 8
export const EMPLOYEE_PASSWORD_MAX = 100

// Безопасный разбор Employee.roles: битый JSON не должен ронять роуты
// и UI (тот же приём, что в lib/auth.ts getEmployeeByToken и логине;
// неизвестные роли отбрасываются — справочник ролей мог сузиться).
export function parseEmployeeRoles(raw: string): EmployeeRoleName[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is EmployeeRoleName => typeof r === 'string' && (EMPLOYEE_ROLES as readonly string[]).includes(r)
    )
  } catch {
    return []
  }
}

// ─── Создание сотрудника (POST /api/admin/employees, Ж6в) ─────────
// Телефон — ЛОГИН кабинета и обязан нормализоваться в +7XXXXXXXXXX:
// вход сотрудников нормализует строку и иначе просто не пускает, учётка
// с сырым иностранным номером была бы мертворождённой (проверка — в
// роуте, потому что приписать сюда «или сырой» нельзя осмысленно).
// Ролей — минимум одна: вход без ролей и так 403 (логин), пустой
// массив породил бы аккаунт-замок.
export const CreateEmployeeSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя сотрудника').max(EMPLOYEE_NAME_MAX),
  phone: z.string().trim().min(5, 'Укажите телефон — логин кабинета').max(30),
  email: EmployeeEmailSchema.optional(),
  password: z
    .string()
    .min(EMPLOYEE_PASSWORD_MIN, `Пароль — минимум ${EMPLOYEE_PASSWORD_MIN} символов`)
    .max(EMPLOYEE_PASSWORD_MAX),
  roles: z
    .array(z.enum(EMPLOYEE_ROLES, { errorMap: () => ({ message: 'Неизвестная роль' }) }))
    .min(1, 'Выберите хотя бы одну роль'),
})
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>

// ─── PATCH сотрудника: /api/admin/employees/[id] (Ж6в) ────────────
// Все поля опциональны (хотя бы одно — иначе 400 «Нечего обновлять»
// в refine): имя, телефон-логин, сброс пароля, роли, деактивация.
// Защита себя и последнего мастера — в роуте (зависит от auth и БД).
export const PatchEmployeeSchema = z
  .object({
    name: z.string().trim().min(1, 'Укажите имя сотрудника').max(EMPLOYEE_NAME_MAX).optional(),
    phone: z.string().trim().min(5, 'Укажите телефон — логин кабинета').max(30).optional(),
    email: PatchEmployeeEmailSchema.optional(),
    password: z
      .string()
      .min(EMPLOYEE_PASSWORD_MIN, `Пароль — минимум ${EMPLOYEE_PASSWORD_MIN} символов`)
      .max(EMPLOYEE_PASSWORD_MAX)
      .optional(),
    roles: z
      .array(z.enum(EMPLOYEE_ROLES, { errorMap: () => ({ message: 'Неизвестная роль' }) }))
      .min(1, 'Ролей не может быть ноль')
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.phone !== undefined ||
      v.email !== undefined ||
      v.password !== undefined ||
      v.roles !== undefined ||
      v.isActive !== undefined,
    { message: 'Нечего обновлять: передайте name, phone, email, password, roles или isActive' }
  )
export type PatchEmployeeInput = z.infer<typeof PatchEmployeeSchema>

// ─── Публичная проекция сотрудника (Ж6в) ──────────────────────────
// select-объект для ответов API: БЕЗ password — хеш не покидает сервер
// даже в read-режиме (тот же принцип, что CONTRACTOR_PUBLIC_FIELDS).
// roles в БД — JSON-строка: роуты отдают наружу РАЗОБРАННЫЙ массив
// (parseEmployeeRoles), клиент никогда не парсит чужой JSON сам.
export const EMPLOYEE_PUBLIC_FIELDS = {
  id: true,
  name: true,
  phone: true,
  email: true,
  roles: true,
  isActive: true,
  createdAt: true,
} as const
