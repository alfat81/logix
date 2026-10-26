import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password'
import { db } from './db'

describe('Password Verification (DF-00)', () => {
  it('hashes and verifies password correctly', () => {
    const plain = 'superSecret123!'
    const hashed = hashPassword(plain)
    expect(hashed.startsWith('scrypt:')).toBe(true)
    expect(verifyPassword(plain, hashed)).toBe(true)
    expect(verifyPassword('wrongPassword', hashed)).toBe(false)
  })

  it('rejects plaintext password without scrypt prefix', () => {
    const plain = 'unhashed_password'
    // Prior to DF-00, verifyPassword would accept plaintext as fallback.
    // Now it must strictly return false.
    expect(verifyPassword(plain, plain)).toBe(false)
    expect(verifyPassword('admin123', 'admin123')).toBe(false)
  })

  it('checks for un-prefixed passwords in database', async () => {
    const [employees, customers, contractors, brokers] = await Promise.all([
      db.employee.findMany({ select: { id: true, password: true } }),
      db.customer.findMany({ select: { id: true, password: true } }),
      db.contractor.findMany({ select: { id: true, password: true } }),
      db.broker.findMany({ select: { id: true, password: true } }),
    ])

    const unPrefixedCount = [
      ...employees.filter((e) => e.password && !e.password.startsWith('scrypt:')),
      ...customers.filter((c) => c.password && !c.password.startsWith('scrypt:')),
      ...contractors.filter((c) => c.password && !c.password.startsWith('scrypt:')),
      ...brokers.filter((b) => b.password && !b.password.startsWith('scrypt:')),
    ].length

    // All seeded users must have scrypt: hashes
    expect(unPrefixedCount).toBe(0)
  })
})
