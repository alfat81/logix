import { describe, it, expect, beforeAll } from 'vitest'
import { db } from './db'
import { confirmLeadOption, resetLeadConfirmation } from './lead-confirm'
import { lockLeadForOptions } from '@/app/api/admin/leads/[id]/convert/helpers'
import { computeWaitingLead, type WaitingLeadSnapshot } from './waiting'
import { checkLeadTransition } from './status-machine'
import { createOrderWithStages } from './orders'
import { employeeActor, clientActor } from './activity'

// ─── Поток A волна 1 (BL): контур согласования расчёта ─────────────
// Интеграционные тесты против тестовой БД (план ред. 3 §4.1):
// happy path, повторное подтверждение, вариант чужого запроса,
// фиксация от имени, сброс + повторное согласование (два снимка),
// блокировка вариантов на client_approved, неизменяемость снимков
// после сброса и правки варианта, отказ, DF-05.

// Уникальный суффикс прогона — изоляция параллельных воркеров
const RUN = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const MANAGER = employeeActor({ id: 'emp-test-manager', name: 'Тестовый Менеджер' })

type TestLead = { leadId: string; optionAId: string; optionBId: string; customerId: string }

async function mkLeadWithTwoOptions(): Promise<TestLead> {
  const customer = await db.customer.create({
    data: { name: `Клиент согласования ${RUN}`, phone: `+7999${Math.floor(1000000 + Math.random() * 8999999)}` },
  })
  const lead = await db.lead.create({
    data: {
      status: 'calculated',
      source: 'cabinet',
      customerId: customer.id,
      rawContact: { name: `Контакт ${RUN}` },
    },
  })
  const a = await db.quoteOption.create({
    data: {
      leadId: lead.id,
      description: `Вариант А ${RUN}`,
      price: 150000.5,
      currency: 'RUB',
      vatMode: 'WITHOUT_VAT',
      costEstimate: 95000,
      costCurrency: 'RUB',
      etaDays: 18,
      priorityFit: 'speed',
      isSelected: true,
      transportModes: ['Авто'],
    },
  })
  const b = await db.quoteOption.create({
    data: {
      leadId: lead.id,
      description: `Вариант Б ${RUN}`,
      price: 120000,
      currency: 'RUB',
      vatMode: 'WITH_VAT',
      etaDays: 25,
      priorityFit: 'cost',
      transportModes: ['ЖД'],
    },
  })
  return { leadId: lead.id, optionAId: a.id, optionBId: b.id, customerId: customer.id }
}

function snapshotOf(snap: {
  description: string
  price: unknown
  currency: string
  vatMode: string
  etaDays: number
  priorityFit: string
  transportModes: unknown
}) {
  return JSON.stringify({
    description: snap.description,
    price: String(snap.price),
    currency: snap.currency,
    vatMode: snap.vatMode,
    etaDays: snap.etaDays,
    priorityFit: snap.priorityFit,
    transportModes: snap.transportModes,
  })
}

describe('Поток A волна 1 · контур согласования (BL)', () => {
  let t: TestLead
  beforeAll(async () => {
    t = await mkLeadWithTwoOptions()
  })

  it('BL-1 happy path: клиент подтверждает вариант — статус/метаданные/isSelected/снимок (себестоимости в снимке нет)', async () => {
    const res = await db.$transaction((tx) =>
      confirmLeadOption(tx, t.leadId, t.optionBId, {
        actor: clientActor({ userId: 'cu-1', name: 'Компания', userName: 'Пётр Клиентов' }),
        via: 'client_portal',
        byId: 'cu-1',
        byName: 'Пётр Клиентов',
      })
    )
    expect(res.ok).toBe(true)

    const lead = await db.lead.findUnique({ where: { id: t.leadId } })
    expect(lead?.status).toBe('client_approved')
    expect(lead?.selectedOptionId).toBe(t.optionBId)
    expect(lead?.clientConfirmedVia).toBe('client_portal')
    expect(lead?.clientConfirmedById).toBe('cu-1')
    expect(lead?.clientConfirmedByName).toBe('Пётр Клиентов')

    const options = await db.quoteOption.findMany({ where: { leadId: t.leadId } })
    const b = options.find((o) => o.id === t.optionBId)!
    const a = options.find((o) => o.id === t.optionAId)!
    expect(b.isSelected).toBe(true)
    expect(a.isSelected).toBe(false)

    const snaps = await db.leadApprovalSnapshot.findMany({ where: { leadId: t.leadId } })
    expect(snaps).toHaveLength(1)
    const s = snaps[0]
    // Снимок — копия варианта Б; себестоимость в снимок НЕ входит (полей нет)
    expect(s.optionId).toBe(t.optionBId)
    expect(s.description).toBe(`Вариант Б ${RUN}`)
    expect(String(s.price)).toBe('120000')
    expect(s.vatMode).toBe('WITH_VAT')
    expect(s.etaDays).toBe(25)
    expect(s.priorityFit).toBe('cost')
    expect(s.confirmedVia).toBe('client_portal')
    expect(s.confirmedByName).toBe('Пётр Клиентов')
    expect(Object.keys(s).some((k) => k.toLowerCase().includes('cost'))).toBe(false)
  })

  it('К-02/К-10: повторное подтверждение (две вкладки) — 409, дублей снимка нет', async () => {
    const res = await db.$transaction((tx) =>
      confirmLeadOption(tx, t.leadId, t.optionAId, {
        actor: clientActor({ userId: 'cu-1', name: 'Компания', userName: 'Пётр Клиентов' }),
        via: 'client_portal',
        byId: 'cu-1',
        byName: 'Пётр Клиентов',
      })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(409)
    const snaps = await db.leadApprovalSnapshot.findMany({ where: { leadId: t.leadId } })
    expect(snaps).toHaveLength(1)
    const lead = await db.lead.findUnique({ where: { id: t.leadId } })
    expect(lead?.selectedOptionId).toBe(t.optionBId)
  })

  it('вариант чужого запроса — 400; несуществующий лид — 404', async () => {
    // свежий calculated-лид: вариант из ДРУГОГО запроса → 400
    const fresh = await mkLeadWithTwoOptions()
    const other = await mkLeadWithTwoOptions()
    const wrongOption = await db.$transaction((tx) =>
      confirmLeadOption(tx, fresh.leadId, other.optionAId, {
        actor: MANAGER,
        via: 'manager_on_behalf',
        byId: 'emp-test-manager',
        byName: 'Тестовый Менеджер',
      })
    )
    expect(wrongOption.ok).toBe(false)
    if (!wrongOption.ok) expect(wrongOption.status).toBe(400)

    const missing = await db.$transaction((tx) =>
      confirmLeadOption(tx, 'nonexistent-lead-id', t.optionAId, {
        actor: MANAGER,
        via: 'manager_on_behalf',
        byId: 'emp-test-manager',
        byName: 'Тестовый Менеджер',
      })
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.status).toBe(404)
  })

  it('BL-2: фиксация от имени — via manager_on_behalf, имя сотрудника в метаданных и снимке', async () => {
    // сброс, затем фиксация от имени
    const reset = await db.$transaction((tx) => resetLeadConfirmation(tx, t.leadId, MANAGER))
    expect(reset.ok).toBe(true)
    const confirm = await db.$transaction((tx) =>
      confirmLeadOption(tx, t.leadId, t.optionBId, {
        actor: MANAGER,
        via: 'manager_on_behalf',
        byId: 'emp-test-manager',
        byName: 'Тестовый Менеджер',
      })
    )
    expect(confirm.ok).toBe(true)
    const lead = await db.lead.findUnique({ where: { id: t.leadId } })
    expect(lead?.status).toBe('client_approved')
    expect(lead?.clientConfirmedVia).toBe('manager_on_behalf')
    expect(lead?.clientConfirmedByName).toBe('Тестовый Менеджер')
  })

  it('К-05: сброс + повторное согласование — два снимка в истории, активный последний, снимки не меняются', async () => {
    const before = await db.leadApprovalSnapshot.findMany({
      where: { leadId: t.leadId },
      orderBy: { confirmedAt: 'asc' },
    })
    const beforeJson = before.map(snapshotOf)

    const reset = await db.$transaction((tx) => resetLeadConfirmation(tx, t.leadId, MANAGER))
    expect(reset.ok).toBe(true)
    let lead = await db.lead.findUnique({ where: { id: t.leadId } })
    expect(lead?.status).toBe('calculated')
    // метаданные очищены, isSelected сохранён (текущий выбор)
    expect(lead?.selectedOptionId).toBeNull()
    expect(lead?.clientConfirmedVia).toBeNull()
    expect(
      (await db.quoteOption.findUnique({ where: { id: t.optionBId } }))?.isSelected
    ).toBe(true)
    // история снимков не тронута
    const afterReset = await db.leadApprovalSnapshot.findMany({ where: { leadId: t.leadId } })
    expect(afterReset).toHaveLength(before.length)
    expect(afterReset.map(snapshotOf)).toEqual(beforeJson)

    // повторное согласование — новый снимок
    const confirm = await db.$transaction((tx) =>
      confirmLeadOption(tx, t.leadId, t.optionBId, {
        actor: clientActor({ userId: 'cu-1', name: 'Компания', userName: 'Пётр Клиентов' }),
        via: 'client_portal',
        byId: 'cu-1',
        byName: 'Пётр Клиентов',
      })
    )
    expect(confirm.ok).toBe(true)
    const snaps = await db.leadApprovalSnapshot.findMany({
      where: { leadId: t.leadId },
      orderBy: { confirmedAt: 'asc' },
    })
    expect(snaps).toHaveLength(before.length + 1)
    // активный снимок — последний, его confirmedAt = метаданным лида
    lead = await db.lead.findUnique({ where: { id: t.leadId } })
    const active = snaps.find(
      (s) => s.confirmedAt.getTime() === lead!.clientConfirmedAt!.getTime()
    )
    expect(active).toBeDefined()
    expect(active!.id).toBe(snaps[snaps.length - 1].id)
  })

  it('Уровень 2 защиты: после сброса правка/удаление исходного варианта проходят, снимки побайтово не меняются', async () => {
    const snapsBefore = await db.leadApprovalSnapshot.findMany({
      where: { leadId: t.leadId },
      orderBy: { confirmedAt: 'asc' },
    })
    const beforeJson = snapsBefore.map(snapshotOf)
    // сброс согласования
    const reset = await db.$transaction((tx) => resetLeadConfirmation(tx, t.leadId, MANAGER))
    expect(reset.ok).toBe(true)
    // правка исходного варианта (гард пропускает — согласование снято)
    const guard1 = await db.$transaction((tx) => lockLeadForOptions(tx, t.leadId))
    expect(guard1.ok).toBe(true)
    await db.quoteOption.update({
      where: { id: t.optionBId },
      data: { price: 999999, description: `Вариант Б изменён ${RUN}` },
    })
    // снимки не изменились ни на байт
    const snapsAfter = await db.leadApprovalSnapshot.findMany({
      where: { leadId: t.leadId },
      orderBy: { confirmedAt: 'asc' },
    })
    expect(snapsAfter.map(snapshotOf)).toEqual(beforeJson)
    expect(snapsAfter.map((s) => s.id)).toEqual(snapsBefore.map((s) => s.id))
  })

  it('Уровень 1 защиты: POST/PATCH/DELETE вариантов на client_approved — 409 через lockLeadForOptions', async () => {
    // повторно согласуем
    const confirm = await db.$transaction((tx) =>
      confirmLeadOption(tx, t.leadId, t.optionAId, {
        actor: clientActor({ userId: 'cu-1', name: 'Компания', userName: 'Пётр Клиентов' }),
        via: 'client_portal',
        byId: 'cu-1',
        byName: 'Пётр Клиентов',
      })
    )
    expect(confirm.ok).toBe(true)
    const guard = await db.$transaction((tx) => lockLeadForOptions(tx, t.leadId))
    expect(guard.ok).toBe(false)
    if (!guard.ok) {
      expect(guard.status).toBe(409)
      expect(guard.error).toContain('Согласование активно')
    }
    // won-лид — прежний 409 (регресс К-08)
    const res2 = await db.$transaction((tx) => lockLeadForOptions(tx, 'nonexistent-lead'))
    expect(res2.ok).toBe(false)
    if (!res2.ok) expect(res2.status).toBe(404)
  })

  it('BL-6/К-09: отказ из client_approved разрешён переходом; сброс на lost-лиде — 409', async () => {
    expect(checkLeadTransition('client_approved', 'lost').ok).toBe(true)
    expect(checkLeadTransition('client_approved', 'calculated').ok).toBe(false)

    // сброс согласования для lost-лида
    const lostLead = await mkLeadWithTwoOptions()
    await db.$transaction((tx) =>
      confirmLeadOption(tx, lostLead.leadId, lostLead.optionAId, {
        actor: MANAGER,
        via: 'manager_on_behalf',
        byId: 'emp-test-manager',
        byName: 'Тестовый Менеджер',
      })
    )
    await db.lead.update({ where: { id: lostLead.leadId }, data: { status: 'lost', lostReason: 'Клиент передумал' } })
    const reset = await db.$transaction((tx) => resetLeadConfirmation(tx, lostLead.leadId, MANAGER))
    expect(reset.ok).toBe(false)
    if (!reset.ok) expect(reset.status).toBe(409)
  })

  it('DF-05: лид в client_approved — мяч у менеджера (client_approved)', () => {
    const snap: WaitingLeadSnapshot = {
      status: 'client_approved',
      customerId: 'c1',
      cargoName: 'Груз',
      hasInvoiceDoc: true,
      optionsCount: 3,
      hasSelectedOption: true,
      brokers: [],
      pendingPermits: [],
      permitRows: [],
      permitCheckRows: [],
    } as unknown as WaitingLeadSnapshot
    const out = computeWaitingLead(snap)
    expect(out).toEqual({ kind: 'manager', reason: 'client_approved', onId: null })
  })

  it('BL-5: createOrderWithStages с status in_progress — заявка сразу «В работе»', async () => {
    const legal = await db.legalEntity.findFirst()
    expect(legal).toBeDefined()
    const customer = await db.customer.create({
      data: { name: `Клиент in_progress ${RUN}`, phone: `+7998${Math.floor(1000000 + Math.random() * 8999999)}` },
    })
    const res = await db.$transaction((tx) =>
      createOrderWithStages(
        {
          customerId: customer.id,
          legalEntityId: legal!.id,
          status: 'in_progress',
          quoteSnapshot: { description: 'x', price: 1, currency: 'RUB', vatMode: 'WITHOUT_VAT', etaDays: 1, priorityFit: 'speed', costEstimate: 1, costCurrency: 'RUB' },
        },
        tx
      )
    )
    expect('id' in res).toBe(true)
    const order = await db.order.findUnique({ where: { id: (res as { id: string }).id } })
    expect(order?.status).toBe('in_progress')
  })
})
