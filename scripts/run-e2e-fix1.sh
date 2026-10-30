#!/bin/bash
# Полный прогон e2e по протоколу ci.yml на чистой БД.
# Один вызов: песочница прибивает посторонние порты между вызовами.
# DATABASE_URL можно переопределить снаружи (песочница держит Postgres
# на нестандартном порту — .env песочницы); дефолт — сервис CI.
set -e
set -o pipefail
cd /home/z/my-project

export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://logix@127.0.0.1:5432/logix?schema=public}"
export MASTER_PHONE="+79000000000"
export MASTER_PASSWORD="ci-e2e-master-password"
export ADMIN_PHONE="+79000000000"
export ADMIN_PASSWORD="ci-e2e-master-password"
export CONTRACTOR_PORTAL_ENABLED=true
export CRON_SECRET=ci-e2e-cron-secret
export EMAIL_PROVIDER=fake
export APP_BASE_URL=http://127.0.0.1:3200
export CBR_IMPORT=off

echo "=== 1/4 reset БД ==="
bunx prisma@6 migrate reset --force 2>&1 | tail -2

echo "=== 2/4 сид ==="
bunx tsx scripts/seed.ts 2>&1 | tail -2

echo "=== 3/4 сервер 3200 ==="
bunx next start -p 3200 > .server-e2e.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3200/api/health > /dev/null; then break; fi
  sleep 1
done
curl -s http://127.0.0.1:3200/api/health | head -c 80; echo

echo "=== 4/4 e2e ==="
export BASE_URL=http://127.0.0.1:3200
set +e
python3 scripts/e2e_api_test.py > /tmp/e2e-full.log 2>&1
RC=$?
rg -c "^PASS" /tmp/e2e-full.log || true
rg -n "^FAIL" /tmp/e2e-full.log | head -30 || true
rg "^TOTAL" /tmp/e2e-full.log || true
kill $SRV 2>/dev/null || true
echo "E2E_EXIT=$RC"
exit $RC
