// Проверка доступности PostgreSQL: bun scripts/pg_client/check.mjs [url]
// Печатает OK и код 0, если подключение и SELECT 1 прошли.
// Клиентская зависимость pg установлена в /tmp/pgclient (ВНЕ проекта —
// зависимости проекта заморожены гейтами).
import { Client } from 'pg'

const url = process.argv[2] ?? 'postgresql://logix@127.0.0.1:5432/logix'
const c = new Client({ connectionString: url, connectionTimeoutMillis: 1500 })
try {
  await c.connect()
  await c.query('select 1')
  console.log('OK')
  process.exit(0)
} catch (e) {
  console.error('ERR', e.message)
  process.exit(1)
} finally {
  await c.end().catch(() => {})
}
