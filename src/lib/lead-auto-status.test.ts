import { describe, expect, it } from 'vitest'
import { expectedLeadStatus, LEAD_TRANSITIONS } from '@/lib/status-machine'
import { autoLeadStatus, resolveLeadEditStatus } from '@/lib/lead-auto-status'
import { buildLeadPrintSnapshot, printRevisionContentHash } from '@/lib/print-revisions'

// ─── DF-27 волна 2 (§6.4, D75): автомат статуса needs_data ──────────
// Единственная детерминированная функция expectedLeadStatus — матрица
// и границы (won/lost/client_approved автоматикой не трогаются).

describe('expectedLeadStatus (§6.4/D75)', () => {
  it('неполная анкета → needs_data независимо от числа вариантов', () => {
    expect(expectedLeadStatus('new', 0, 3)).toBe('needs_data')
    expect(expectedLeadStatus('new', 2, 1)).toBe('needs_data')
    expect(expectedLeadStatus('needs_data', 1, 2)).toBe('needs_data')
    expect(expectedLeadStatus('calculated', 1, 1)).toBe('needs_data')
  })

  it('полная анкета: варианты есть → calculated, нет → new', () => {
    expect(expectedLeadStatus('new', 0, 0)).toBe('new')
    expect(expectedLeadStatus('new', 1, 0)).toBe('calculated')
    expect(expectedLeadStatus('needs_data', 0, 0)).toBe('new')
    expect(expectedLeadStatus('needs_data', 2, 0)).toBe('calculated')
    expect(expectedLeadStatus('calculated', 1, 0)).toBe('calculated')
  })

  it('won/lost/client_approved автоматикой не трогаются', () => {
    expect(expectedLeadStatus('won', 0, 5)).toBe('won')
    expect(expectedLeadStatus('lost', 0, 5)).toBe('lost')
    expect(expectedLeadStatus('client_approved', 1, 5)).toBe('client_approved')
  })
})

describe('autoLeadStatus: переход обязан быть в матрице', () => {
  it('матрица содержит needs_data и его автоматические выходы', () => {
    expect(LEAD_TRANSITIONS.new).toContain('needs_data')
    expect(LEAD_TRANSITIONS.needs_data).toEqual(['new', 'calculated', 'lost'])
    expect(LEAD_TRANSITIONS.calculated).toContain('needs_data')
  })

  it('допустимые автоматические переходы применяются', () => {
    expect(autoLeadStatus('new', 0, 2)).toBe('needs_data')
    expect(autoLeadStatus('new', 1, 0)).toBe('calculated')
    expect(autoLeadStatus('needs_data', 1, 0)).toBe('calculated')
    expect(autoLeadStatus('needs_data', 0, 0)).toBe('new')
    expect(autoLeadStatus('calculated', 1, 1)).toBe('needs_data')
  })

  it('calculated→new в матрице нет: удаление вариантов «Рассчитан» не откатывает', () => {
    expect(LEAD_TRANSITIONS.calculated).not.toContain('new')
    expect(autoLeadStatus('calculated', 0, 0)).toBeNull()
  })

  it('повтор статуса — null (перехода нет)', () => {
    expect(autoLeadStatus('needs_data', 0, 1)).toBeNull()
  })
})

describe('resolveLeadEditStatus (Р-1: правка анкеты и согласование)', () => {
  const baseLead = { cargoInfo: { hsCode: '1234567890', cargoValue: 100 } }

  it('правка при client_approved → сброс + статус по полноте (needs_data)', () => {
    const res = resolveLeadEditStatus({
      existingStatus: 'client_approved',
      existing: baseLead,
      optionsCount: 2,
      incoming: { anketaChanged: true, routeColumns: {} },
    })
    expect(res).toMatchObject({ ok: true, willResetApproval: true, autoStatus: 'needs_data' })
  })

  it('правка при client_approved с полной анкетой → calculated', () => {
    const res = resolveLeadEditStatus({
      existingStatus: 'client_approved',
      // полная анкета (все критичные параметры заданы)
      existing: {
        cargoInfo: { hsCode: '1234567890', cargoValue: 100 },
        originCity: 'Москва',
        destinationCity: 'Казань',
        readyDate: '2027-01-01',
        weightKg: 100,
        placesCount: 2,
        incotermCode: 'FOB',
      },
      optionsCount: 2,
      incoming: { anketaChanged: true, routeColumns: {} },
    })
    expect(res).toMatchObject({ ok: true, willResetApproval: true, autoStatus: 'calculated' })
  })

  it('явный статус, противоречащий полноте, — 409', () => {
    const res = resolveLeadEditStatus({
      existingStatus: 'new',
      existing: baseLead,
      optionsCount: 1,
      incoming: { anketaChanged: true, routeColumns: {} },
      explicitStatus: 'calculated',
    })
    expect(res).toMatchObject({ ok: false, status: 409 })
  })

  it('явный lost (закрытие) разрешён при любой полноте', () => {
    const res = resolveLeadEditStatus({
      existingStatus: 'calculated',
      existing: baseLead,
      optionsCount: 1,
      incoming: { anketaChanged: true, routeColumns: {} },
      explicitStatus: 'lost',
    })
    expect(res).toMatchObject({ ok: true, willResetApproval: false, autoStatus: null })
  })

  it('анкета не менялась — автомат не считает', () => {
    const res = resolveLeadEditStatus({
      existingStatus: 'calculated',
      existing: baseLead,
      optionsCount: 1,
      incoming: { anketaChanged: false },
    })
    expect(res).toMatchObject({ ok: true, willResetApproval: false, autoStatus: null })
  })
})

describe('printRevisionContentHash (Р-3): хеш редакции', () => {
  it('хеш стабилен и не зависит от порядка ключей', () => {
    const a = buildLeadPrintSnapshot({
      id: 'lead1',
      createdAt: new Date('2026-11-11T10:00:00Z'),
      cargoInfo: { cargoName: 'Груз', hsCode: '1234' },
      customer: { name: 'Клиент', phone: '+79000000000' },
    })
    const b = buildLeadPrintSnapshot({
      id: 'lead1',
      createdAt: new Date('2026-11-11T10:00:00Z'),
      cargoInfo: { hsCode: '1234', cargoName: 'Груз' },
      customer: { name: 'Клиент', phone: '+79000000000' },
    })
    expect(printRevisionContentHash(a)).toBe(printRevisionContentHash(b))
    expect(printRevisionContentHash(a)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('изменение содержимого меняет хеш (подмена редакции невозможна)', () => {
    const a = buildLeadPrintSnapshot({
      id: 'lead1',
      createdAt: new Date('2026-11-11T10:00:00Z'),
      cargoInfo: { cargoName: 'Груз' },
    })
    const b = buildLeadPrintSnapshot({
      id: 'lead1',
      createdAt: new Date('2026-11-11T10:00:00Z'),
      cargoInfo: { cargoName: 'Груз 2' },
    })
    expect(printRevisionContentHash(a)).not.toBe(printRevisionContentHash(b))
  })
})
