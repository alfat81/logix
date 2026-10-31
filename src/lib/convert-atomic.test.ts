import { describe, it, expect } from 'vitest'
import { db } from './db'
import { createOrderWithStages } from './orders'
import { carryBrokersToOrder } from '@/app/api/admin/leads/[id]/convert/helpers'
import { carryDocumentsToOrder } from './documents'

describe('Atomic Lead Conversion Transaction (DF-00 / P1-10)', () => {
  it('rolls back all operations if an error occurs inside transaction', async () => {
    const customer = await db.customer.create({
      data: { name: 'Тестовый Клиент Транзакции', phone: '+79998887766' },
    })
    const legal = await db.legalEntity.findFirst()
    expect(legal).toBeDefined()

    const initialOrderCount = (await db.order.findMany()).length

    // Attempt a transaction where step 1 creates order, but step 2 fails
    let caughtError = false
    try {
      await db.$transaction(async (tx) => {
        const orderRes = await createOrderWithStages(
          {
            customerId: customer.id,
            legalEntityId: legal!.id,
          },
          tx
        )
        expect('id' in orderRes).toBe(true)

        // Intentionally throw inside transaction
        throw new Error('Simulated failure during conversion')
      })
    } catch {
      caughtError = true
    }

    expect(caughtError).toBe(true)
    const finalOrderCount = (await db.order.findMany()).length
    expect(finalOrderCount).toBe(initialOrderCount)
  })

  it('passes transaction client to helper functions', async () => {
    await db.$transaction(async (tx) => {
      // All helpers must accept tx without throwing
      const carriedBrokers = await carryBrokersToOrder('nonexistent-lead', 'nonexistent-order', tx)
      expect(carriedBrokers).toBe(0)

      const carriedDocs = await carryDocumentsToOrder('nonexistent-lead', 'nonexistent-order', tx)
      expect(carriedDocs).toBe(0)
    })
  })

  // DF-23 (а): маппинг конверсии — условие поставки (код + место)
  // доезжает до заявки. Раньше CreateOrderInput поля incotermPlace не
  // имел: колонка заявки всегда была пустой при заполненном запросе.
  it('carries incotermCode and incotermPlace into the order (DF-23)', async () => {
    const customer = await db.customer.create({
      data: { name: 'Тестовый Клиент DF-23', phone: '+79995556677' },
    })
    const legal = await db.legalEntity.findFirst()
    expect(legal).toBeDefined()

    const res = await db.$transaction(async (tx) =>
      createOrderWithStages(
        {
          customerId: customer.id,
          legalEntityId: legal!.id,
          incoterm: 'CIF',
          incotermCode: 'CIF',
          incotermPlace: 'Истанбул, TR',
          hsCode: '8483402309',
          route: {
            originCity: 'Гуанчжоу',
            originCountry: 'Китай',
            destinationCity: 'Москва',
            destinationCountry: 'Россия',
            transportType: 'sea',
            weightKg: 2500,
            volumeM3: 12.5,
            placesCount: 40,
            originCountryCode: 'CN',
            destinationCountryCode: 'RU',
          },
        },
        tx
      )
    )
    expect('error' in res).toBe(false)

    const order = await db.order.findUnique({
      where: { id: (res as { id: string }).id },
      select: {
        incoterm: true,
        incotermCode: true,
        incotermPlace: true,
        hsCode: true,
        originCity: true,
        originCountryCode: true,
        destinationCity: true,
        destinationCountryCode: true,
        transportType: true,
        weightKg: true,
        volumeM3: true,
        placesCount: true,
      },
    })
    expect(order).toMatchObject({
      incoterm: 'CIF',
      incotermCode: 'CIF',
      incotermPlace: 'Истанбул, TR',
      hsCode: '8483402309',
      originCity: 'Гуанчжоу',
      originCountryCode: 'CN',
      destinationCity: 'Москва',
      destinationCountryCode: 'RU',
      transportType: 'sea',
      placesCount: 40,
    })
    expect(Number(order?.weightKg)).toBe(2500)
    expect(Number(order?.volumeM3)).toBe(12.5)

    await db.order.delete({ where: { id: (res as { id: string }).id } })
    // Договор пары клиент+юрлицо рождается конверсией (findOrCreateContract)
    await db.contract.deleteMany({ where: { customerId: customer.id } })
    await db.customer.delete({ where: { id: customer.id } })
  })
})
