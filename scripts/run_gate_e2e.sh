#!/usr/bin/env bash
# run_gate_e2e.sh — прогон гейта 1 в одном вызове (процессы песочницы
# перезапускаются между сообщениями): PostgreSQL 16.4 (provision_pg.sh),
# миграции при пустой базе, dev-сервер, очистка LoginAttempt, e2e.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL='postgresql://logix@127.0.0.1:5432/logix?schema=public'
export TOTP_ENCRYPTION_KEY="${TOTP_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
export CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 16)}"

# 1) PostgreSQL (идемпотентно)
if ! .pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1; then
  bash .pg/pg_with.sh .pg/bin/pg_ctl -D .pg/data -l .pg/postgres.log \
    -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start >/dev/null 2>&1
  sleep 2
fi
.pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1 || { echo "FAIL: PG не поднялся"; exit 1; }

# 2) Миграции + сид (идемпотентно: миграции applied; сид актуализирует)
bunx prisma migrate deploy >/dev/null 2>&1
bunx tsx scripts/seed.ts --dev >/dev/null 2>&1

# 3) Dev-сервер (если не отвечает)
if ! curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
  nohup env DATABASE_URL="$DATABASE_URL" TOTP_ENCRYPTION_KEY="$TOTP_ENCRYPTION_KEY" CRON_SECRET="$CRON_SECRET" bun run dev > /tmp/next-dev.log 2>&1 &
  for i in $(seq 1 60); do
    sleep 2
    curl -sf http://localhost:3000/api/health >/dev/null 2>&1 && break
  done
fi
curl -sf http://localhost:3000/api/health >/dev/null 2>&1 || { echo "FAIL: dev не поднялся"; tail -5 /tmp/next-dev.log; exit 1; }

# 4) Очистка блокировок входа от прошлого прогона
bunx tsx scripts/clear-login-attempts.ts 2>&1 | tail -1

# 5) e2e
BASE_URL=http://localhost:3000 ADMIN_PHONE=+79000000000 ADMIN_PASSWORD=logix-master \
  python3 scripts/e2e_api_test.py > /tmp/e2e-run.log 2>&1
echo "e2e exit=$?"
echo "PASS=$(grep -c '^PASS' /tmp/e2e-run.log) FAIL=$(grep -c '^FAIL' /tmp/e2e-run.log)"
echo "--- FAIL list ---"
grep '^FAIL' /tmp/e2e-run.log || true
echo "--- DF-26 checks ---"
grep 'DF-26' /tmp/e2e-run.log || true
