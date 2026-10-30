// Создание базы logix (из-под базы postgres, trust-авторизация):
// bun scripts/pg_client/createdb.mjs
import { Client } from 'pg'

const c = new Client({ connectionString: 'postgresql://logix@127.0.0.1:5432/postgres' })
await c.connect()
const r = await c.query("SELECT 1 FROM pg_database WHERE datname = 'logix'")
if (r.rowCount === 0) {
  await c.query('CREATE DATABASE logix')
  console.log('created logix')
} else {
  console.log('logix exists')
}
await c.end()
