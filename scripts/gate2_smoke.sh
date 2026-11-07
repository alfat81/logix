#!/usr/bin/env bash
# gate2_smoke.sh — смоук гейта 2 (T22-11): реестр с требованиями «На
# проверке», кнопки «Принять/Отклонить» (десктоп 1440 и мобильный 375,
# Р-2/D58), строки проверок ТН ВЭД в фазе 07. Процессы песочницы не
# живут между сообщениями — сервер/БД поднимаются здесь же.
set -uo pipefail
cd /home/z/my-project
export DATABASE_URL='postgresql://logix@127.0.0.1:5432/logix?schema=public'
export TOTP_ENCRYPTION_KEY="${TOTP_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
export CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 16)}"

if ! .pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1; then
  bash .pg/pg_with.sh .pg/bin/pg_ctl -D .pg/data -l .pg/postgres.log \
    -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start >/dev/null 2>&1
  sleep 2
fi
.pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1 || { echo "FAIL: PG"; exit 1; }

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

# Фикстура: заявка с требованием submitted (scripts/gate2_fixture.py)
FIX=$(python3 scripts/gate2_fixture.py) || { echo "FAIL: fixture"; exit 1; }
echo "FIXTURE: $FIX"
ORDER_ID=$(echo "$FIX" | python3 -c "import json,sys; print(json.load(sys.stdin)['orderId'])")

# Cookie мастера
curl -s -c /tmp/ac.txt -X POST http://localhost:3000/api/auth/employee/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+79000000000","password":"logix-master"}' | head -c 40; echo
TOK=$(grep logix_employee_session /tmp/ac.txt | awk '{print $NF}')
[ -n "$TOK" ] || { echo "FAIL: login"; exit 1; }

# API-смоук пакетного роута: checks и permits в ответе
code=$(curl -s -o /tmp/pkg21.json -w '%{http_code}' -b /tmp/ac.txt "http://localhost:3000/api/admin/orders/$ORDER_ID/package")
echo "smoke api package -> $code"
python3 - "$ORDER_ID" <<'PY'
import json, sys
d = json.load(open('/tmp/pkg21.json'))
permits = d.get('permits') or []
checks = d.get('checks') or []
print('permits:', len(permits), 'checks:', len(checks))
print('submitted row:', [x.get('status') for x in permits if x.get('status') == 'submitted'])
print('warnDaysBefore:', d.get('warnDaysBefore'))
print('summary permitsSubmitted:', (d.get('summary') or {}).get('permitsSubmitted'))
PY

# Скриншоты: десктоп 1440 → мобильный 375 (кнопки ≥44)
mkdir -p download/DF26-WAVE2/gate2
agent-browser cookies clear >/dev/null 2>&1 || true
agent-browser set viewport 1440 900
agent-browser open http://localhost:3000/admin/login >/dev/null 2>&1
agent-browser cookies set logix_employee_session "$TOK" >/dev/null
agent-browser open "http://localhost:3000/admin/orders/$ORDER_ID"
sleep 3
agent-browser find text "Документы" click 2>/dev/null || true
sleep 3
agent-browser wait --load networkidle >/dev/null 2>&1 || true
agent-browser eval "document.body.innerText.includes('Принять') ? 'ACCEPT VISIBLE' : document.body.innerText.slice(0,200)" 2>&1 | head -2
agent-browser screenshot download/DF26-WAVE2/gate2/registry-desktop-1440.png
echo "desktop shot done"

agent-browser set viewport 375 812
sleep 2
agent-browser eval "Array.from(document.querySelectorAll('button')).some(b => b.offsetParent && b.innerText.includes('Принять')) ? 'MOBILE ACCEPT VISIBLE' : 'NO ACCEPT'"
agent-browser screenshot download/DF26-WAVE2/gate2/registry-mobile-375.png
echo "mobile shot done"
