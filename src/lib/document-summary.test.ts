import { describe, expect, it } from 'vitest'
import { buildPackageSummary } from './document-summary'

// ─── DF-26 §3.4: сводка по обязательным позициям — unit (T21-04) ─────
// Позиция — обязательная документная позиция (не файл): блокирующий
// вид чек-листа этапа ЭТОЙ заявки + блокирующее разрешительное
// требование; ровно в одном из трёх состояний (выполнено/на проверке/
// не готово), waived вне счётчика; «загруженное не считается
// отсутствующим» (замечание 4 ред. 1.3). Носитель — отдельный файл:
// §13.1 называет document-package.test.ts, но он уже 287 строк при
// лимите 300 (RULES 2.14, IC-09); отклонение — в отчёте гейта 1 (В-5).

const doc = (status: string, kind: string | null = null, type = 'other') => ({
  status,
  kind,
  type,
  isInternal: false,
})

const base = {
  stageRequirements: [] as Array<{ stageCode: string; kind: string; isBlocking: boolean }>,
  stages: [] as Array<{ stageCode: string; status: string; sequence: number }>,
  permits: [] as Array<{ status: string; isBlocking: boolean }>,
  stageNames: new Map<string, string>(),
}

describe('buildPackageSummary: позиции-виды (три состояния, §3.4)', () => {
  it('финал закрывает позицию, черновик — «не готово», in_review — «на проверке»', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [doc('final', 'customs_declaration'), doc('draft', 'commercial_invoice')],
      stageRequirements: [
        { stageCode: 'import_customs', kind: 'customs_declaration', isBlocking: true },
        { stageCode: 'import_customs', kind: 'commercial_invoice', isBlocking: true },
      ],
      stages: [{ stageCode: 'import_customs', status: 'in_progress', sequence: 4 }],
    })
    expect(s.requiredDone).toBe(1)
    expect(s.requiredInReview).toBe(0)
    expect(s.requiredMissing).toBe(1)
    expect(s.requiredTotal).toBe(2)
  })

  it('позиция с несколькими файлами считается ОДИН раз (двойной учёт устранён)', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [doc('final', 'customs_declaration'), doc('draft', 'customs_declaration')],
      stageRequirements: [{ stageCode: 'import_customs', kind: 'customs_declaration', isBlocking: true }],
      stages: [{ stageCode: 'import_customs', status: 'in_progress', sequence: 4 }],
    })
    expect(s.requiredDone).toBe(1)
    expect(s.requiredMissing).toBe(0)
    expect(s.requiredTotal).toBe(1)
  })

  it('in_review не попадает ни в «не готово», ни в «выполнено»', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [doc('in_review', 'customs_declaration')],
      stageRequirements: [{ stageCode: 'import_customs', kind: 'customs_declaration', isBlocking: true }],
      stages: [{ stageCode: 'import_customs', status: 'in_progress', sequence: 4 }],
    })
    expect(s.requiredDone).toBe(0)
    expect(s.requiredInReview).toBe(1)
    expect(s.requiredMissing).toBe(0)
  })

  it('рекомендованные (isBlocking=false) и чужие этапы — вне счётчика', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [],
      stageRequirements: [
        { stageCode: 'import_customs', kind: 'customs_declaration', isBlocking: false },
        { stageCode: 'final_delivery', kind: 'delivery_confirmation', isBlocking: true },
      ],
      stages: [{ stageCode: 'import_customs', status: 'in_progress', sequence: 4 }],
    })
    expect(s.requiredTotal).toBe(0)
  })
})

describe('buildPackageSummary: позиции-разрешительные (§3.4)', () => {
  it('pending → не готово; submitted → на проверке; received → выполнено', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [],
      permits: [
        { status: 'pending', isBlocking: true },
        { status: 'submitted', isBlocking: true },
        { status: 'received', isBlocking: true },
      ],
    })
    expect(s.requiredDone).toBe(1)
    expect(s.requiredInReview).toBe(1)
    expect(s.requiredMissing).toBe(1)
    expect(s.requiredTotal).toBe(3)
    expect(s.permitsPending).toBe(1)
    expect(s.permitsSubmitted).toBe(1)
  })

  it('waived вне счётчика позиций и вне разрешительных', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [],
      permits: [
        { status: 'waived', isBlocking: true },
        { status: 'pending', isBlocking: false },
      ],
    })
    expect(s.requiredTotal).toBe(0)
    expect(s.permitsPending).toBe(1)
    expect(s.permitsSubmitted).toBe(0)
  })
})

describe('buildPackageSummary: предупреждение ZIP (nonFinal*, §8.1.3)', () => {
  it('счётчики по статусам документов выборки: draft → черновики, in_review → на проверке', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [
        doc('draft'),
        doc('draft'),
        doc('in_review'),
        doc('final', 'customs_declaration'),
      ],
    })
    expect(s.nonFinalDrafts).toBe(2)
    expect(s.nonFinalReview).toBe(1)
  })
})

describe('buildPackageSummary: текущий этап и блокеры (§3.2)', () => {
  it('первый незавершённый по sequence; фаза — по PHASE_OF_STAGE; имя из каталога', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [],
      stages: [
        { stageCode: 'loading', status: 'done', sequence: 3 },
        { stageCode: 'import_customs', status: 'in_progress', sequence: 4 },
      ],
      stageNames: new Map([['import_customs', 'Таможенное оформление в РФ']]),
    })
    expect(s.currentStageName).toBe('Таможенное оформление в РФ')
    expect(s.currentStagePhase).toBe('import_customs')
  })

  it('этап без маппинга фаз (склад) — currentStagePhase null (остаточная группа 07)', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [],
      stages: [{ stageCode: 'warehouse', status: 'in_progress', sequence: 5 }],
      stageNames: new Map([['warehouse', 'Складское хранение']]),
    })
    expect(s.currentStagePhase).toBeNull()
    expect(s.currentStageName).toBe('Складское хранение')
  })

  it('nextStageBlockers — названия блокирующих видов текущего этапа без финала', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [doc('final', 'commercial_invoice')],
      stageRequirements: [
        { stageCode: 'import_customs', kind: 'customs_declaration', isBlocking: true },
        { stageCode: 'import_customs', kind: 'commercial_invoice', isBlocking: true },
        { stageCode: 'import_customs', kind: 'goods_description', isBlocking: false },
      ],
      stages: [{ stageCode: 'import_customs', status: 'in_progress', sequence: 4 }],
      stageNames: new Map([['import_customs', 'Таможенное оформление в РФ']]),
    })
    expect(s.nextStageBlockers).toEqual(['Декларация на товары'])
  })

  it('все этапы done — currentStageName null (заявка завершена)', () => {
    const s = buildPackageSummary({
      ...base,
      documents: [],
      stages: [{ stageCode: 'final_delivery', status: 'done', sequence: 6 }],
    })
    expect(s.currentStageName).toBeNull()
    expect(s.currentStagePhase).toBeNull()
    expect(s.nextStageBlockers).toEqual([])
  })
})
