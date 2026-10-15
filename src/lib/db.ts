import { PrismaClient } from '@prisma/client'

// Единственный провайдер с первого дня — Postgres (Neon). В APEX Moto
// здесь годами жили мёртвые ветки под libSQL/SQLite, которые никогда не
// исполнялись в проде, но усложняли файл и держали лишние зависимости.
// Здесь это решено один раз правильно (А2 в LOGISTICS-TASK-QUEUE.md).

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[db] FATAL: DATABASE_URL не задан в окружении')
    throw new Error('DATABASE_URL не задан')
  }
  // Логируем только факт наличия, НИКОГДА не содержимое строки —
  // см. историю /api/debug-env в APEX Moto: утечка DATABASE_URL в ответ
  // API началась именно с привычки логировать "для отладки".
  console.log('[db] init, DATABASE_URL: SET')
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
