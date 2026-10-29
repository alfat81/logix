#!/bin/bash
# Браузерная приёмка P1-22 (v0.5.0): справочники §4.2–4.3 + резанные секции
# Сервер живёт только внутри этого вызова — всё в одном прогоне.
set -u
cd /home/z/my-project/logix

pkill -9 -f next-server 2>/dev/null; sleep 1
DATABASE_URL="postgresql://logix@127.0.0.1:5432/logix" bun run start > /home/z/my-project/next-browser.log 2>&1 &
SRV=$!
for i in $(seq 1 15); do curl -s --max-time 2 http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 2; done
echo "HEALTH: $(curl -s http://127.0.0.1:3000/api/health)"

AB="agent-browser"
$AB set viewport 1440 900

# ── Логин мастера ─────────────────────────────────────────────────────
$AB open http://127.0.0.1:3000/admin >/dev/null
$AB wait --load networkidle >/dev/null
$AB snapshot -i > /tmp/snap_login.txt 2>&1
PHONE_REF="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'телефон' /tmp/snap_login.txt) | head -1 | cut -d= -f2)"
PASS_REF="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'пароль' /tmp/snap_login.txt) | head -1 | cut -d= -f2)"
BTN_REF="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'войти' /tmp/snap_login.txt) | head -1 | cut -d= -f2)"
echo "LOGIN REFS: phone=$PHONE_REF pass=$PASS_REF btn=$BTN_REF"
$AB fill "$PHONE_REF" "+79000000000"
$AB fill "$PASS_REF" "logix-master"
$AB click "$BTN_REF"
$AB wait --load networkidle >/dev/null
sleep 1
echo "URL after login: $($AB get url)"

# ── Проверка экрана: заголовок h1 + отсутствие горизонтального скролла ─
check_page() {
  local url="$1" name="$2"
  $AB open "$url" >/dev/null
  $AB wait --load networkidle >/dev/null
  sleep 0.6
  local h1 overflow
  h1=$($AB eval "document.querySelector('h1')?.textContent?.trim() || '(нет h1)'" 2>/dev/null)
  overflow=$($AB eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null)
  echo "[$name] url=$url h1=$h1 overflowPx=$overflow"
}

check_page "http://127.0.0.1:3000/admin" "главная-1440"
check_page "http://127.0.0.1:3000/admin/brokers" "брокеры-1440"
check_page "http://127.0.0.1:3000/admin/employees" "сотрудники-1440"
check_page "http://127.0.0.1:3000/admin/legal-entities" "юрлица-1440"
check_page "http://127.0.0.1:3000/admin/contractors" "подрядчики-1440"
check_page "http://127.0.0.1:3000/admin/stage-catalog" "этапы-1440"
check_page "http://127.0.0.1:3000/admin/orders/cmvni44i6001yqdpw5zvn5ae2" "заявка-1440"
check_page "http://127.0.0.1:3000/admin/orders/cmvni44i6001yqdpw5zvn5ae2/print" "печать-1440"

# ── Табы брокеров: клик по «Деактивированные» ─────────────────────────
$AB open http://127.0.0.1:3000/admin/brokers >/dev/null
$AB wait --load networkidle >/dev/null
$AB snapshot -i -c > /tmp/snap_brokers.txt 2>&1
TAB_REF="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'Деактивированные' /tmp/snap_brokers.txt) | head -1 | cut -d= -f2)"
if [ -n "$TAB_REF" ]; then
  $AB click "$TAB_REF" >/dev/null; sleep 0.8
  echo "[брокеры: таб Деактивированные] h1=$($AB eval "document.querySelector('h1')?.textContent" 2>/dev/null)"
else
  echo "[брокеры: таб Деактивированные НЕ НАЙДЕН]"
fi

# ── Поиск сотрудников (Ж4) ────────────────────────────────────────────
$AB open http://127.0.0.1:3000/admin/employees >/dev/null
$AB wait --load networkidle >/dev/null
$AB snapshot -i -c > /tmp/snap_emp.txt 2>&1
SRCH_REF="@$(grep -oE 'ref=e[0-9]+' <(grep -iE 'поиск|search' /tmp/snap_emp.txt) | head -1 | cut -d= -f2)"
if [ -n "$SRCH_REF" ]; then
  $AB fill "$SRCH_REF" "мастер" >/dev/null; sleep 1
  CARDS=$($AB get count "main a[href*='/admin/employees/']" 2>/dev/null)
  echo "[сотрудники: поиск «мастер»] карточек=$CARDS"
else
  echo "[сотрудники: поиск НЕ НАЙДЕН]"
fi

# ── 375: переполнения ─────────────────────────────────────────────────
$AB set viewport 375 720
for u in admin admin/brokers admin/employees admin/legal-entities admin/contractors "admin/orders/cmvni44i6001yqdpw5zvn5ae2" "admin/orders/cmvni44i6001yqdpw5zvn5ae2/print"; do
  $AB open "http://127.0.0.1:3000/$u" >/dev/null
  $AB wait --load networkidle >/dev/null; sleep 0.5
  OVF=$($AB eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null)
  echo "[375] /$u overflowPx=$OVF"
done

# ── Консоль и ошибки ──────────────────────────────────────────────────
echo "=== CONSOLE (последние 10) ==="
$AB console 2>/dev/null | tail -10
echo "=== PAGE ERRORS ==="
$AB errors 2>/dev/null | tail -10

kill $SRV 2>/dev/null; pkill -9 -f next-server 2>/dev/null
$AB close >/dev/null 2>&1
echo "DONE"
