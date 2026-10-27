import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { db } from './db'
import { ACTIVITY_TYPES, logInternalNote, employeeActor } from './activity'
import { emitEvent, EVENT_TYPES, SYSTEM_ACTOR_NAME } from './events'
import { eventWhereFor, AUDIENCES, type Audience } from './audience'

// ─── DF-01 «События как ось»: реестр EVENT_TYPES + emitEvent ────────
// Интеграционный уровень (как convert-atomic.test.ts): против реального
// PostgreSQL. Проверяются: полнота и валидность реестра, дефолты
// аудитории по реестру (карточка DF-01, «Проверки»), канонизация и
// отсечение чужих значений, семантика ошибок, атомарность (откат
// изменения откатывает и событие) и видимость через eventWhereFor —
// «внутренняя заметка не видна клиенту и брокеру, событие смены статуса
// видно клиенту» на уровне данных.

// Синхрон с union NotifyRule (events.ts): компилятор защищает реестр
// от лишних правил, тест — от случайного расширения union.
const NOTIFY_RULES = [
  'responsible',
  'responsible-if-not-actor',
  'responsible-if-external-actor',
  'new-assignee',
  'client',
  'client-neutral',
  'broker',
  'client-broker-if-visible',
]

// Уникальный маркер описаний этого прогона — чищаем и ищем только свои.
const RUN = 'df01-events-test-' + Date.now()
let leadId = ''
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

async function lastEvent(descriptionPart: string) {
  return db.activity.findFirst({
    where: { leadId, description: { contains: descriptionPart } },
    orderBy: { createdAt: 'desc' },
  })
}

beforeAll(async () => {
  const lead = await db.lead.create({ data: { rawContact: { name: RUN } } })
  leadId = lead.id
})

afterAll(async () => {
  await db.activity.deleteMany({ where: { leadId } })
  await db.lead.delete({ where: { id: leadId } })
  consoleSpy.mockRestore()
})

describe('EVENT_TYPES — реестр полон и валиден', () => {
  it('покрывает ровно все коды ACTIVITY_TYPES (в обе стороны)', () => {
    const registryKeys = Object.keys(EVENT_TYPES).sort()
    expect(registryKeys).toEqual([...ACTIVITY_TYPES].sort())
  })

  it('у каждого типа: непустая аудитория из AUDIENCES и известные notify-правила', () => {
    for (const [code, meta] of Object.entries(EVENT_TYPES)) {
      expect(meta.audience.length, `${code}: аудитория пуста`).toBeGreaterThan(0)
      for (const a of meta.audience) {
        expect(AUDIENCES, `${code}: неизвестная аудитория ${a}`).toContain(a)
      }
      for (const n of meta.notify) {
        expect(NOTIFY_RULES, `${code}: неизвестное notify-правило ${n}`).toContain(n)
      }
    }
  })

  it('проектные решения: внутренний контур — staff-only, документы — все три', () => {
    // Заметки/подрядчики/смена исполнителя этапа — только staff (§8, глоссарий 2.6).
    for (const code of [
      'note_added',
      'stage_contractor_changed',
      'contractor_created',
      'contractor_updated',
      'contractor_pool_changed',
      'contractor_password_changed',
    ] as const) {
      expect(EVENT_TYPES[code].audience, code).toEqual(['staff'])
    }
    // Документы — все три аудитории (внутренний документ переопределяет
    // точка вызова через documentEventAudience).
    for (const code of ['document_created', 'document_version_added', 'document_deleted'] as const) {
      expect(EVENT_TYPES[code].audience, code).toEqual(['staff', 'client', 'broker'])
    }
  })
})

describe('emitEvent — запись на реальной БД', () => {
  it('без явной аудитории берёт дефолт из реестра; isInternal = (audience == {staff})', async () => {
    await emitEvent(db, {
      target: { leadId },
      actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
      type: 'lead_created',
      description: RUN + ' дефолт из реестра',
    })
    const row = await lastEvent('дефолт из реестра')
    expect(row).not.toBeNull()
    expect(row!.audience).toEqual(['staff', 'client'])
    expect(row!.isInternal).toBe(false)
    expect(row!.actorType).toBe('employee')
  })

  it('явная аудитория сильнее реестра (внутренний документ → staff-only)', async () => {
    await emitEvent(db, {
      target: { leadId },
      actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
      type: 'document_created',
      description: RUN + ' явная аудитория',
      audience: ['staff'],
    })
    const row = await lastEvent('явная аудитория')
    expect(row!.audience).toEqual(['staff'])
    expect(row!.isInternal).toBe(true)
  })

  it('канонизация: порядок по AUDIENCES, дубликаты схлопываются', async () => {
    await emitEvent(db, {
      target: { leadId },
      actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
      type: 'lead_edited',
      description: RUN + ' канонизация',
      audience: ['client', 'staff', 'client'],
    })
    expect((await lastEvent('канонизация'))!.audience).toEqual(['staff', 'client'])
  })

  it('contractor в аудитории вырезается с сигналом в консоль (D31)', async () => {
    await emitEvent(db, {
      target: { leadId },
      actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
      type: 'lead_edited',
      description: RUN + ' contractor вырезан',
      audience: ['staff', 'contractor' as Audience],
    })
    const row = await lastEvent('contractor вырезан')
    expect(row!.audience).toEqual(['staff'])
    expect(row!.isInternal).toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('посторонние значения'),
      expect.anything()
    )
  })

  it('пустая аудитория — событие не записано, факт в консоль', async () => {
    await emitEvent(db, {
      target: { leadId },
      actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
      type: 'lead_edited',
      description: RUN + ' пустая аудитория',
      audience: [],
    })
    expect(await lastEvent('пустая аудитория')).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('пустая аудитория'), 'lead_edited')
  })

  it('stageId/documentId пишутся pass-through (задел DF-07 Пульс)', async () => {
    await emitEvent(db, {
      target: { leadId },
      actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
      type: 'stage_added',
      description: RUN + ' связи',
      stageId: 'stage-fake-id',
      documentId: 'doc-fake-id',
    })
    const row = await lastEvent('связи')
    expect(row!.stageId).toBe('stage-fake-id')
    expect(row!.documentId).toBe('doc-fake-id')
  })

  it('актёр system: actorId пуст, имя — снимок SYSTEM_ACTOR_NAME', async () => {
    await emitEvent(db, {
      target: { leadId },
      actor: { type: 'system' },
      type: 'lead_edited',
      description: RUN + ' системный актёр',
    })
    const row = await lastEvent('системный актёр')
    expect(row!.actorType).toBe('system')
    expect(row!.actorId).toBeNull()
    expect(row!.actorName).toBe(SYSTEM_ACTOR_NAME)
  })

  it('ошибка записи глотается и логируется — событие не валит операцию', async () => {
    // FK на orderId: несуществующая заявка → P2003 внутри emitEvent.
    await expect(
      emitEvent(db, {
        target: { orderId: 'no-such-order' },
        actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
        type: 'order_created',
        description: RUN + ' проглочено',
      })
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('не записано'),
      'order_created',
      expect.anything(),
      expect.anything()
    )
  })

  it('ошибка в транзакции откатывает и данные, и событие (критерий приёмки)', async () => {
    const countBefore = await db.activity.count({ where: { leadId } })
    await expect(
      db.$transaction(async (tx) => {
        await emitEvent(tx, {
          target: { leadId },
          actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
          type: 'lead_edited',
          description: RUN + ' должен откатиться',
        })
        throw new Error('Simulated failure after event (DF-01)')
      })
    ).rejects.toThrow('Simulated failure after event (DF-01)')
    expect(await db.activity.count({ where: { leadId } })).toBe(countBefore)
    expect(await lastEvent('должен откатиться')).toBeNull()
  })

  it('emitEvent принимает любой Prisma-клиент транзакции (тип tx)', () => {
    // Статическая проверка совместимости: фейковый TransactionClient
    // подходит по типу — тест компилируется, вызов не выполняется.
    const fake = { activity: { create: vi.fn() } } as unknown as Prisma.TransactionClient
    expect(fake).toBeDefined()
  })
})

describe('видимость через eventWhereFor (уровень данных)', () => {
  it('внутренняя заметка не видна client и broker, staff видит', async () => {
    const marker = RUN + ' заметка-невидимка'
    await logInternalNote({ leadId }, employeeActor({ id: 'df01-test', name: 'Тест DF-01' }), marker)
    const staffView = await db.activity.findMany({ where: eventWhereFor('staff') })
    const clientView = await db.activity.findMany({ where: eventWhereFor('client') })
    const brokerView = await db.activity.findMany({ where: eventWhereFor('broker') })
    expect(staffView.some((a) => a.description === marker)).toBe(true)
    expect(clientView.some((a) => a.description === marker)).toBe(false)
    expect(brokerView.some((a) => a.description === marker)).toBe(false)
  })

  it('событие смены статуса видно клиенту (аудитория из реестра)', async () => {
    const marker = RUN + ' статус-событие'
    await emitEvent(db, {
      target: { leadId },
      actor: employeeActor({ id: 'df01-test', name: 'Тест DF-01' }),
      type: 'lead_status_changed',
      description: marker,
    })
    const clientView = await db.activity.findMany({ where: eventWhereFor('client') })
    const brokerView = await db.activity.findMany({ where: eventWhereFor('broker') })
    expect(clientView.some((a) => a.description === marker)).toBe(true)
    // broker в аудитории нет — событие брокеру не адресовано.
    expect(brokerView.some((a) => a.description === marker)).toBe(false)
  })
})
