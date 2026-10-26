/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashPassword } from './password'

// In-memory mock database for AI Studio environment
// Supports Prisma-compatible API with pre-seeded data

export interface RecordItem {
  id: string
  [key: string]: any
}

function matchFilter(recordVal: any, filterVal: any): boolean {
  if (filterVal === undefined) return true
  if (filterVal === null) return recordVal === null || recordVal === undefined
  if (typeof filterVal === 'object' && !(filterVal instanceof Date) && !Array.isArray(filterVal)) {
    for (const [op, val] of Object.entries(filterVal)) {
      if (op === 'equals') {
        if (recordVal !== val) return false
      } else if (op === 'in') {
        if (!Array.isArray(val) || !val.includes(recordVal)) return false
      } else if (op === 'notIn') {
        if (Array.isArray(val) && val.includes(recordVal)) return false
      } else if (op === 'not') {
        if (recordVal === val) return false
      } else if (op === 'lt') {
        const rv = recordVal instanceof Date ? recordVal.getTime() : Number(recordVal)
        const v = val instanceof Date ? val.getTime() : Number(val)
        if (!(rv < v)) return false
      } else if (op === 'lte') {
        const rv = recordVal instanceof Date ? recordVal.getTime() : Number(recordVal)
        const v = val instanceof Date ? val.getTime() : Number(val)
        if (!(rv <= v)) return false
      } else if (op === 'gt') {
        const rv = recordVal instanceof Date ? recordVal.getTime() : Number(recordVal)
        const v = val instanceof Date ? val.getTime() : Number(val)
        if (!(rv > v)) return false
      } else if (op === 'gte') {
        const rv = recordVal instanceof Date ? recordVal.getTime() : Number(recordVal)
        const v = val instanceof Date ? val.getTime() : Number(val)
        if (!(rv >= v)) return false
      } else if (op === 'contains') {
        const str = String(recordVal || '')
        const needle = String(val || '')
        const mode = (filterVal as any).mode
        if (mode === 'insensitive') {
          if (!str.toLowerCase().includes(needle.toLowerCase())) return false
        } else {
          if (!str.includes(needle)) return false
        }
      }
    }
    return true
  }
  if (recordVal instanceof Date && filterVal instanceof Date) {
    return recordVal.getTime() === filterVal.getTime()
  }
  return recordVal === filterVal
}

function matchesWhere(item: RecordItem, where?: Record<string, any>): boolean {
  if (!where || Object.keys(where).length === 0) return true

  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR') {
      if (Array.isArray(val) && !val.some((sub) => matchesWhere(item, sub))) return false
      continue
    }
    if (key === 'AND') {
      if (Array.isArray(val) && !val.every((sub) => matchesWhere(item, sub))) return false
      continue
    }
    if (key === 'NOT') {
      if (Array.isArray(val) && val.some((sub) => matchesWhere(item, sub))) return false
      if (!Array.isArray(val) && matchesWhere(item, val)) return false
      continue
    }

    // Composite keys (e.g. customerId_legalEntityId, leadId_brokerId, etc.)
    if (key.includes('_') && typeof val === 'object' && val !== null && !(val instanceof Date)) {
      let allMatch = true
      for (const [subKey, subVal] of Object.entries(val)) {
        if (!matchFilter(item[subKey], subVal)) {
          allMatch = false
          break
        }
      }
      if (allMatch) continue
    }

    if (!matchFilter(item[key], val)) {
      return false
    }
  }
  return true
}

export class MockTable {
  public records: Map<string, RecordItem> = new Map()

  constructor(public modelName: string, initial: RecordItem[] = []) {
    for (const item of initial) {
      this.records.set(item.id, { ...item })
    }
  }

  async findUnique(args: { where: Record<string, any>; include?: Record<string, any>; select?: Record<string, any> }) {
    for (const item of this.records.values()) {
      if (matchesWhere(item, args.where)) {
        return this.resolveRelations(item, args.include, args.select)
      }
    }
    return null
  }

  async findFirst(args?: { where?: Record<string, any>; orderBy?: any; include?: Record<string, any>; select?: Record<string, any> }) {
    const list = await this.findMany({ where: args?.where, orderBy: args?.orderBy, take: 1, include: args?.include, select: args?.select })
    return list[0] ?? null
  }

  async findMany(args?: { where?: Record<string, any>; orderBy?: any; skip?: number; take?: number; include?: Record<string, any>; select?: Record<string, any> }) {
    let result: RecordItem[] = []
    for (const item of this.records.values()) {
      if (matchesWhere(item, args?.where)) {
        result.push({ ...item })
      }
    }

    if (args?.orderBy) {
      const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]
      result.sort((a, b) => {
        for (const order of orders) {
          const [field, dir] = Object.entries(order)[0] || []
          if (!field) continue
          const valA = a[field]
          const valB = b[field]
          if (valA === valB) continue
          if (valA === undefined || valA === null) return 1
          if (valB === undefined || valB === null) return -1
          const factor = dir === 'desc' ? -1 : 1
          if (valA instanceof Date && valB instanceof Date) {
            return (valA.getTime() - valB.getTime()) * factor
          }
          if (typeof valA === 'string' && typeof valB === 'string') {
            return valA.localeCompare(valB) * factor
          }
          return (Number(valA) - Number(valB)) * factor
        }
        return 0
      })
    }

    if (args?.skip && args.skip > 0) {
      result = result.slice(args.skip)
    }
    if (args?.take !== undefined) {
      result = result.slice(0, args.take)
    }

    return Promise.all(result.map((item) => this.resolveRelations(item, args?.include, args?.select)))
  }

  async count(args?: { where?: Record<string, any> }): Promise<number> {
    let cnt = 0
    for (const item of this.records.values()) {
      if (matchesWhere(item, args?.where)) {
        cnt++
      }
    }
    return cnt
  }

  async create(args: { data: Record<string, any>; include?: Record<string, any>; select?: Record<string, any> }) {
    const id = args.data.id || `${this.modelName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const defaults: Record<string, any> = {}
    if (['employee', 'broker', 'contractor', 'legalentity', 'customer'].includes(this.modelName.toLowerCase())) {
      defaults.isActive = true
    }
    const cleanData: Record<string, any> = {}
    for (const [k, v] of Object.entries(args.data)) {
      if (v !== undefined) cleanData[k] = v
    }
    const item: RecordItem = {
      ...defaults,
      ...cleanData,
      id,
      createdAt: now,
      updatedAt: now,
    }
    this.records.set(id, item)
    return this.resolveRelations(item, args.include, args.select)
  }

  async createMany(args: { data: Record<string, any>[] }) {
    for (const d of args.data) {
      await this.create({ data: d })
    }
    return { count: args.data.length }
  }

  async update(args: { where: Record<string, any>; data: Record<string, any>; include?: Record<string, any>; select?: Record<string, any> }) {
    const item = await this.findUnique({ where: args.where })
    if (!item) {
      throw new Error(`Record to update not found in ${this.modelName}`)
    }
    const cleanData: Record<string, any> = {}
    for (const [k, v] of Object.entries(args.data)) {
      if (v !== undefined) cleanData[k] = v
    }
    const updated = {
      ...item,
      ...cleanData,
      updatedAt: new Date(),
    }
    this.records.set(updated.id, updated)
    return this.resolveRelations(updated, args.include, args.select)
  }

  async updateMany(args: { where?: Record<string, any>; data: Record<string, any> }) {
    let count = 0
    for (const item of this.records.values()) {
      if (matchesWhere(item, args?.where)) {
        const updated = {
          ...item,
          ...args.data,
          updatedAt: new Date(),
        }
        this.records.set(updated.id, updated)
        count++
      }
    }
    return { count }
  }

  async delete(args: { where: Record<string, any>; include?: Record<string, any> }) {
    const item = await this.findUnique({ where: args.where })
    if (!item) {
      throw new Error(`Record to delete not found in ${this.modelName}`)
    }
    this.records.delete(item.id)
    return item
  }

  async deleteMany(args?: { where?: Record<string, any> }) {
    let count = 0
    for (const [id, item] of this.records.entries()) {
      if (matchesWhere(item, args?.where)) {
        this.records.delete(id)
        count++
      }
    }
    return { count }
  }

  async upsert(args: { where: Record<string, any>; create: Record<string, any>; update: Record<string, any>; include?: Record<string, any> }) {
    const existing = await this.findUnique({ where: args.where })
    if (existing) {
      return this.update({ where: args.where, data: args.update, include: args.include })
    }
    return this.create({ data: { ...args.where, ...args.create }, include: args.include })
  }

  private async resolveRelations(item: RecordItem, include?: Record<string, any>, select?: Record<string, any>): Promise<any> {
    const clone = { ...item }
    if (include) {
      for (const [rel, val] of Object.entries(include)) {
        if (!val) continue
        clone[rel] = await resolveRelation(this.modelName, clone, rel, typeof val === 'object' ? val : undefined)
      }
    }
    if (select) {
      const selected: Record<string, any> = {}
      for (const [key, selVal] of Object.entries(select)) {
        if (!selVal) continue
        if (key in clone) {
          selected[key] = clone[key]
        } else {
          selected[key] = await resolveRelation(this.modelName, clone, key, typeof selVal === 'object' ? selVal : undefined)
        }
      }
      return selected
    }
    return clone
  }
}

// Global registry of mock tables
export const tables: Record<string, MockTable> = {}

function getTable(name: string): MockTable {
  const key = name.toLowerCase()
  if (!tables[key]) {
    tables[key] = new MockTable(name)
  }
  return tables[key]
}

async function resolveRelation(modelName: string, item: RecordItem, rel: string, subArgs?: any): Promise<any> {
  const m = modelName.toLowerCase()
  const r = rel.toLowerCase()

  // Employee sessions & reverse relations
  if (m === 'employeesession' && r === 'employee') {
    return getTable('employee').findUnique({ where: { id: item.employeeId } })
  }
  if (m === 'clientsession' && r === 'customer') {
    return getTable('customer').findUnique({ where: { id: item.customerId } })
  }
  if (m === 'contractorsession' && r === 'contractor') {
    return getTable('contractor').findUnique({ where: { id: item.contractorId } })
  }
  if (m === 'brokersession' && r === 'broker') {
    return getTable('broker').findUnique({ where: { id: item.brokerId } })
  }

  // Order relations
  if (m === 'order') {
    if (r === 'contract') return getTable('contract').findUnique({ where: { id: item.contractId } })
    if (r === 'legalentity') return getTable('legalentity').findUnique({ where: { id: item.legalEntityId } })
    if (r === 'customer') return getTable('customer').findUnique({ where: { id: item.customerId } })
    if (r === 'lead') return item.leadId ? getTable('lead').findUnique({ where: { id: item.leadId }, include: subArgs?.include }) : null
    if (r === 'assignee') return item.assignedToId ? getTable('employee').findUnique({ where: { id: item.assignedToId } }) : null
    if (r === 'stages') return getTable('orderstageinstance').findMany({ where: { orderId: item.id }, orderBy: { sequence: 'asc' }, include: subArgs?.include })
    if (r === 'brokers') return getTable('orderbroker').findMany({ where: { orderId: item.id }, include: subArgs?.include })
    if (r === 'documents') return getTable('document').findMany({ where: { orderId: item.id }, include: subArgs?.include })
    if (r === 'activities') return getTable('activity').findMany({ where: { orderId: item.id }, orderBy: { createdAt: 'desc' } })
  }

  // Lead relations
  if (m === 'lead') {
    if (r === 'customer') return item.customerId ? getTable('customer').findUnique({ where: { id: item.customerId } }) : null
    if (r === 'assignee') return item.assignedToId ? getTable('employee').findUnique({ where: { id: item.assignedToId } }) : null
    if (r === 'options') return getTable('quoteoption').findMany({ where: { leadId: item.id } })
    if (r === 'order') return getTable('order').findFirst({ where: { leadId: item.id } })
    if (r === 'brokers') return getTable('leadbroker').findMany({ where: { leadId: item.id }, include: subArgs?.include })
    if (r === 'documents') return getTable('document').findMany({ where: { leadId: item.id }, include: subArgs?.include })
    if (r === 'activities') return getTable('activity').findMany({ where: { leadId: item.id }, orderBy: { createdAt: 'desc' } })
  }

  // OrderStageInstance
  if (m === 'orderstageinstance') {
    if (r === 'order') return getTable('order').findUnique({ where: { id: item.orderId } })
    if (r === 'contractor') return item.contractorId ? getTable('contractor').findUnique({ where: { id: item.contractorId } }) : null
  }

  // QuoteOption
  if (m === 'quoteoption' && r === 'lead') {
    return getTable('lead').findUnique({ where: { id: item.leadId } })
  }

  // Document
  if (m === 'document') {
    if (r === 'versions') return getTable('documentversion').findMany({ where: { documentId: item.id }, orderBy: { version: 'desc' } })
    if (r === 'order') return item.orderId ? getTable('order').findUnique({ where: { id: item.orderId } }) : null
    if (r === 'lead') return item.leadId ? getTable('lead').findUnique({ where: { id: item.leadId } }) : null
  }

  // Brokers
  if (m === 'leadbroker') {
    if (r === 'broker') return getTable('broker').findUnique({ where: { id: item.brokerId } })
    if (r === 'lead') return getTable('lead').findUnique({ where: { id: item.leadId } })
    if (r === 'estimate') return getTable('brokerestimate').findFirst({ where: { leadBrokerId: item.id } })
  }
  if (m === 'orderbroker') {
    if (r === 'broker') return getTable('broker').findUnique({ where: { id: item.brokerId } })
    if (r === 'order') return getTable('order').findUnique({ where: { id: item.orderId } })
  }

  // Contractor Lead
  if (m === 'contractorlead' && r === 'contractor') {
    return item.contractorId ? getTable('contractor').findUnique({ where: { id: item.contractorId } }) : null
  }
  if (m === 'contractor' && r === 'lead') {
    return getTable('contractorlead').findFirst({ where: { contractorId: item.id } })
  }

  // Contract
  if (m === 'contract') {
    if (r === 'customer') return getTable('customer').findUnique({ where: { id: item.customerId } })
    if (r === 'legalentity') return getTable('legalentity').findUnique({ where: { id: item.legalEntityId } })
    if (r === 'orders') return getTable('order').findMany({ where: { contractId: item.id } })
  }

  // Customer
  if (m === 'customer') {
    if (r === 'contracts') return getTable('contract').findMany({ where: { customerId: item.id } })
    if (r === 'orders') return getTable('order').findMany({ where: { customerId: item.id } })
    if (r === 'leads') return getTable('lead').findMany({ where: { customerId: item.id } })
  }

  return null
}

// Seed initial database
export function seedMockDatabase() {
  // 1. Employees
  tables.employee = new MockTable('Employee', [
    {
      id: 'emp_master_1',
      name: 'Мастер Logix',
      phone: '+79000000000',
      password: hashPassword('logix-master'),
      roles: '["master"]',
      isActive: true,
      createdAt: new Date('2026-01-01'),
    },
    {
      id: 'emp_manager_1',
      name: 'Иван Менеджеров',
      phone: '+79001112233',
      password: hashPassword('logix-manager'),
      roles: '["manager"]',
      isActive: true,
      createdAt: new Date('2026-01-10'),
    },
  ])

  // 2. Stage Catalog
  tables.orderstagecatalog = new MockTable('OrderStageCatalog', [
    { id: 'sc_1', code: 'export_pickup', name: 'Забор груза у отправителя', order: 1, isMandatory: true },
    { id: 'sc_2', code: 'export_customs', name: 'Экспортное таможенное оформление', order: 2, isMandatory: true },
    { id: 'sc_3', code: 'loading', name: 'Погрузка на транспорт', order: 3, isMandatory: true },
    { id: 'sc_4', code: 'transport', name: 'Международная перевозка', order: 4, isMandatory: true },
    { id: 'sc_5', code: 'import_customs', name: 'Импортное таможенное оформление', order: 5, isMandatory: true },
    { id: 'sc_6', code: 'final_delivery', name: 'Доставка до получателя', order: 6, isMandatory: true },
    { id: 'sc_7', code: 'warehouse_storage', name: 'Складское хранение', order: 10, isMandatory: false },
    { id: 'sc_8', code: 'cargo_insurance', name: 'Страхование груза', order: 11, isMandatory: false },
  ])

  // 3. Legal Entity
  tables.legalentity = new MockTable('LegalEntity', [
    {
      id: 'le_1',
      name: 'ООО «Логикс»',
      requisites: {
        inn: '7701234567',
        kpp: '770101001',
        ogrn: '1234567890123',
        address: 'г. Москва, ул. Логистическая, д. 10',
        bank: 'ПАО Сбербанк',
        rsch: '40702810000000000001',
        ksch: '30101810400000000225',
        bik: '044525225',
      },
      isActive: true,
      createdAt: new Date('2026-01-01'),
    },
  ])

  // 4. Customer
  tables.customer = new MockTable('Customer', [
    {
      id: 'cust_1',
      name: 'ООО «ТоргСнаб»',
      phone: '+79005554433',
      email: 'info@torgsnab.ru',
      comment: 'Постоянный клиент, поставки оборудования',
      password: hashPassword('client-pass'),
      isActive: true,
      createdAt: new Date('2026-01-10'),
    },
    {
      id: 'cust_2',
      name: 'ИП Смирнов А.В.',
      phone: '+79004443322',
      email: 'smirnov@cargo.ru',
      comment: 'Сборные грузы из Китая',
      password: hashPassword('client-pass'),
      isActive: true,
      createdAt: new Date('2026-02-01'),
    },
  ])

  // 5. Contract
  tables.contract = new MockTable('Contract', [
    {
      id: 'cont_1',
      legalEntityId: 'le_1',
      customerId: 'cust_1',
      number: 17,
      signedAt: new Date('2026-01-15'),
      createdAt: new Date('2026-01-15'),
    },
  ])

  // 6. Order
  tables.order = new MockTable('Order', [
    {
      id: 'ord_1',
      number: '17-1',
      numberInContract: 1,
      contractId: 'cont_1',
      legalEntityId: 'le_1',
      customerId: 'cust_1',
      leadId: null,
      incoterm: 'FOB',
      cargoProfile: 'standard',
      hsCode: '8471300000',
      status: 'in_progress',
      cargoInfo: { description: 'Электроника и серверные компоненты', places: 8, packaging: 'паллеты' },
      originCity: 'Шанхай',
      originCountry: 'Китай',
      destinationCity: 'Москва',
      destinationCountry: 'Россия',
      transportType: 'sea',
      readyDate: new Date('2026-10-10'),
      weightKg: 2450,
      volumeM3: 14.5,
      placesCount: 8,
      assignedToId: 'emp_manager_1',
      createdAt: new Date('2026-10-12'),
      updatedAt: new Date('2026-10-24'),
    },
  ])

  // 7. Order Stages
  tables.orderstageinstance = new MockTable('OrderStageInstance', [
    { id: 'stg_1', orderId: 'ord_1', stageCode: 'export_pickup', sequence: 1, status: 'done', plannedDate: new Date('2026-10-14'), actualDate: new Date('2026-10-14') },
    { id: 'stg_2', orderId: 'ord_1', stageCode: 'export_customs', sequence: 2, status: 'done', plannedDate: new Date('2026-10-16'), actualDate: new Date('2026-10-16') },
    { id: 'stg_3', orderId: 'ord_1', stageCode: 'loading', sequence: 3, status: 'done', plannedDate: new Date('2026-10-18'), actualDate: new Date('2026-10-18') },
    { id: 'stg_4', orderId: 'ord_1', stageCode: 'transport', sequence: 4, status: 'in_progress', plannedDate: new Date('2026-11-05'), actualDate: null, contractorId: 'contr_1' },
    { id: 'stg_5', orderId: 'ord_1', stageCode: 'import_customs', sequence: 5, status: 'not_started', plannedDate: new Date('2026-11-08'), actualDate: null },
    { id: 'stg_6', orderId: 'ord_1', stageCode: 'final_delivery', sequence: 6, status: 'not_started', plannedDate: new Date('2026-11-12'), actualDate: null },
  ])

  // 8. Lead
  tables.lead = new MockTable('Lead', [
    {
      id: 'lead_1',
      customerId: 'cust_1',
      rawContact: { name: 'ООО «ТоргСнаб»', phone: '+79005554433', email: 'info@torgsnab.ru' },
      cargoInfo: { description: 'Промышленное насосное оборудование', places: 16, packaging: 'ящики' },
      status: 'calculated',
      source: 'manual',
      originCity: 'Гуанчжоу',
      originCountry: 'Китай',
      destinationCity: 'Санкт-Петербург',
      destinationCountry: 'Россия',
      transportType: 'multimodal',
      readyDate: new Date('2026-11-01'),
      weightKg: 5200,
      volumeM3: 28.0,
      placesCount: 16,
      assignedToId: 'emp_master_1',
      createdAt: new Date('2026-10-22'),
      updatedAt: new Date('2026-10-24'),
    },
    {
      id: 'lead_2',
      customerId: null,
      rawContact: { name: 'Константин (ВЭД)', phone: '+79003332211', email: 'ved@promimport.ru' },
      cargoInfo: { description: 'Текстильные изделия и фурнитура' },
      status: 'new',
      source: 'manual',
      originCity: 'Нинбо',
      originCountry: 'Китай',
      destinationCity: 'Москва',
      destinationCountry: 'Россия',
      transportType: 'sea',
      weightKg: 1200,
      volumeM3: 6.2,
      placesCount: 40,
      assignedToId: 'emp_manager_1',
      createdAt: new Date('2026-10-25'),
      updatedAt: new Date('2026-10-25'),
    },
  ])

  // 9. Quote Options
  tables.quoteoption = new MockTable('QuoteOption', [
    {
      id: 'opt_1',
      leadId: 'lead_1',
      description: 'Морская линия + ЖД ускоренный контейнерный поезд',
      transportModes: ['sea', 'rail'],
      price: 680000,
      currency: 'RUB',
      vatMode: 'WITHOUT_VAT',
      costEstimate: 590000,
      costCurrency: 'RUB',
      etaDays: 32,
      priorityFit: 'cost',
      isSelected: true,
      createdAt: new Date('2026-10-23'),
    },
  ])

  // 10. Contractor
  tables.contractor = new MockTable('Contractor', [
    {
      id: 'contr_1',
      companyName: 'ООО «ТрансАвто-Восток»',
      phone: '+79008887766',
      password: hashPassword('contractor-pass'),
      competencies: { types: ['auto', 'rail'], directions: ['Китай', 'Россия', 'Казахстан'] },
      contactInfo: { contactPerson: 'Сергей Николаевич', email: 'dispatch@transavto-vostok.ru' },
      contractNumber: '0105/1-СВ',
      contractSignedAt: new Date('2026-02-01'),
      isActive: true,
      createdAt: new Date('2026-02-01'),
    },
  ])

  // 11. Contractor Lead
  tables.contractorlead = new MockTable('ContractorLead', [
    {
      id: 'cl_1',
      companyName: 'ООО «Логистик Экспресс»',
      rawInfo: { contact: '+7 (911) 222-33-44', types: ['auto'], fleet: '15 еврофур' },
      status: 'qualifying',
      createdAt: new Date('2026-10-20'),
      updatedAt: new Date('2026-10-22'),
    },
  ])

  // 12. Broker
  tables.broker = new MockTable('Broker', [
    {
      id: 'brk_1',
      companyName: 'ООО «Таможенный Альянс»',
      phone: '+79009998877',
      password: hashPassword('broker-pass'),
      isInHouse: false,
      isActive: true,
      contactInfo: { contactPerson: 'Марина Орлова', email: 'customs@alliance-broker.ru' },
      createdAt: new Date('2026-02-10'),
    },
  ])

  // 13. Activities
  tables.activity = new MockTable('Activity', [
    {
      id: 'act_1',
      orderId: 'ord_1',
      actorName: 'Иван Менеджеров',
      type: 'stage_done',
      description: 'Завершен этап «Погрузка на транспорт»',
      isInternal: false,
      createdAt: new Date('2026-10-18T14:30:00Z'),
    },
    {
      id: 'act_2',
      leadId: 'lead_1',
      actorName: 'Мастер Logix',
      type: 'option_created',
      description: 'Добавлен вариант расчёта № 1 (680 000 ₽)',
      isInternal: false,
      createdAt: new Date('2026-10-23T11:15:00Z'),
    },
    {
      id: 'act_3',
      orderId: 'ord_1',
      actorName: 'Иван Менеджеров',
      type: 'contractor_assigned',
      description: 'На этап «Международная перевозка» назначен подрядчик ООО «ТрансАвто-Восток»',
      isInternal: true,
      createdAt: new Date('2026-10-19T09:00:00Z'),
    },
  ])

  // 14. Document
  tables.document = new MockTable('Document', [
    {
      id: 'doc_1',
      orderId: 'ord_1',
      leadId: null,
      type: 'accompanying',
      title: 'Упаковочный лист (Packing List)',
      isInternal: false,
      currentVersion: 1,
      createdAt: new Date('2026-10-13'),
      updatedAt: new Date('2026-10-13'),
    },
  ])

  // 15. Empty tables
  tables.employeesession = new MockTable('EmployeeSession')
  tables.clientsession = new MockTable('ClientSession')
  tables.contractorsession = new MockTable('ContractorSession')
  tables.brokersession = new MockTable('BrokerSession')
  tables.leadbroker = new MockTable('LeadBroker')
  tables.orderbroker = new MockTable('OrderBroker')
  tables.brokerestimate = new MockTable('BrokerEstimate')
  tables.documentversion = new MockTable('DocumentVersion')
  tables.loginattempt = new MockTable('LoginAttempt')
}

// Ensure seeded on first load
seedMockDatabase()

// Build proxy db object
export function createMockDb(): any {
  return new Proxy(
    {
      $transaction: async (arg: any) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg)
        }
        if (typeof arg === 'function') {
          const snapshot = new Map<string, Map<string, RecordItem>>()
          for (const [tblName, tbl] of Object.entries(tables)) {
            snapshot.set(tblName, new Map(tbl.records))
          }
          try {
            return await arg(createMockDb())
          } catch (err) {
            for (const [tblName, savedRecords] of snapshot.entries()) {
              tables[tblName].records = new Map(savedRecords)
            }
            throw err
          }
        }
        return arg
      },
      $queryRaw: async () => [{ 1: 1 }],
      $executeRaw: async () => 0,
      $disconnect: async () => {},
    },
    {
      get: (target: any, prop: string | symbol) => {
        if (typeof prop !== 'string') return target[prop]
        if (prop in target) return target[prop]
        return getTable(prop)
      },
    }
  )
}
