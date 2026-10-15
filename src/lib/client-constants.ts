import { z } from 'zod'
import { CargoInfoSchema } from '@/lib/leads'

// ─── Константы и схемы клиентского кабинета (И1) ───────────────────
// Файл БЕЗ серверных зависимостей (db и т.п.): его импортируют и
// API-роуты, и UI кабинета/админки. Разделение как у сотрудников
// (lib/employees.ts) и заметок (lib/note-constants.ts).

// Пароль доступа в кабинет — те же рамки, что у сотрудников (Ж6в) и
// подрядчиков: выдаёт менеджер, поэтому потолок в 100 символов не
// мешает человеку, а минимум 8 отсекает «1234».
export const CLIENT_PASSWORD_MIN = 8
export const CLIENT_PASSWORD_MAX = 100

// Тело POST /api/admin/customers/[id]/access — выдать/сменить пароль
// (строка) или отозвать доступ (null, сессии рвутся).
export const ClientAccessSchema = z.object({
  password: z
    .string()
    .trim()
    .min(CLIENT_PASSWORD_MIN, `Пароль — минимум ${CLIENT_PASSWORD_MIN} символов`)
    .max(CLIENT_PASSWORD_MAX, 'Пароль — слишком длинный')
    .nullable(),
})
export type ClientAccessInput = z.infer<typeof ClientAccessSchema>

// Тело POST /api/client/leads — запрос из кабинета. Груз — та же
// свободная анкета, что у лида менеджера (CargoInfoSchema, В1), но
// ОБЯЗАТЕЛЬНО непустая: запрос «ни о чём» менеджеру не с чем работать,
// клиент заполняет бланк (CargoFormFields) хотя бы частично.
// rawContact и customerId в теле не принимаются — они подставляются
// сервером из профиля клиента, подделать автора запроса нельзя.
export const ClientCreateRequestSchema = z.object({
  cargoInfo: CargoInfoSchema.refine(
    (v) => Object.keys(v ?? {}).length > 0,
    'Заполните хотя бы одно поле анкеты груза'
  ),
})
export type ClientCreateRequestInput = z.infer<typeof ClientCreateRequestSchema>

// Дневной потолок запросов из кабинета на клиента (анти-спам внешнего
// портала — принцип очереди: «кабинет открывает систему наружу»).
// Считаются только лиды источника «кабинет» за последние 24 часа:
// лиды, созданные менеджером, лимит клиента не съедают.
export const CLIENT_LEAD_DAILY_LIMIT = 10
