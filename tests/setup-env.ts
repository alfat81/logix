/**
 * Setup unit-тестов (vitest setupFiles, v0.5.4).
 *
 * Часть unit-тестов — интеграционные: проверяют транзакцию конвертации
 * и чистоту хешей против РЕАЛЬНОГО PostgreSQL через PrismaClient
 * (src/lib/db.ts). Prisma Client читает process.env.DATABASE_URL напрямую,
 * а vitest не грузит .env — этот setup повторяет мини-загрузчик сид
 * (scripts/seed.ts, loadEnvFallback): только недостающие переменные,
 * значения в кавычках распознаются, ничего не перезаписывает.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const candidate of [join(process.cwd(), '.env'), join(process.cwd(), 'prisma', '.env')]) {
  try {
    const text = readFileSync(candidate, 'utf-8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* файла нет — пропускаем */
  }
}
