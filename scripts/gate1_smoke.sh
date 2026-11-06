#!/usr/bin/env bash
# gate1_smoke.sh — смоук трёх кабинетов + скриншоты реестра (T21-07)
# одним вызовом: процессы песочницы не живут между сообщениями.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL='postgresql://logix@127.0.0.1:5432/logix?schema=public'
export TOTP_ENCRYPTION_KEY="${TOTP_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
export CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 16)}"

# 1) PostgreSQL
if ! .pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1; then
  bash .pg/pg_with.sh .pg/bin/pg_ctl -D .pg/data -l .pg/postgres.log \
    -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start >/dev/null 2>&1
  sleep 2
fi
.pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1 || { echo "FAIL: PG"; exit 1; }

# 2) Production-сервер (сборка .next уже на месте)
if ! curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
  nohup env DATABASE_URL="$DATABASE_URL" TOTP_ENCRYPTION_KEY="$TOTP_ENCRYPTION_KEY" \
    CRON_SECRET="$CRON_SECRET" bunx next start -p 3000 > /tmp/next-start.log 2>&1 &
  for i in $(seq 1 40); do
    sleep 2
    curl -sf http://localhost:3000/api/health >/dev/null 2>&1 && break
  done
fi
curl -sf http://localhost:3000/api/health >/dev/null 2>&1 || { echo "FAIL: prod server"; tail -5 /tmp/next-start.log; exit 1; }
echo "SERVER OK"

# 3) Cookie сотрудника (мастер)
ORDER_ID="${1:-cmw3bts5y01chq3039co2hs8x}"
curl -s -c /tmp/ac.txt -X POST http://localhost:3000/api/auth/employee/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+79000000000","password":"logix-master"}' | head -c 60; echo
TOK=$(grep logix_employee_session /tmp/ac.txt | awk '{print $NF}')
[ -n "$TOK" ] || { echo "FAIL: login"; exit 1; }

# 4) Смоук трёх кабинетов по API (страницы и package-роуты)
for p in /admin/orders /admin /client/login /broker/login; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/ac.txt "http://localhost:3000$p")
  echo "smoke $p -> $code"
done
for r in "admin/orders/$ORDER_ID/package" "admin/orders/$ORDER_ID/permits"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -b /tmp/ac.txt "http://localhost:3000/api/$r")
  echo "smoke api/$r -> $code"
done

# 5) Скриншоты реестра (agent-browser): десктоп 1440, мобильный 375
mkdir -p download/DF26-WAVE1/gate1
agent-browser cookies clear >/dev/null 2>&1 || true
agent-browser set viewport 1440 900
agent-browser open http://localhost:3000/admin/login >/dev/null 2>&1
agent-browser cookies set logix_employee_session "$TOK" >/dev/null
agent-browser open "http://localhost:3000/admin/orders/$ORDER_ID"
sleep 3
# вкладка «Документы» в правой панели → режим реестра
agent-browser find text "Документы" click 2>/dev/null || agent-browser snapshot -i -c 2>&1 | grep -i "документ" | head -3
sleep 3
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser eval "document.body.innerText.includes('Документы заявки') ? 'REGISTRY OPEN' : document.body.innerText.slice(0,150)" 2>&1 | head -2
agent-browser screenshot download/DF26-WAVE1/gate1/registry-desktop-1440.png
echo "desktop shot done"

agent-browser set viewport 375 812
sleep 2
agent-browser screenshot download/DF26-WAVE1/gate1/registry-mobile-375.png
echo "mobile shot done"
