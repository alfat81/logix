#!/bin/bash
# Браузерная приёмка DF-00C (v0.5.3): заморозка кабинета подрядчика.
# Сервер уже поднят на :3000 в режиме заморозки (флаг не задан).
set -u
AB="agent-browser"
PASS=0; FAIL=0
ck() { local d="${3:-}"; if [ "$2" = "1" ]; then echo "PASS $1"; PASS=$((PASS+1)); else echo "FAIL $1 :: $d"; FAIL=$((FAIL+1)); fi; }

# ── 1440: лендинг ────────────────────────────────────────────────
$AB set viewport 1440 900
$AB open http://localhost:3000/ >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
SNAP=$($AB snapshot -i 2>/dev/null)
echo "$SNAP" | rg -q "подрядчиков" && R1=0 || R1=1
ck "лендинг 1440: нет ссылки «Вход для подрядчиков»" $R1 "$SNAP"
echo "$SNAP" | rg -q "Вход для брокеров" && R2=1 || R2=0
ck "лендинг: ссылка брокера на месте" $R2
echo "$SNAP" | rg -q "Вход для клиентов" && R3=1 || R3=0
ck "лендинг: ссылка клиента на месте" $R3

# ── /contractor/login → 404 (curl-проба: браузер на пустой 404 рисует chrome-error)
CODE=$($AB eval "fetch('/contractor/login').then(r=>r.status)" 2>/dev/null | tr -d '"')
[ "$CODE" = "404" ] && R4=1 || R4=0
ck "страница /contractor/login отвечает 404 (fetch из браузера)" $R4 "$CODE"

# ── вход мастера ────────────────────────────────────────────────
$AB open http://localhost:3000/admin >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
S=$($AB snapshot -i 2>/dev/null)
REF=$(echo "$S" | rg -o 'ref=@?e[0-9]+' | head -0; echo "$S" | grep -oE 'ref=@?e[0-9]+' | head -5)
# логин: поля телефон/пароль
PHONE_REF=$(echo "$S" | grep -iE 'телефон' | grep -oE '@?e[0-9]+' | head -1 | tr -d '@')
PASS_REF=$(echo "$S" | grep -iE 'пароль' | grep -oE '@?e[0-9]+' | head -1 | tr -d '@')
BTN_REF=$(echo "$S" | grep -iE 'войти' | grep -oE '@?e[0-9]+' | head -1 | tr -d '@')
$AB fill "@$PHONE_REF" "+79000000000" >/dev/null 2>&1
$AB fill "@$PASS_REF" "ci-e2e-master-password" >/dev/null 2>&1
$AB click "@$BTN_REF" >/dev/null 2>&1
$AB wait --url "/admin" >/dev/null 2>&1 || $AB wait --load networkidle >/dev/null 2>&1
URL2=$($AB get url 2>/dev/null)
echo "$URL2" | rg -q "/admin" && R5=1 || R5=0
ck "логин мастера → /admin" $R5 "$URL2"

# ── /admin/contractors: секции и диалоги ────────────────────────
$AB open http://localhost:3000/admin/contractors >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
S=$($AB snapshot -i 2>/dev/null)
echo "$S" | rg -q "В пуле" && R6=1 || R6=0
ck "страница «Подрядчики»: табы воронки и пула" $R6 "${S:0:150}"

# Диалог 2: ContractorLeadContractDialog — нужен кандидат в статусе «новый»:
# создаём через UI («Новый кандидат»), кликаем карточку, затем «Перевести в пул…»
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Новый кандидат'); if(!b) return 'no btn'; b.click(); return 'ok'})()" >/dev/null 2>&1
$AB wait 600 >/dev/null 2>&1
$AB eval "(()=>{const d=document.querySelector('[role=dialog]'); if(!d) return 'no dialog'; const i=d.querySelectorAll('input')[0]; const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; st.call(i,'Тестовый кандидат '+Date.now()%10000); i.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'})()" >/dev/null 2>&1
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Добавить кандидата'); if(!b) return 'no save'; b.click(); return 'ok'})()" >/dev/null 2>&1
$AB wait 800 >/dev/null 2>&1
$AB eval "(()=>{const el=[...document.querySelectorAll('div,li')].find(x=>x.textContent.includes('Тестовый кандидат') && getComputedStyle(x).cursor==='pointer'); if(!el) return 'no card'; el.click(); return 'ok'})()" >/dev/null 2>&1
$AB wait 600 >/dev/null 2>&1
$AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('Перевести в пул')); if(!b) return 'no btn'; b.click(); return 'ok'})()" >/dev/null 2>&1
$AB wait 800 >/dev/null 2>&1
$AB eval "(()=>{const ds=[...document.querySelectorAll('[role=dialog]')]; const d=ds[ds.length-1]; if(!d) return 'NO DIALOG'; const t=d.textContent; return JSON.stringify({pw:t.includes('Стартовый пароль'), d31:t.includes('заморожен (D31)'), btn:t.includes('Создать подрядчика')})})()" > /tmp/dlg1.json 2>/dev/null
DLG1=$(cat /tmp/dlg1.json)
echo "$DLG1" | rg -q 'pw.{0,2}:false' && R7=1 || R7=0
ck "диалог «Перевести в пул»: поля пароля нет" $R7 "$DLG1"
echo "$DLG1" | rg -q 'd31.{0,2}:true' && R8=1 || R8=0
ck "диалог: описание заморозки D31" $R8 "$DLG1"
$AB press Escape >/dev/null 2>&1; $AB press Escape >/dev/null 2>&1; $AB wait 500 >/dev/null 2>&1

# Диалог 1: ContractorPoolEditDialog — клик по карточке пула (cursor:pointer)
$AB eval "(()=>{const el=[...document.querySelectorAll('div,li')].find(x=>x.textContent.includes('этап(ов) назначено') && getComputedStyle(x).cursor==='pointer'); if(!el) return 'no card'; el.click(); return 'ok'})()" >/dev/null 2>&1
$AB wait 800 >/dev/null 2>&1
$AB eval "(()=>{const ds=[...document.querySelectorAll('[role=dialog]')]; const d=ds[ds.length-1]; if(!d) return 'NO DIALOG'; const t=d.textContent; return JSON.stringify({pw:t.includes('Новый пароль'), comp:t.includes('Компания'), save:t.includes('Сохранить')})})()" > /tmp/dlg2.json 2>/dev/null
DLG2=$(cat /tmp/dlg2.json)
echo "$DLG2" | rg -q 'pw.{0,2}:false' && R9=1 || R9=0
ck "диалог правки подрядчика: поля пароля нет" $R9 "$DLG2"
echo "$DLG2" | rg -q 'comp.{0,2}:true' && R10=1 || R10=0
ck "диалог: прочие поля (Компания) на месте" $R10 "$DLG2"
$AB press Escape >/dev/null 2>&1; $AB wait 500 >/dev/null 2>&1

# ── консоль ─────────────────────────────────────────────────────
CONS=$($AB console 2>/dev/null | rg -ci "error" || true)
[ "${CONS:-0}" = "0" ] && R13=1 || R13=0
ck "консоль браузера: 0 ошибок" $R13 "$CONS"
ERRS=$($AB errors 2>/dev/null | rg -ci "." || true)
[ "${ERRS:-0}" = "0" ] && R14=1 || R14=0
ck "page errors: 0" $R14 "$ERRS"

# ── 375: лендинг и подрядчики ───────────────────────────────────
$AB set viewport 375 812
$AB open http://localhost:3000/ >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
OV=$($AB eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tr -d '"')
# Довоенный дефект лендинга (шапка с кнопками входа не влезает в 375; с 4-й
# кнопкой подрядчика было шире) — известная находка P1-12, не регресс DF-00C
if [ "$OV" -le 229 ]; then echo "WARN лендинг 375: overflow=$OV (довоенный, P1-12 — не в счёт)"; else echo "FAIL лендинг 375: overflow=$OV (вырос > довоенного 229)"; FAIL=$((FAIL+1)); fi
$AB open http://localhost:3000/admin/contractors >/dev/null
$AB wait --load networkidle >/dev/null 2>&1
OV2=$($AB eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tr -d '"')
[ "$OV2" = "0" ] && R12=1 || R12=0
ck "подрядчики 375: overflow=0" $R12 "$OV2"

echo "==============================="
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
