#!/usr/bin/env bash
# Эмуляция джобы e2e из .github/workflows/ci.yml на чистом клоне:
# свежая БД (сброс схемы) → migrate deploy → seed → build → сервер → e2e_api_test.py.
# Среда = env джобы ci.yml дословно, БЕЗ .env песочницы (в клоне её нет).
set -uo pipefail
SHA=$1
pkill -f "next[-]server" 2>/dev/null; pkill -f "next start" 2>/dev/null; sleep 1

export DATABASE_URL='postgresql://logix:logix@127.0.0.1:5432/logix?schema=public'
export MASTER_PHONE='+79000000000'
export MASTER_PASSWORD='ci-e2e-master-password'
export ADMIN_PHONE='+79000000000'
export ADMIN_PASSWORD='ci-e2e-master-password'
export BASE_URL='http://localhost:3000'
export CONTRACTOR_PORTAL_ENABLED='false'
export CRON_SECRET='ci-e2e-cron-secret'
export EMAIL_PROVIDER='fake'
export APP_BASE_URL='http://localhost:3000'
export TOTP_ENCRYPTION_KEY='ci-e2e-totp-encryption-key'
export STORAGE_ALLOW_LOCAL='1'
export CBR_IMPORT='off'

echo "== сброс схемы БД (эквивалент свежего postgres-сервиса раннера; psql в песочнице нет — через Prisma) =="
rm -rf /tmp/ci-e2e && git clone -q "${LOGIX_SRC:-/home/z/my-project}" /tmp/ci-e2e && cd /tmp/ci-e2e && git checkout -q $SHA
bun install 2>&1 | tail -1
cat > reset-schema.mjs <<'EOF'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
await db.$executeRawUnsafe('DROP SCHEMA public CASCADE')
await db.$executeRawUnsafe('CREATE SCHEMA public')
console.log('схема public пересоздана')
await db.$disconnect()
EOF
bun reset-schema.mjs && rm reset-schema.mjs
echo "== migrate deploy ==" && bunx prisma migrate deploy 2>&1 | tail -2
echo "== seed ==" && bun run seed 2>&1 | tail -1
echo "== build ==" && bun run build 2>&1 | grep -E "Compiled|error" | head -2 || exit 1
echo "== сервер =="
nohup bun run start > /tmp/ci-e2e-next.log 2>&1 &
for i in $(seq 1 30); do
  curl -sf http://localhost:3000/ > /dev/null && break
  sleep 1
done
curl -sf http://localhost:3000/ > /dev/null && echo "сервер поднялся" || { echo "СЕРВЕР НЕ ПОДНЯЛСЯ"; tail -30 /tmp/ci-e2e-next.log; exit 1; }
echo "== e2e_api_test.py =="
python3 scripts/e2e_api_test.py 2>&1 | grep -E "^FAIL|^TOTAL" | head -10
RC=${PIPESTATUS[0]}
echo "exit=$RC"
if [ "$RC" != "0" ]; then echo "--- хвост next.log ---"; tail -40 /tmp/ci-e2e-next.log; fi
