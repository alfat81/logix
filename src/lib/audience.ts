import type { Prisma } from '@prisma/client'

// ─── DF-01 «События как ось»: видимость событий ─────────────────────
// Единственная точка расчёта видимости (инвариант §1.3 ROADMAP-DEALFLOW):
// роуты НЕ копируют фильтры аудитории — лента любого кабинета читает
// через eventWhereFor(), документные события оцениваются canSeeDocument().
//
// Аудитория события — КОМУ ВИДНО: staff | client | broker. Значение
// 'contractor' зарезервировано ради замороженного кабинета подрядчика
// и в новых событиях не используется (D31); канонический список — AUDIENCES.

export const AUDIENCES = ['staff', 'client', 'broker'] as const
export type Audience = (typeof AUDIENCES)[number]

// Where-фрагмент для чтения ленты данным кабинетом.
// - staff видит ВСЁ (включая isInternal-заметки Ж3) — пустой фрагмент;
//   сегодняшние три админские ленты работали именно так (без where).
// - client/broker: событие должно быть адресовано аудитории явно
//   (колонка audience, backfill df_01_event_audience) и не быть
//   внутренним. Двойное условие избыточно при консистентных данных
//   (audience={staff} ⇔ isInternal), но isInternal:false — это же
//   условие проверяет ACTIVITY_EXTERNAL_WHERE и остаётся страховкой
//   до contract-релиза, где isInternal удаляется.
export function eventWhereFor(audience: Audience): Prisma.ActivityWhereInput {
  if (audience === 'staff') return {}
  return { isInternal: false, audience: { has: audience } }
}

// Видимость ДОКУМЕНТА аудитории (не сделки!): внутренний документ —
// только staff, внешний — всем (принадлежность сделки и права кабинета
// проверяются на уровне роута, как сегодня в documentVisibleToClient/
// documentVisibleToBroker). Потребители — документные события (аудитория
// по isInternal документа) и будущие проверники пакета документов
// (DF-13). documentVisibleToClient/Broker в DF-01 не трогаются — их
// замена на этот хелпер пойдёт в contract-релизе вместе с isInternal.
export function canSeeDocument(audience: Audience, doc: { isInternal: boolean }): boolean {
  if (doc.isInternal) return audience === 'staff'
  return true
}

// Аудитория СОБЫТИЯ о документе: внутренний документ не должен даже
// раскрыть факт своего существования внешнему кабинету (Ж2, Е) —
// событие тоже становится staff-only; внешний документ видят все три
// аудитории (кабинет увидит его в ленте, только если видит саму сделку —
// скоупинг запросом на уровне роута).
export function documentEventAudience(docIsInternal: boolean): Audience[] {
  return docIsInternal ? ['staff'] : ['staff', 'client', 'broker']
}
