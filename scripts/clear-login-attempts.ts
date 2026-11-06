import { db } from '../src/lib/db'

// Очистка блокировок входа между прогонами e2e (шапка e2e_api_test.py:
// «Перед повторным прогоном: DELETE FROM "LoginAttempt"»). Запуск:
//   DATABASE_URL=... bunx tsx scripts/clear-login-attempts.ts
async function main() {
  const n = await db.loginAttempt.deleteMany({})
  console.log('LoginAttempt cleared:', n.count)
  await db.$disconnect()
}
void main()
