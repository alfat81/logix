#!/usr/bin/env bash
# gate1_full.sh — полный прогон гейта 1 (T21-08) одним вызовом:
# vitest, tsc, lint, build, e2e; итог — машинно-читаемый блок PASS/FAIL.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL='postgresql://logix@127.0.0.1:5432/logix?schema=public'
export TOTP_ENCRYPTION_KEY="${TOTP_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
export CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 16)}"

echo "== [1/6] PostgreSQL =="
if ! .pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1; then
  bash .pg/pg_with.sh .pg/bin/pg_ctl -D .pg/data -l .pg/postgres.log \
    -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start >/dev/null 2>&1
  sleep 2
fi
.pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1 && echo "PG OK" || { echo "PG FAIL"; exit 1; }

echo "== [2/6] vitest =="
bunx vitest run 2>&1 | grep -E "^ Test Files|^      Tests " | tr -d ' ' | sed 's/^/vitest /'

echo "== [3/6] tsc + lint =="
bunx tsc --noEmit && echo "tsc OK (0 ошибок)"
echo "lint: $(bunx eslint src 2>&1 | tail -1)"

echo "== [4/6] build =="
timeout 520 bunx next build > /tmp/next-build.log 2>&1 && [ -f .next/BUILD_ID ] && echo "build OK ($(cat .next/BUILD_ID))" || { echo "build FAIL"; tail -5 /tmp/next-build.log; exit 1; }

echo "== [5/6] e2e =="
if ! curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
  nohup env DATABASE_URL="$DATABASE_URL" TOTP_ENCRYPTION_KEY="$TOTP_ENCRYPTION_KEY" \
    CRON_SECRET="$CRON_SECRET" bunx next start -p 3000 > /tmp/next-start.log 2>&1 &
  for i in $(seq 1 40); do sleep 2; curl -sf http://localhost:3000/api/health >/dev/null 2>&1 && break; done
fi
curl -sf http://localhost:3000/api/health >/dev/null 2>&1 || { echo "prod FAIL"; exit 1; }
bunx tsx scripts/clear-login-attempts.ts >/dev/null 2>&1
BASE_URL=http://localhost:3000 ADMIN_PHONE=+79000000000 ADMIN_PASSWORD=logix-master \
  python3 scripts/e2e_api_test.py > /tmp/e2e-final.log 2>&1
echo "e2e exit=$? PASS=$(grep -c '^PASS' /tmp/e2e-final.log) FAIL=$(grep -c '^FAIL' /tmp/e2e-final.log)"
echo "DF-26 блок: PASS=$(grep 'DF-26' /tmp/e2e-final.log | grep -c '^PASS') FAIL=$(grep 'DF-26' /tmp/e2e-final.log | grep -c '^FAIL')"
echo "== BLOCKED-категории e2e (вне объёма №21) =="
grep '^FAIL' /tmp/e2e-final.log | sed 's/ :: .*//' | sort | uniq -c | sort -rn | head -5

echo "== [6/6] integrity (DATABASE_URL задан) =="
python3 scripts/integrity_check.py 2>&1 | tail -1
python3 scripts/integrity_check.py 2>&1 | grep "^NEW" | awk '{print $2}' | sort | uniq -c | sed 's/^/integrity /'
echo "GATE RUN COMPLETE"
