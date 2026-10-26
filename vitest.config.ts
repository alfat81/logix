import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit-тесты (P1-05) — чистые модули src/lib без БД. Алиас '@/…' —
// тот же, что в tsconfig: vitest paths из tsconfig сам не читает.
const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // v0.5.4: .env → process.env до импорта тестов — db.ts без мок-ветки
    // требует валидный DATABASE_URL (правка связана с фикс CI e2e 401)
    setupFiles: ['tests/setup-env.ts'],
  },
})
