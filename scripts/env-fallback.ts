// Общий мини-загрузчик .env для скриптов (без зависимости от dotenv):
// Prisma Client сам грузит .env, но при запуске через tsx без переменных
// окружения этот фолбэк гарантирует, что DATABASE_URL найдётся.
// Вынесено из seed.ts (DF-17C: import-hs.ts переиспользует тот же
// механизм — одно место знания, reuse-first 2.13).
import { readFileSync } from 'fs'
import { join } from 'path'

export function loadEnvFallback(): void {
  for (const candidate of [join(process.cwd(), '.env'), join(process.cwd(), 'prisma', '.env')]) {
    try {
      const text = readFileSync(candidate, 'utf-8')
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
      }
    } catch {
      /* файла нет — пропускаем */
    }
  }
}

// Мини-загрузчик прочитан side-effect-импортом (`import './env-fallback'`):
// оба потребителя (seed.ts, import-hs.ts) используют его именно так.
loadEnvFallback()
