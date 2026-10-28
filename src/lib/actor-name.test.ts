import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from './db'
import {
  resolveUserNames,
  projectActorName,
  projectActors,
  projectAuthors,
  projectDocumentAuthors,
  STAFF_READER,
  type ActorNameReader,
  type UserNameMap,
} from './actor-name'

// ─── DF-02A Блок 4: проекция имени актёра/автора (actor-name) ────────
// Интеграционный уровень (как company-users.test.ts): против реального
// PostgreSQL. Резолвер читает CustomerUser/BrokerUser живым запросом,
// правило проекции проверяется по карточке DF-02A:
//   staff — «Имя (Компания)»; коллеги по компании — имена; другая
//   сторона — только компания; устаревшие строки (actorId = id
//   компании, до Блока 4) деградируют в снимок компании без ошибок.

const RUN = Date.now() % 1e8

let customerA = '' // своя компания читателя-клиента
let customerB = '' // чужая компания (проверка «не имя, а компания»)
let brokerA = ''
let userA1 = '' // Иван — коллега 1
let userA2 = '' // Мария — коллега 2
let userB1 = '' // пользователь чужой компании
let userBr1 = '' // пользователь брокера

const COMPANY_A = 'Проекция-А ' + RUN
const COMPANY_B = 'Проекция-Б ' + RUN
const BROKER_A = 'Брокер-Б ' + RUN
const NAME_IVAN = 'Иван Иванов ' + RUN
const NAME_MARIA = 'Мария Петрова ' + RUN
const NAME_OLeg = 'Олег Брокеров ' + RUN

const readerClientA: ActorNameReader = { kind: 'client', customerId: '' } // customerId дополнится в beforeAll
const readerBrokerA: ActorNameReader = { kind: 'broker', brokerId: '' }

// Снимки, которые пишет БД: actorName/authorName = КОМПАНИЯ (решение
// Блока 1: наименее привилегированная строка).
const SNAPSHOT_A = COMPANY_A
const SNAPSHOT_B = COMPANY_B
const SNAPSHOT_BR = BROKER_A

beforeAll(async () => {
  const ca = await db.customer.create({ data: { name: COMPANY_A, phone: '+790' + String(RUN % 1e8).padStart(8, '0') } })
  const cb = await db.customer.create({ data: { name: COMPANY_B, phone: '+791' + String(RUN % 1e8).padStart(8, '0') } })
  // Broker.password обязателен (схема) — фикстурная строка, вход не
  // тестируется (это работа auth-тестов Блока 3).
  const br = await db.broker.create({ data: { companyName: BROKER_A, phone: '+792' + String(RUN % 1e8).padStart(8, '0'), password: 'scrypt:fixture-df02a-b4' } })
  customerA = ca.id
  customerB = cb.id
  brokerA = br.id
  ;(readerClientA as { customerId: string }).customerId = customerA
  ;(readerBrokerA as { brokerId: string }).brokerId = brokerA

  const u1 = await db.customerUser.create({ data: { customerId: customerA, name: NAME_IVAN } })
  const u2 = await db.customerUser.create({ data: { customerId: customerA, name: NAME_MARIA } })
  const ub = await db.customerUser.create({ data: { customerId: customerB, name: 'Чужой ' + RUN } })
  const u3 = await db.brokerUser.create({ data: { brokerId: brokerA, name: NAME_OLeg } })
  userA1 = u1.id
  userA2 = u2.id
  userB1 = ub.id
  userBr1 = u3.id
})

afterAll(async () => {
  // Каскад: пользователи уходят вместе с компаниями.
  await db.customer.deleteMany({ where: { id: { in: [customerA, customerB] } } })
  await db.broker.deleteMany({ where: { id: brokerA } })
})

// id компании «до Блока 4» — пользователя с таким id нет, резолв мимо.
const LEGACY_ID = 'legacy-company-' + RUN

function actorRef(type: string, id: string | null, name: string) {
  return { actorType: type, actorId: id, actorName: name }
}

async function staffMap(): Promise<UserNameMap> {
  return resolveUserNames([
    actorRef('client', userA1, SNAPSHOT_A),
    actorRef('client', userA2, SNAPSHOT_A),
    actorRef('client', userB1, SNAPSHOT_B),
    actorRef('broker', userBr1, SNAPSHOT_BR),
    actorRef('client', LEGACY_ID, SNAPSHOT_A),
    actorRef('employee', 'emp-1', 'Менеджер'),
  ])
}

describe('resolveUserNames (батч-резолв пользователей)', () => {
  it('резолвит клиентских и брокерских пользователей, сотрудников не трогает', async () => {
    const map = await staffMap()
    expect(map.size).toBe(4) // userA1, userA2, userB1, userBr1; legacy/employee — мимо
    expect(map.get(userA1)).toMatchObject({
      userName: NAME_IVAN,
      companyName: COMPANY_A,
      customerId: customerA,
      brokerId: '',
    })
    expect(map.get(userBr1)).toMatchObject({
      userName: NAME_OLeg,
      companyName: BROKER_A,
      customerId: '',
      brokerId: brokerA,
    })
  })

  it('пустой список — без обращений к БД (пустая карта)', async () => {
    const map = await resolveUserNames([])
    expect(map.size).toBe(0)
  })
})

describe('projectActorName — правило карточки DF-02A', () => {
  it('staff: «Имя (Компания)» для клиента и брокера', async () => {
    const map = await staffMap()
    expect(projectActorName({ type: 'client', id: userA1, name: SNAPSHOT_A }, map, STAFF_READER))
      .toBe(`${NAME_IVAN} (${COMPANY_A})`)
    expect(projectActorName({ type: 'broker', id: userBr1, name: SNAPSHOT_BR }, map, STAFF_READER))
      .toBe(`${NAME_OLeg} (${BROKER_A})`)
  })

  it('staff: устаревшая строка (actorId = компания) — снимок компании, без падения', async () => {
    const map = await staffMap()
    expect(projectActorName({ type: 'client', id: LEGACY_ID, name: SNAPSHOT_A }, map, STAFF_READER))
      .toBe(SNAPSHOT_A)
  })

  it('staff: сотрудник/подрядчик/система — снимок как есть', async () => {
    const map = await staffMap()
    expect(projectActorName({ type: 'employee', id: 'emp-1', name: 'Менеджер' }, map, STAFF_READER))
      .toBe('Менеджер')
    expect(projectActorName({ type: 'contractor', id: 'c-1', name: 'Перевозчик' }, map, STAFF_READER))
      .toBe('Перевозчик')
    expect(projectActorName({ type: 'system', id: null, name: 'Система' }, map, STAFF_READER))
      .toBe('Система')
  })

  it('клиент: коллеги по своей компании — имена', async () => {
    const map = await staffMap()
    expect(projectActorName({ type: 'client', id: userA1, name: SNAPSHOT_A }, map, readerClientA))
      .toBe(NAME_IVAN)
    expect(projectActorName({ type: 'client', id: userA2, name: SNAPSHOT_A }, map, readerClientA))
      .toBe(NAME_MARIA)
  })

  it('клиент: пользователь ЧУЖОЙ компании — компания, не имя', async () => {
    const map = await staffMap()
    expect(projectActorName({ type: 'client', id: userB1, name: SNAPSHOT_B }, map, readerClientA))
      .toBe(SNAPSHOT_B)
  })

  it('клиент: другая сторона (брокер) — компания; устаревшая строка — компания', async () => {
    const map = await staffMap()
    expect(projectActorName({ type: 'broker', id: userBr1, name: SNAPSHOT_BR }, map, readerClientA))
      .toBe(SNAPSHOT_BR)
    expect(projectActorName({ type: 'client', id: LEGACY_ID, name: SNAPSHOT_A }, map, readerClientA))
      .toBe(SNAPSHOT_A)
  })

  it('брокер: коллега — имя; клиент (другая сторона) — компания', async () => {
    const map = await staffMap()
    expect(projectActorName({ type: 'broker', id: userBr1, name: SNAPSHOT_BR }, map, readerBrokerA))
      .toBe(NAME_OLeg)
    expect(projectActorName({ type: 'client', id: userA1, name: SNAPSHOT_A }, map, readerBrokerA))
      .toBe(SNAPSHOT_A)
  })
})

describe('обёртки для роутов (лента, версии, документы)', () => {
  it('projectActors: actorName заменён, остальные поля и оригинал не тронуты', async () => {
    const rows = [
      { id: 'a1', actorType: 'client', actorId: userA1, actorName: SNAPSHOT_A, type: 'lead_edited', description: 'd1' },
      { id: 'a2', actorType: 'employee', actorId: 'emp-1', actorName: 'Менеджер', type: 'order_created', description: 'd2' },
    ]
    const projected = await projectActors(rows, STAFF_READER)
    expect(projected[0].actorName).toBe(`${NAME_IVAN} (${COMPANY_A})`)
    expect(projected[0].description).toBe('d1')
    expect(projected[1].actorName).toBe('Менеджер')
    // оригинал не мутирован
    expect(rows[0].actorName).toBe(SNAPSHOT_A)
    expect(rows[0]).not.toBe(projected[0])
  })

  it('projectAuthors: версия документа — «Имя (Компания)» для staff', async () => {
    const versions = [
      { id: 'v1', authorType: 'client', authorId: userA1, authorName: SNAPSHOT_A, version: 1 },
      { id: 'v2', authorType: 'broker', authorId: userBr1, authorName: SNAPSHOT_BR, version: 2 },
    ]
    const projected = await projectAuthors(versions, STAFF_READER)
    expect(projected[0].authorName).toBe(`${NAME_IVAN} (${COMPANY_A})`)
    expect(projected[1].authorName).toBe(`${NAME_OLeg} (${BROKER_A})`)
    expect(versions[0].authorName).toBe(SNAPSHOT_A)
  })

  it('projectDocumentAuthors: один резолв на все версии всех документов', async () => {
    const docs = [
      {
        id: 'doc1',
        title: 'Инвойс',
        versions: [
          { id: 'v1', authorType: 'client', authorId: userA1, authorName: SNAPSHOT_A, version: 1 },
          { id: 'v2', authorType: 'employee', authorId: 'emp-1', authorName: 'Менеджер', version: 2 },
        ],
      },
      {
        id: 'doc2',
        title: 'ДТ',
        versions: [
          { id: 'v3', authorType: 'broker', authorId: userBr1, authorName: SNAPSHOT_BR, version: 1 },
        ],
      },
      {
        id: 'doc3',
        title: 'Пустой',
        versions: [],
      },
    ]
    const staffView = await projectDocumentAuthors(docs, STAFF_READER)
    expect(staffView[0].versions[0].authorName).toBe(`${NAME_IVAN} (${COMPANY_A})`)
    expect(staffView[0].versions[1].authorName).toBe('Менеджер')
    expect(staffView[1].versions[0].authorName).toBe(`${NAME_OLeg} (${BROKER_A})`)

    // клиент компании A: свой — имя, брокер — компания
    const clientView = await projectDocumentAuthors(docs, readerClientA)
    expect(clientView[0].versions[0].authorName).toBe(NAME_IVAN)
    expect(clientView[1].versions[0].authorName).toBe(SNAPSHOT_BR)

    // брокер: свой — имя, клиент — компания
    const brokerView = await projectDocumentAuthors(docs, readerBrokerA)
    expect(brokerView[1].versions[0].authorName).toBe(NAME_OLeg)
    expect(brokerView[0].versions[0].authorName).toBe(SNAPSHOT_A)

    // оригинал не мутирован
    expect(docs[0].versions[0].authorName).toBe(SNAPSHOT_A)
  })

  it('живая запись через emitEvent-семантику (actorId = userId, actorName = компания) проецируется для staff', async () => {
    // Записываем строку журнала так, как это делает emitEvent после
    // Блока 4 (clientActor → id пользователя, снимок компании), и
    // читаем обратно через projectActors.
    const created = await db.activity.create({
      data: {
        actorType: 'client',
        actorId: userA2,
        actorName: SNAPSHOT_A,
        type: 'lead_edited',
        description: 'DF02A-B4 проекция ' + RUN,
        isInternal: false,
        audience: ['staff'],
      },
      select: { id: true, actorType: true, actorId: true, actorName: true },
    })
    try {
      const [projected] = await projectActors([created], STAFF_READER)
      expect(projected.actorName).toBe(`${NAME_MARIA} (${COMPANY_A})`)
      const [asColleague] = await projectActors([created], readerClientA)
      expect(asColleague.actorName).toBe(NAME_MARIA)
    } finally {
      await db.activity.delete({ where: { id: created.id } })
    }
  })
})
