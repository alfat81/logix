import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// DF-00: единственный источник данных — PostgreSQL через DATABASE_URL.
// v0.5.4: удалена мок-ветка шаблона AI Studio. Хроника дефекта: isDummyUrl()
// считал «фиктивной» любую строку с localhost — CI-раннер (DATABASE_URL
// вида postgresql://logix:logix@localhost:5432/logix) получал пустой
// in-memory мок вместо реальной БД: сид писал учётку в PostgreSQL,
// сервер искал её в моке → каскад 401 в e2e job'е (прогоны #27-#29).
// Вторая мок-ветка — Proxy-фолбэк на createMockDb при P1001 — в бою
// молча подменяла реальные данные при недоступности БД. Обе ветки
// маскировали конфигурационные ошибки — против принципа З1 (fail fast).
function initDb(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL не задан: укажите строку подключения PostgreSQL (см. .env.example)',
    )
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const db: PrismaClient = globalForPrisma.prisma ?? initDb()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
