#!/bin/bash
# Скриншоты приёмки v0.7.11 (DF-16): секции «Разрешительные документы»
# в кабинетах. Сервер живёт только внутри вызова; данные — живые
# фикстуры e2e-прогона (БД logix) + 2 строки на запросе (shot_data.mjs).
set -u
cd /home/z/my-project

export OUT=/home/z/my-project/download/screenshots-v0.7.11
mkdir -p "$OUT"

pkill -9 -f "next-server|next start" 2>/dev/null; sleep 1

# Кластер postgres + DATABASE_URL
bash .pg/pg_with.sh true > /dev/null 2>&1
export DATABASE_URL="postgresql://logix@127.0.0.1:5432/logix?schema=public"
export MASTER_PHONE="+79000000000" MASTER_PASSWORD="ci-e2e-master-password"
export ADMIN_PHONE="+79000000000" ADMIN_PASSWORD="ci-e2e-master-password"
export CRON_SECRET=x EMAIL_PROVIDER=fake APP_BASE_URL=http://127.0.0.1:3200 CBR_IMPORT=off
export PORT=3200 HOSTNAME=127.0.0.1

bunx next start -p 3200 > .server-shots.log 2>&1 &
SRV=$!
for i in $(seq 1 30); do curl -sf http://127.0.0.1:3200/api/health > /dev/null && break; sleep 1; done
echo "HEALTH: $(curl -s http://127.0.0.1:3200/api/health | head -c 40)"

# Данные собираются заранее (pg-клиент вне проекта)
NODE_PATH=/tmp/pgclient/node_modules bun scripts/pg_client/shot_data.mjs > /tmp/shots-data.json
cat /tmp/shots-data.json
OID=$(python3 scripts/pg_client/shot_field.py order.id)
CPH=$(python3 scripts/pg_client/shot_field.py client.phone)
BPH=$(python3 scripts/pg_client/shot_field.py broker.phone)
LID=$(python3 scripts/pg_client/shot_field.py lead.id)
echo "OID=$OID CPH=$CPH BPH=$BPH LID=$LID"

AB="agent-browser"
SCROLL='[...document.querySelectorAll("*")].filter(e=>e.textContent.trim().startsWith("Разрешительные документы")).sort((a,b)=>a.textContent.length-b.textContent.length)[0]?.scrollIntoView({block:"start"})'

# ── 1. Админка: карточка заявки с секцией разрешительных ────────────
$AB set viewport 1440 900 > /dev/null
$AB open http://127.0.0.1:3200/admin > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 2
$AB snapshot -i > /tmp/shots_login.txt 2>&1
PR="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'телефон' /tmp/shots_login.txt) | head -1 | cut -d= -f2)"
PW="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'пароль' /tmp/shots_login.txt) | head -1 | cut -d= -f2)"
BT="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'войти' /tmp/shots_login.txt) | head -1 | cut -d= -f2)"
$AB fill "$PR" "+79000000000" > /dev/null
sleep 0.5
$AB fill "$PW" "ci-e2e-master-password" > /dev/null
sleep 0.5
$AB click "$BT" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 2
echo "URL after admin login: $($AB get url)"

$AB open "http://127.0.0.1:3200/admin/orders/$OID" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 1
$AB eval "$SCROLL" > /dev/null 2>&1
sleep 1
$AB screenshot --full /tmp/shot1.png > /dev/null 2>&1 || $AB screenshot /tmp/shot1.png > /dev/null 2>&1
cp /tmp/shot1.png "$OUT/01-order-permits-1440.png" 2>/dev/null && echo "shot1 saved" || echo "shot1 MISSING"

# ── 2. Админка: карточка запроса с секцией (строки добавлены сидом) ──
$AB open "http://127.0.0.1:3200/admin/leads/$LID" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 1
$AB eval "$SCROLL" > /dev/null 2>&1
sleep 1
$AB screenshot /tmp/shot2.png > /dev/null 2>&1
cp /tmp/shot2.png "$OUT/02-lead-permits-1440.png" 2>/dev/null && echo "shot2 saved" || echo "shot2 MISSING"

# ── 3. Кабинет клиента (375px): заявка с «Ожидается: …» ─────────────
$AB set viewport 375 812 > /dev/null
$AB open "http://127.0.0.1:3200/client" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 2
$AB snapshot -i > /tmp/shots_client.txt 2>&1
CP="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'телефон' /tmp/shots_client.txt) | head -1 | cut -d= -f2)"
CWP="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'пароль' /tmp/shots_client.txt) | head -1 | cut -d= -f2)"
CB="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'войти' /tmp/shots_client.txt) | head -1 | cut -d= -f2)"
$AB fill "$CP" "$CPH" > /dev/null
sleep 0.5
$AB fill "$CWP" "df03-pass-1" > /dev/null
sleep 0.5
$AB click "$CB" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 2
$AB open "http://127.0.0.1:3200/client/orders/$OID" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 1
$AB eval "$SCROLL" > /dev/null 2>&1
sleep 1
$AB screenshot --full /tmp/shot3.png > /dev/null 2>&1 || $AB screenshot /tmp/shot3.png > /dev/null 2>&1
cp /tmp/shot3.png "$OUT/03-client-order-permits-375.png" 2>/dev/null && echo "shot3 saved" || echo "shot3 MISSING"

# ── 4. Кабинет брокера: расчёт со строками ──────────────────────────
$AB set viewport 1440 900 > /dev/null
$AB open "http://127.0.0.1:3200/broker" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 2
$AB snapshot -i > /tmp/shots_broker.txt 2>&1
BP="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'телефон' /tmp/shots_broker.txt) | head -1 | cut -d= -f2)"
BWP="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'пароль' /tmp/shots_broker.txt) | head -1 | cut -d= -f2)"
BB="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'войти' /tmp/shots_broker.txt) | head -1 | cut -d= -f2)"
$AB fill "$BP" "$BPH" > /dev/null
sleep 0.5
$AB fill "$BWP" "df03-pass-1" > /dev/null
sleep 0.5
$AB click "$BB" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 2
echo "URL after broker login: $($AB get url)"
# карточка заявки брокера — прямым URL (b17 подключён к заявке e2e-фикстуры)
$AB open "http://127.0.0.1:3200/broker/orders/$OID" > /dev/null
$AB wait --load networkidle > /dev/null 2>&1
sleep 1
$AB eval "$SCROLL" > /dev/null 2>&1
sleep 1
$AB screenshot --full /tmp/shot4.png > /dev/null 2>&1 || $AB screenshot /tmp/shot4.png > /dev/null 2>&1
cp /tmp/shot4.png "$OUT/04-broker-permits-1440.png" 2>/dev/null && echo "shot4 saved" || echo "shot4 MISSING"

kill $SRV 2>/dev/null
ls -la "$OUT"