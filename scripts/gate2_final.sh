#!/usr/bin/env bash
# gate2_final.sh — финальный прогон гейта 2 на HEAD (T22-11/T22-12):
# prod-сборка (next start) + полный e2e с CRON_SECRET, согласованным
# с сервером (иначе 24 cron/почтовых проверки BLOCKED).
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

# 2) Миграции (идемпотентно)
bunx prisma migrate deploy >/dev/null 2>&1

# 3) Prod-сервер (build уже выполнен; если отвечает чужой процесс — пользуем его)
pkill -f "next start" 2>/dev/null; sleep 1
nohup env DATABASE_URL="$DATABASE_URL" TOTP_ENCRYPTION_KEY="$TOTP_ENCRYPTION_KEY" \
  CRON_SECRET="$CRON_SECRET" EMAIL_PROVIDER=fake APP_BASE_URL=http://localhost:3000 \
  bunx next start -p 3000 > /tmp/next-start-final.log 2>&1 &
for i in $(seq 1 40); do
  sleep 2
  curl -sf http://localhost:3000/api/health >/dev/null 2>&1 && break
done
curl -sf http://localhost:3000/api/health >/dev/null 2>&1 || { echo "FAIL: prod server"; tail -5 /tmp/next-start-final.log; exit 1; }
echo "SERVER OK $(date -u +%H:%M:%S)"

# 4) Очистка блокировок входа
bunx tsx scripts/clear-login-attempts.ts 2>&1 | tail -1

# 5) Полный e2e с согласованным CRON_SECRET
PYTHONUNBUFFERED=1 BASE_URL=http://localhost:3000 ADMIN_PHONE=+79000000000 ADMIN_PASSWORD=logix-master \
  CRON_SECRET="$CRON_SECRET" python3 scripts/e2e_api_test.py > /tmp/e2e-final.log 2>&1
echo "e2e exit=$? $(date -u +%H:%M:%S)"
echo "PASS=$(grep -c '^PASS' /tmp/e2e-final.log) FAIL=$(grep -c '^FAIL' /tmp/e2e-final.log) BLOCKED=$(grep -c '^BLOCKED' /tmp/e2e-final.log)"
grep -E "^(FAIL|BLOCKED)" /tmp/e2e-final.log | sed 's/\(.\{160\}\).*/\1/' | head -30
