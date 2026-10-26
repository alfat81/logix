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
})
