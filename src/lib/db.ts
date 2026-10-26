/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client'
import { createMockDb } from './mock-db'

const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined
}

function isDummyUrl(url?: string): boolean {
  if (!url || url.trim() === '') return true
  if (url.includes('@host/') || url.includes('user:password@') || url.includes('localhost')) {
    return true
  }
  return false
}

function initDb(): any {
  const databaseUrl = process.env.DATABASE_URL
  if (isDummyUrl(databaseUrl)) {
    console.warn('[AI Studio] DATABASE_URL is placeholder or not set — using in-memory database mock')
    return createMockDb()
  }

  try {
    const client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
    console.log('[db] PrismaClient initialized with DATABASE_URL')
    const mock = createMockDb()
    // Proxy client so that if connection to real DB fails at runtime, fallback to mock seamlessly
    return new Proxy(client, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver)
        if (typeof orig === 'function') {
          return async (...args: any[]) => {
            try {
              return await orig.apply(target, args)
            } catch (err: any) {
              if (
                err?.name === 'PrismaClientInitializationError' ||
                err?.message?.includes('Can\'t reach database server') ||
                err?.code === 'P1001'
              ) {
                console.warn(`[AI Studio] DB connection failed for ${String(prop)}, falling back to mock:`, err.message)
                return (mock as any)[prop]?.(...args)
              }
              throw err
            }
          }
        }
        if (orig === undefined) {
          return (mock as any)[prop]
        }
        return orig
      },
    })
  } catch (err) {
    console.warn('[AI Studio] Database connection error — falling back to mock:', err)
    return createMockDb()
  }
}

export const db: PrismaClient = globalForPrisma.prisma ?? initDb()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

