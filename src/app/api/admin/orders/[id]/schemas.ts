import { z } from 'zod'
import { CARGO_PROFILES, ORDER_STATUSES } from '@/lib/order-constants'
import { CargoInfoSchema, QuoteSnapshotSchema } from '@/lib/leads'
import { RouteFieldsSchema } from '@/lib/route-fields'

// v0.5.0 (P1-22): zod-схема PATCH заявки — выезд из route.ts/patch.ts
// (резка под лимит 300, RULES 2.14).

// ─── PATCH — ручная смена статуса и полей ──────────────────────────
// Статус заявки переводит менеджер осознанно (роадмап 8.1), переходы
// ограничены матрицей lib/status-machine.ts (P1-05): вперёд по цепочке
// (перепрыгнуть «Согласование» можно), отмена — из любого
// не-терминального, возврат из терминальных — только мастер с причиной.
// Завершение — при готовом обязательном ядре либо перекрытием мастера.
// Ж1: cargoInfo и quoteSnapshot — суть заявки (груз и условия сделки).
// Семантика — ПОЛНАЯ ЗАМЕНА: UI присылает форму целиком (предзаполненную
// текущими значениями), null = очистить поле. Заявки без лида (Б3)
// заполняются вручную здесь же; у конвертированных снимок с лида
// при необходимости правится тоже — правки лида на заявку всё равно
// не действуют (источник правды — заявка).
export const PatchOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  incoterm: z.string().trim().max(10).nullable().optional(),
  // DF-17: условие поставки КОДОМ из справочника (при обоих ключах —
  // приоритет у кода; валидность проверяет patch.ts)
  incotermCode: z
    .string()
    .trim()
    .max(10)
    .transform((v) => v.toUpperCase())
    .nullable()
    .optional(),
  // DF-19: место условия поставки (свободный текст, null = очистить)
  incotermPlace: z.string().trim().max(200, 'Место — слишком длинное').nullable().optional(),
  hsCode: z.string().trim().max(20).nullable().optional(),
  cargoProfile: z.enum(CARGO_PROFILES).optional(),
  // Форма бланка груза — свободный объект (ключи проверяет UI,
  // сервер — толерантен, как и у лида в В2)
  cargoInfo: CargoInfoSchema.nullable().optional(),
  // P1-03: маршрут/метрики — колонки (Ж1: правится вместе с грузом);
  // DF-17: коды стран валидирует patch.ts (resolveRouteColumns)
  route: RouteFieldsSchema.optional(),
  // Условия сделки — снимок варианта расчёта (структура — lib/leads.ts);
  // валюта снимка валидируется по справочнику в patch.ts
  quoteSnapshot: QuoteSnapshotSchema.optional(),
  // P1-05: перекрытие незавершённого ядра при завершении — только
  // мастер, с обязательным комментарием (уходит в журнал заявки).
  override: z.boolean().optional(),
  overrideComment: z.string().trim().min(1).max(500).optional(),
  // P1-05: причина возврата из терминального статуса — только мастер.
  reason: z.string().trim().min(1).max(500).optional(),
  // P1-01: смена ответственного (null — снять). Существование и
  // активность сотрудника проверяет роут; повторная установка того же —
  // 400 (тот же контракт, что у статуса).
  assignedToId: z.string().min(1).nullable().optional(),
})
