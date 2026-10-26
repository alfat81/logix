// ─── Сводка этапов для списковых проекций заявки (Ж4 → Ж6а) ─────
// Вынесено из orders.ts для соблюдения RULES 2.14 (файлы <= 300 строк).
// Ближайший этап / прогресс / просрочка считаются одинаково в списке
// заявок (Ж4) и в карточке клиента (Ж6а) — один код-путь вместо копий.

export type StageViewRow = {
  stageCode: string
  status: string
  plannedDate: Date | null
  contractor: { companyName: string } | null
}

export type StageView = {
  code: string
  name: string
  status: string
  plannedDate: Date | null
  contractorName: string | null
}

export type OrderStagesSummary = {
  stagesTotal: number
  stagesDone: number
  stagesProblem: number
  nearestStage: StageView | null
  overdue: boolean
  // v0.3.1 (BRANDBOOK §4.3): имя просроченного этапа для строки
  // задержки на карточке списка
  overdueStage: string | null
}

export function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

// Граница «сегодня» по UTC: плановые даты приходят UTC-полуночью
// (UI шлёт T00:00:00.000Z), локальная таймзона сервера не должна
// сдвигать день (то же правило — в роуте orders GET и Ж5 attention).
export function todayUtcMidnight(): number {
  return utcDayStart(new Date())
}

// Этапы заявки (по sequence asc) → сводка: первый незавершённый этап
// (включая «проблема» — он и есть ближайшая точка работы), прогресс и
// просрочка (ЛЮБОЙ незавершённый этап с планом раньше сегодняшней).
export function summarizeOrderStages(
  stages: StageViewRow[],
  stageNames: Map<string, string>,
  todayUtc: number
): OrderStagesSummary {
  const incomplete = stages.filter((s) => s.status !== 'done')
  const nearest = incomplete[0] ?? null
  const overdueRow =
    incomplete.find((s) => s.plannedDate !== null && s.plannedDate.getTime() < todayUtc) ?? null
  return {
    stagesTotal: stages.length,
    stagesDone: stages.length - incomplete.length,
    stagesProblem: stages.filter((s) => s.status === 'problem').length,
    nearestStage: nearest
      ? {
          code: nearest.stageCode,
          name: stageNames.get(nearest.stageCode) ?? nearest.stageCode,
          status: nearest.status,
          plannedDate: nearest.plannedDate,
          contractorName: nearest.contractor?.companyName ?? null,
        }
      : null,
    overdue: overdueRow !== null,
    overdueStage: overdueRow
      ? stageNames.get(overdueRow.stageCode) ?? overdueRow.stageCode
      : null,
  }
}

// v0.3.1 (BRANDBOOK §4.3): ETA заявки — обещанная дата завершения.
// Семантика: МАКСИМАЛЬНАЯ плановая дата среди незавершённых этапов
// («когда закончится всё»), а не план ближайшего — просроченный ранний
// этап не должен занижать ETA финала. Дат нет или всё завершено —
// null (UI показывает «Даты не заданы»/«Доставлено»).
export function calcOrderEta(
  stages: Array<{ status: string; plannedDate: Date | null }>
): Date | null {
  let eta: Date | null = null
  for (const s of stages) {
    if (s.status === 'done' || s.plannedDate === null) continue
    if (eta === null || s.plannedDate.getTime() > eta.getTime()) eta = s.plannedDate
  }
  return eta
}
