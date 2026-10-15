#!/usr/bin/env bash
# Проверка хотфикса «500 на /admin/leads» на изолированной станции :
# 3200. Станция = копия проекта с фиксом + БД в состоянии «Б-эра»
# (без таблиц Lead/QuoteOption — имитация Neon пользователя, куда
# не доехал db push В-эры).
# Ожидания:
#   1) GET /api/admin/leads → 500, но тело — JSON с понятной ошибкой
#      («не хватает таблиц… bunx prisma db push»), НЕ пустой 500;
#   2) GET /api/admin/orders → 200 (Б-эра таблицы на месте);
#   3) логин → 200.
# Паттерн изоляции — как .zscripts/run-smoke.sh v3.1 (свой каталог,
# свой порт, своя БД, ЯВНЫЙ DATABASE_URL потомку, гашение по группе).
set -u
cd /home/z/my-project

PORT=3200
APP=.staging/hotfix-app
LOG=.staging/hotfix-dev.log
ROOT=/home/z/my-project

# 1) Копия проекта (свежий код с фиксом)
mkdir -p "$APP"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude db \
  --exclude .staging --exclude .env --exclude '*.log' \
  --exclude download --exclude upload --exclude skills --exclude .zscripts \
  --exclude tool-results \
  ./ "$APP/"
[ -e "$APP/node_modules" ] || ln -s "$ROOT/node_modules" "$APP/node_modules"

# 2) БД «Б-эры»: свежая копия минус таблицы воронки
mkdir -p "$APP/db"
cp db/custom.db "$APP/db/custom.db"
python3 - "$APP/db/custom.db" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
for t in ("Lead", "QuoteOption"):
    con.execute(f'DROP TABLE IF EXISTS "{t}"')
con.commit(); con.close()
print("[hotfix] БД станции: без Lead/QuoteOption (имитация Neon Б-эры)")
PY
printf 'DATABASE_URL=file:%s/db/custom.db\n' "$ROOT/$APP" > "$APP/.env"

# 3) Старт (двойной fork НЕ нужен: станция живёт под trap-cleanup)
( cd "$APP" && setsid env PORT="$PORT" \
    DATABASE_URL="file:$ROOT/$APP/db/custom.db" \
    bun run dev > "$ROOT/$LOG" 2>&1 < /dev/null ) &
PID=$!

cleanup() {
  kill -- "-$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    OPID=$(ss -tlnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
    [ -z "$OPID" ] && break
    kill "$OPID" 2>/dev/null || true
    kill -9 "$OPID" 2>/dev/null || true
    sleep 1
  done
}
trap cleanup EXIT INT TERM

ok=0
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://localhost:$PORT/" 2>/dev/null)
  [ "$code" = "200" ] && { ok=1; echo "[hotfix] станция :$PORT поднялась (попытка $i)"; break; }
  sleep 3
done
[ "$ok" = "1" ] || { echo "[hotfix] СТАНЦИЯ НЕ ПОДНЯЛАСЬ:"; tail -15 "$LOG"; exit 2; }

J=/tmp/hotfix-jar.txt; rm -f "$J"
B="http://localhost:$PORT"

# ── 1. Логин ──
login_code=$(curl -s -c "$J" -o /tmp/hotfix-login.json -w '%{http_code}' \
  -X POST "$B/api/auth/employee/login" -H 'Content-Type: application/json' \
  -d '{"phone":"+79000000000","password":"logix-master"}')
echo "[hotfix] login: $login_code"

# ── 2. Лиды на изуродованной БД: ждём 500 + JSON-подсказку ──
leads_code=$(curl -s -b "$J" -o /tmp/hotfix-leads.json -w '%{http_code}' "$B/api/admin/leads")
echo "[hotfix] GET /api/admin/leads: $leads_code"
echo "--- тело ответа: ---"
head -c 500 /tmp/hotfix-leads.json; echo; echo "-------------------"

fail=0
if [ "$leads_code" != "500" ]; then
  echo "[FAIL] ожидался 500, получен $leads_code"; fail=1
fi
if ! grep -q "prisma db push" /tmp/hotfix-leads.json; then
  echo "[FAIL] в теле нет подсказки про db push"; fail=1
fi
if ! python3 -c "import json;json.load(open('/tmp/hotfix-leads.json'))" 2>/dev/null; then
  echo "[FAIL] тело ответа — не JSON"; fail=1
fi

# ── 3. Заявки на той же БД: Б-эра жива, должно быть 200 ──
orders_code=$(curl -s -b "$J" -o /dev/null -w '%{http_code}' "$B/api/admin/orders")
echo "[hotfix] GET /api/admin/orders: $orders_code (ожидание 200)"
[ "$orders_code" = "200" ] || { echo "[FAIL] заявки сломались на БД Б-эры"; fail=1; }

if [ "$fail" = "0" ]; then
  echo "[hotfix] ИТОГ: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ"
else
  echo "[hotfix] ИТОГ: ЕСТЬ ПРОВАЛЫ"; tail -30 "$LOG"
fi
exit $fail
