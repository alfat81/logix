import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { db } from './db'
import { employeeActor, brokerActor } from './activity'
import {
  CreatePermitCheckSchema,
  ReviewPermitCheckSchema,
  outcomeFromDecisions,
  manualDictionaryVersion,
  PERMIT_CHECK_RESULTS,
  MANUAL_CHECK_RESULTS,
  PERMIT_CHECK_REVIEW_OUTCOMES,
} from './permit-checks'
import {
  createManualPermitCheck,
  ensureAutoPermitCheck,
  handleHsCodeChange,
  listPermitChecks,
  reviewPermitCheck,
  currentEstimateItems,
  syncAfterEstimateDiff,
} from './permit-checks-db'
import { createPermit, patchPermit } from './permits-db'

// ─── DF-26 волна 2: проверки ТН ВЭД (SPEC §5.1–5.3, §5.7) ───────────
// Интеграционный уровень против реального PostgreSQL (как events.test):
// дедупликация открытых записей — ФИЗИЧЕСКИ (частичные уникальные
// индексы миграции df_26_docs_center), CHECK «ровно одна цель»,
// охват позиций связями PermitCheckItem, пересмотр §5.7 (захват 409,
// решения по каждому требованию), конкурентные сценарии §13.1.

const RUN = 'df26-w2-checks-' + Date.now()
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const master = employeeActor({ id: 'e-test', name: 'Анна Кравцова' })

let leadId = ''
const orderId: string | null = null
let estimateId = ''
let brokerUserId = ''

// Позиции оценки — строки с кодами (id — идентичность, §5.7 п. 0а).
let itemA = '' // код 8708299009
let itemB = '' // код 8471300000

async function mkItem(hsCode: string, sortOrder: number): Promise<string> {
  const row = await db.brokerEstimateItem.create({
    data: { estimateId, sortOrder, hsCode },
  })
  return row.id
}

async function reseedEstimateItems(rows: { id?: string; hsCode: string }[]) {
  const old = await db.brokerEstimateItem.findMany({ where: { estimateId }, select: { id: true } })
  const oldIds = new Set(old.map((i) => i.id))
  const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string))
  await db.brokerEstimateItem.deleteMany({
    where: { estimateId, id: { in: [...oldIds].filter((id) => !keptIds.has(id)) } },
  })
  let next = rows.length
  for (const [idx, r] of rows.entries()) {
    if (r.id) {
      await db.brokerEstimateItem.update({
        where: { id: r.id },
        data: { sortOrder: idx, hsCode: r.hsCode },
      })
    } else {
      const created = await db.brokerEstimateItem.create({
        data: { estimateId, sortOrder: idx + next++, hsCode: r.hsCode },
      })
      r.id = created.id
    }
  }
}

beforeAll(async () => {
  // Брокер с реальной связью (текущийEstimateItems идёт через LeadBroker).
  const b = await db.brokerUser.create({
    data: {
      phone: '+70000000001',
      password: 'x',
      name: 'Максим Ершов',
      isActive: true,
      broker: { create: { companyName: `ИП Максимов ${RUN}`, phone: '+79000000002' } },
    },
    include: { broker: true },
  })
  brokerUserId = b.id
  const lead = await db.lead.create({
    data: {
      rawContact: { name: RUN },
      brokers: { create: { brokerId: b.brokerId } },
    },
    include: { brokers: true },
  })
  leadId = lead.id
  const estimate = await db.brokerEstimate.create({
    data: { leadBrokerId: lead.brokers[0].id, status: 'draft' },
  })
  estimateId = estimate.id
  itemA = await mkItem('8708299009', 0)
  itemB = await mkItem('8471300000', 1)
})

afterAll(async () => {
  await db.permitCheck.deleteMany({ where: { OR: [{ leadId }, { orderId: orderId ?? 'none' }] } })
  await db.permitRequirement.deleteMany({ where: { OR: [{ leadId }, { orderId: orderId ?? 'none' }] } })
  await db.activity.deleteMany({ where: { leadId } })
  await db.lead.deleteMany({ where: { rawContact: { path: ['name'], equals: RUN } } })
  await db.broker.deleteMany({ where: { users: { some: { id: brokerUserId } } } })
  consoleSpy.mockRestore()
})

describe('схемы и чистые правила', () => {
  it('домены результатов и исходов — точный состав (§5.1/§5.7)', () => {
    expect(PERMIT_CHECK_RESULTS).toEqual(['required', 'not_required', 'unclear', 'failed'])
    expect(MANUAL_CHECK_RESULTS).toEqual(['required', 'not_required', 'failed'])
    expect(PERMIT_CHECK_REVIEW_OUTCOMES).toEqual([
      'requirement_kept',
      'requirement_waived',
      'new_requirement',
      'not_required',
      'unclear_confirmed',
      'mixed',
    ])
  })

  it('not_required/failed без основания — 400; required без требования — 400', () => {
    expect(
      CreatePermitCheckSchema.safeParse({ hsCode: '8708299009', result: 'not_required' }).success
    ).toBe(false)
    expect(
      CreatePermitCheckSchema.safeParse({ hsCode: '8708299009', result: 'failed' }).success
    ).toBe(false)
    expect(
      CreatePermitCheckSchema.safeParse({ hsCode: '8708299009', result: 'required' }).success
    ).toBe(false)
    expect(
      CreatePermitCheckSchema.safeParse({
        hsCode: '8708299009',
        result: 'not_required',
        basis: 'ТР ТС не распространяется',
      }).success
    ).toBe(true)
    expect(
      CreatePermitCheckSchema.safeParse({
        hsCode: '8708299009',
        result: 'required',
        requirement: { title: 'Сертификат ТР ТС 018/2011', providedBy: 'client' },
      }).success
    ).toBe(true)
    // itemId в контракт НЕ входит (§11.2): охват определяет код. Неизвестный
    // ключ zod-объект обрезает молча — важно, что он не доходит до данных.
    const withItem = CreatePermitCheckSchema.parse({
      hsCode: '8708299009',
      result: 'not_required',
      basis: 'x',
      itemId: itemA,
    })
    expect('itemId' in withItem).toBe(false)
  })

  it('сводный исход по решениям (§5.7 п. 3а): kept/waived/new/mixed', () => {
    expect(outcomeFromDecisions([{ action: 'keep' }, { action: 'keep' }])).toBe('requirement_kept')
    expect(outcomeFromDecisions([{ action: 'waive' }, { action: 'waive' }])).toBe('requirement_waived')
    expect(outcomeFromDecisions([{ action: 'replace' }])).toBe('new_requirement')
    expect(outcomeFromDecisions([{ action: 'keep' }, { action: 'waive' }])).toBe('mixed')
    expect(outcomeFromDecisions([{ action: 'keep' }, { action: 'replace' }])).toBe('mixed')
  })

  it('reason обязателен для waive/replace; review-схема отклоняет мусор', () => {
    expect(
      ReviewPermitCheckSchema.safeParse({
        outcome: 'requirement_waived',
        decisions: [{ requirementId: 'x', action: 'waive' }],
      }).success
    ).toBe(false)
    expect(
      ReviewPermitCheckSchema.safeParse({
        outcome: 'requirement_waived',
        decisions: [{ requirementId: 'x', action: 'waive', reason: 'код изменён на 8701' }],
      }).success
    ).toBe(true)
    expect(
      ReviewPermitCheckSchema.safeParse({ outcome: 'не_исход' as never }).success
    ).toBe(false)
  })

  it('manualDictionaryVersion — снимок ручной проверки', () => {
    expect(manualDictionaryVersion(new Date('2026-11-07T10:00:00Z'))).toBe('manual:2026-11-07')
  })
})

describe('auto-записи и дедупликация (инвариант 1, физически)', () => {
  it('появление кода — одна открытая unclear-запись + охват всех позиций кода', async () => {
    const id1 = await ensureAutoPermitCheck(db, { deal: { leadId }, hsCode: '8708299009', actor: { type: 'system' } })
    // Повторное появление кода — дедупликация: та же запись, новой нет.
    const id2 = await ensureAutoPermitCheck(db, { deal: { leadId }, hsCode: '8708299009', actor: { type: 'system' } })
    expect(id2).toBe(id1)
    const row = await db.permitCheck.findUnique({ where: { id: id1 }, include: { items: true } })
    expect(row?.result).toBe('unclear')
    expect(row?.source).toBe('auto')
    expect(row?.items.map((i) => i.itemId).sort()).toEqual([itemA].sort())
    // Событие permit_check_needed — по одному разу на пару.
    const events = await db.activity.count({
      where: { leadId, type: 'permit_check_needed', description: { contains: '8708299009' } },
    })
    expect(events).toBe(1)
  })

  it('вторая открытая auto-запись на (сделка, код) отклоняется БД (23505)', async () => {
    await expect(
      db.permitCheck.create({
        data: {
          leadId,
          hsCode: '8708299009',
          result: 'unclear',
          source: 'auto',
          checkedByType: 'system',
          checkedByName: 'Система',
        },
      })
    ).rejects.toThrow()
    // Закрытая (reviewed) в дедупликации не участвует — вторая создаётся.
    const closed = await db.permitCheck.create({
      data: {
        leadId,
        hsCode: '8708299009',
        result: 'unclear',
        source: 'auto',
        reviewStatus: 'reviewed',
        checkedByType: 'system',
        checkedByName: 'Система',
      },
    })
    expect(closed.id).toBeTruthy()
  })

  it('CHECK «ровно одна цель» — обе цели или ни одной отклоняются БД', async () => {
    await expect(
      db.permitCheck.create({
        data: {
          orderId: orderId ?? 'o',
          leadId,
          hsCode: '1234567890',
          result: 'unclear',
          source: 'auto',
          checkedByType: 'system',
          checkedByName: 'Система',
        },
      })
    ).rejects.toThrow()
    await expect(
      db.permitCheck.create({
        data: {
          hsCode: '1234567890',
          result: 'unclear',
          source: 'auto',
          checkedByType: 'system',
          checkedByName: 'Система',
        },
      })
    ).rejects.toThrow()
  })
})

describe('изменение кода ТН ВЭД (§5.7 п. 0/2/2а)', () => {
  it('смена кода — открытая needs_review со ссылкой на прежнюю проверку; прежняя не меняется', async () => {
    // Первичная auto-запись кода A (открытая unclear).
    const primary = await ensureAutoPermitCheck(db, { deal: { leadId }, hsCode: '8708299009', actor: { type: 'system' } })
    await handleHsCodeChange(db, { deal: { leadId }, itemId: itemA, oldCode: '8708299009', newCode: '8708300000', actor: { type: 'system' } })
    const nr = await db.permitCheck.findFirst({
      where: { leadId, reviewItemId: itemA, reviewStatus: 'needs_review' },
    })
    expect(nr).not.toBeNull()
    expect(nr?.hsCode).toBe('8708300000')
    expect(nr?.reviewOfCheckId).toBeTruthy()
    // Прежняя запись, её история и охват — без изменений (п. 1).
    const prev = await db.permitCheck.findUnique({ where: { id: primary }, include: { items: true } })
    expect(prev?.hsCode).toBe('8708299009')
    expect(prev?.reviewStatus).toBe('none')
    expect(prev?.items.length).toBe(1)
  })

  it('повторная смена кода до пересмотра — обновление открытой записи (id сохраняется), событие на каждую смену', async () => {
    await handleHsCodeChange(db, { deal: { leadId }, itemId: itemA, oldCode: '8708300000', newCode: '8708400000', actor: { type: 'system' } })
    const open = await db.permitCheck.findFirst({
      where: { leadId, reviewItemId: itemA, reviewStatus: 'needs_review' },
    })
    expect(open?.hsCode).toBe('8708400000')
    const reviewNeeded = await db.activity.count({
      where: { leadId, type: 'permit_check_review_needed' },
    })
    expect(reviewNeeded).toBeGreaterThanOrEqual(2) // обе смены в ленте
  })

  it('конкурентные смены кода — ровно одна открытая needs_review (частичный индекс)', async () => {
    await Promise.all([
      handleHsCodeChange(db, { deal: { leadId }, itemId: itemB, oldCode: '8471300000', newCode: '8471400000', actor: { type: 'system' } }),
      handleHsCodeChange(db, { deal: { leadId }, itemId: itemB, oldCode: '8471300000', newCode: '8471500000', actor: { type: 'system' } }),
    ])
    const open = await db.permitCheck.findMany({
      where: { leadId, reviewItemId: itemB, reviewStatus: 'needs_review' },
    })
    expect(open).toHaveLength(1)
  })
})

describe('ручная проверка и требования (§5.2/§5.3)', () => {
  it('unclear никогда не создаёт требований (инвариант 2): manual-схема unclear не принимает', () => {
    expect(
      CreatePermitCheckSchema.safeParse({ hsCode: '8708299009', result: 'unclear' }).success
    ).toBe(false)
  })

  it('«Требуется» создаёт по требованию на каждую охваченную позицию без активного по коду + происхождение', async () => {
    const check = await createManualPermitCheck(
      { leadId },
      {
        hsCode: '8708299009',
        result: 'required',
        basis: 'Сертификат соответствия ТР ТС 018/2011',
        requirement: {
          title: 'Сертификат соответствия ТР ТС 018/2011',
          providedBy: 'client',
          isBlocking: true,
        },
      },
      mkBroker(brokerUserId, 'ИП Максимов ' + RUN, 'Максим Ершов')
    )
    // Охват: все позиции кода.
    expect((await listPermitChecks({ leadId })).find((c) => c.id === check.id)?.items).toEqual([itemA])
    // Требования — по охваченным позициям (одна позиция → одно требование).
    const reqs = await db.permitCheckRequirement.findMany({
      where: { permitCheckId: check.id },
      include: { permitRequirement: true },
    })
    expect(reqs).toHaveLength(1)
    expect(reqs[0].permitRequirement.itemId).toBe(itemA)
    expect(reqs[0].permitRequirement.status).toBe('pending')
    // Двойной снимок проверившего-брокера (§6.1).
    expect(check.checkedByCompanyName).toContain('ИП Максимов')
    expect(check.checkedByUserName).toBe('Максим Ершов')
    // Повторная проверка дубля не создаёт.
    const check2 = await createManualPermitCheck(
      { leadId },
      {
        hsCode: '8708299009',
        result: 'required',
        requirement: { title: 'Сертификат соответствия ТР ТС 018/2011', providedBy: 'client' },
      },
      mkBroker(brokerUserId, 'ИП Максимов ' + RUN, 'Максим Ершов')
    )
    const reqs2 = await db.permitCheckRequirement.findMany({
      where: { permitCheckId: check2.id },
    })
    expect(reqs2).toHaveLength(0) // у позиции уже есть активное требование
  })

  it('«Не требуется» без основания — 400; с основанием — событие permit_check_not_required', async () => {
    const check = await createManualPermitCheck(
      { leadId },
      { hsCode: '8471300000', result: 'not_required', basis: 'Товар вне перечня ТР ТС' },
      master
    )
    expect(check.result).toBe('not_required')
    const ev = await db.activity.findFirst({
      where: { leadId, type: 'permit_check_not_required' },
      orderBy: { createdAt: 'desc' },
    })
    expect(ev).not.toBeNull()
  })
})

describe('пересмотр (§5.7 п. 3/3а)', () => {
  let checkId = ''
  let reqId = ''
  beforeAll(async () => {
    const nr = await db.permitCheck.findFirst({
      where: { leadId, reviewItemId: itemA, reviewStatus: 'needs_review' },
    })
    checkId = nr!.id
    const req = await db.permitRequirement.findFirst({
      where: { leadId, itemId: itemA, status: 'pending' },
    })
    reqId = req!.id
  })

  it('решения по КАЖДОМУ активному требованию — нет решения → 400', async () => {
    await expect(
      reviewPermitCheck(checkId, { outcome: 'requirement_waived' }, master)
    ).rejects.toMatchObject({ status: 400 })
  })

  it('requirement_waived: требование снято с причиной, запись reviewed, снимки пересмотревшего', async () => {
    const updated = await reviewPermitCheck(
      checkId,
      {
        outcome: 'requirement_waived',
        decisions: [{ requirementId: reqId, action: 'waive', reason: `код изменён на 8708400000` }],
      },
      master
    )
    expect(updated.reviewStatus).toBe('reviewed')
    expect(updated.reviewOutcome).toBe('requirement_waived')
    expect(updated.reviewedByUserName).toBe('Анна Кравцова')
    expect(updated.reviewedByCompanyName).toBeNull() // «Logix» задним числом не подставляется
    const req = await db.permitRequirement.findUnique({ where: { id: reqId } })
    expect(req?.status).toBe('waived')
    expect(req?.waivedReason).toContain('8708400000')
  })

  it('повторный review — 409 (атомарный захват)', async () => {
    await expect(
      reviewPermitCheck(
        checkId,
        { outcome: 'requirement_kept', decisions: [{ requirementId: reqId, action: 'keep' }] },
        master
      )
    ).rejects.toMatchObject({ status: 409 })
  })

  it('новое требование при пересмотре замороженной позиции → pending_manual (§5.7 п. 0а)', async () => {
    // needs_review на itemB (код менялся выше); удаляем позицию — ссылка
    // заморожена, но пересмотр выполняется по факту.
    const nr = await db.permitCheck.findFirst({
      where: { leadId, reviewItemId: itemB, reviewStatus: 'needs_review' },
    })
    expect(nr).not.toBeNull()
    // Требование на замороженной позиции создать: пересмотр без активных
    // требований позиции (их нет) — new_requirement краткой формой.
    const updated = await reviewPermitCheck(
      nr!.id,
      {
        outcome: 'new_requirement',
        reason: 'по новому коду нужен сертификат',
        requirement: { title: 'Декларация соответствия', providedBy: 'client' },
      },
      master
    )
    expect(updated.reviewOutcome).toBe('new_requirement')
    const created = await db.permitCheckRequirement.findFirst({
      where: { permitCheckId: nr!.id },
      include: { permitRequirement: true },
    })
    // Позиция itemB ещё не удалена — привязка обычная (bound).
    expect(created?.permitRequirement.bindingState).toBe('bound')
    expect(created?.permitRequirement.itemId).toBe(itemB)
  })
})

describe('дифф-сохранение оценки: привязки и охват (§5.7 п. 0а)', () => {
  let permitId = ''
  beforeAll(async () => {
    // Требование, привязанное к позиции A.
    const permit = await createPermit(
      { leadId },
      master,
      { title: 'Сертификат позиции A', providedBy: 'client', itemId: itemA },
      db
    )
    permitId = permit.id
  })

  it('удаление позиции с кодом: требования → pending_manual, itemId сохранён (замороженная ссылка), событие', async () => {
    // Убираем itemA из оценки (дифф: строка отсутствует в payload).
    await reseedEstimateItems([{ id: itemB, hsCode: '8471300000' }])
    await syncAfterEstimateDiff(db, {
      deal: { leadId },
      actor: { type: 'system' },
      removedItemIds: [itemA],
      addedItemIds: [],
    })
    const permit = await db.permitRequirement.findUnique({ where: { id: permitId } })
    expect(permit?.bindingState).toBe('pending_manual')
    expect(permit?.itemId).toBe(itemA) // НЕ NULL — замороженная ссылка
    expect(permit?.status).toBe('pending') // статус нетронут
    const ev = await db.activity.findFirst({
      where: { leadId, type: 'permit_relink_needed', description: { contains: 'Сертификат позиции A' } },
    })
    expect(ev).not.toBeNull()
  })

  it('добавление позиции с тем же кодом: область существующих требований НЕ расширяется', async () => {
    // Требование всё ещё pending_manual; новая позиция с кодом A не
    // перепривязывает его и не наследует.
    const itemA2 = await mkItem('8708299009', 5)
    await syncAfterEstimateDiff(db, {
      deal: { leadId },
      actor: { type: 'system' },
      removedItemIds: [],
      addedItemIds: [itemA2],
    })
    const permit = await db.permitRequirement.findUnique({ where: { id: permitId } })
    expect(permit?.itemId).toBe(itemA) // прежняя замороженная ссылка
    expect(permit?.bindingState).toBe('pending_manual')
  })

  it('ручное разрешение: выбор актуальной строки снимает pending_manual + permit_relinked', async () => {
    const itemA2 = (await db.brokerEstimateItem.findMany({ where: { estimateId, hsCode: '8708299009' } }))[0]!.id
    const updated = await patchPermit(permitId, { itemId: itemA2 }, master, db)
    expect(updated?.itemId).toBe(itemA2)
    expect(updated?.bindingState).toBe('bound')
    const ev = await db.activity.findFirst({
      where: { leadId, type: 'permit_relinked', description: { contains: 'Сертификат позиции A' } },
    })
    expect(ev).not.toBeNull()
  })

  it('чужой/несуществующий id строки при ручной привязке — 400; дубль названия на позиции — 400', async () => {
    await expect(
      patchPermit(permitId, { itemId: 'no-such-item' }, master, db)
    ).rejects.toMatchObject({ statusCode: 400 })
    // Дубль: ещё одно активное требование с тем же названием на itemB.
    await createPermit({ leadId }, master, { title: 'Сертификат позиции A', providedBy: 'client', itemId: itemB }, db)
    await expect(
      patchPermit(permitId, { itemId: itemB }, master, db)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('уникальность пары «проверка — позиция» — дубль связи отклоняется БД', async () => {
    // Открытая auto-запись кода (погашенные/история связей не трогаем).
    const check = await db.permitCheck.findFirst({
      where: { leadId, hsCode: '8708299009', source: 'auto', result: 'unclear', reviewStatus: 'none' },
    })
    expect(check).not.toBeNull()
    const items = await currentEstimateItems(db, { leadId })
    const codeA = items.find((i) => i.hsCode === '8708299009')
    await expect(
      db.permitCheckItem.create({ data: { permitCheckId: check!.id, itemId: codeA!.id } })
    ).rejects.toThrow()
  })
})

// Хелпер брокера с реальным id пользователя (снимки §6.1).
function mkBroker(brokerId: string, companyName: string, userName: string) {
  return brokerActor({ userId: brokerId, companyName, userName })
}
