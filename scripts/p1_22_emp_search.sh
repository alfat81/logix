#!/bin/bash
# Точечная проверка поиска сотрудников (Ж4): q по имени и телефону
set -u
cd /home/z/my-project/logix
pkill -9 -f next-server 2>/dev/null; sleep 1
DATABASE_URL="postgresql://logix@127.0.0.1:5432/logix" bun run start > /home/z/my-project/next-browser.log 2>&1 &
SRV=$!
for i in $(seq 1 15); do curl -s --max-time 2 http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 2; done
AB="agent-browser"
$AB set viewport 1440 900
$AB open http://127.0.0.1:3000/admin >/dev/null; $AB wait --load networkidle >/dev/null
$AB snapshot -i > /tmp/sl.txt 2>&1
$AB fill "@$(grep -oE 'ref=e[0-9]+' <(grep -i 'телефон' /tmp/sl.txt) | head -1 | cut -d= -f2)" "+79000000000" >/dev/null
$AB fill "@$(grep -oE 'ref=e[0-9]+' <(grep -i 'пароль' /tmp/sl.txt) | head -1 | cut -d= -f2)" "logix-master" >/dev/null
$AB click "@$(grep -oE 'ref=e[0-9]+' <(grep -i 'войти' /tmp/sl.txt) | head -1 | cut -d= -f2)" >/dev/null
$AB wait --load networkidle >/dev/null; sleep 1

$AB open http://127.0.0.1:3000/admin/employees >/dev/null; $AB wait --load networkidle >/dev/null; sleep 0.5
$AB snapshot -i -c > /tmp/se.txt 2>&1
SRCH="@$(grep -oE 'ref=e[0-9]+' <(grep -i 'Имя или телефон' /tmp/se.txt) | head -1 | cut -d= -f2)"
BEFORE=$($AB eval "document.body.innerText.split('Мастер Logix').length - 1" 2>/dev/null)
echo "до поиска: вхождений 'Мастер Logix' = $BEFORE"

$AB fill "$SRCH" "мастер" >/dev/null; sleep 1.2
AFTER=$($AB eval "document.body.innerText.split('Мастер Logix').length - 1" 2>/dev/null)
MGR=$($AB eval "document.body.innerText.includes('Менеджер B ead3f6')" 2>/dev/null)
echo "поиск «мастер»: 'Мастер Logix' = $AFTER, менеджер ещё виден = $MGR"

$AB fill "$SRCH" "+79992461034" >/dev/null; sleep 1.2
BYPHONE=$($AB eval "document.body.innerText.includes('Менеджер B ead3f6')" 2>/dev/null)
echo "поиск по телефону +79992461034: 'Менеджер B ead3f6' виден = $BYPHONE"

$AB fill "$SRCH" "xyz-нет-такого" >/dev/null; sleep 1.2
EMPTY=$($AB eval "document.body.innerText.match(/не найд|нет сотрудник|Ничего/i)?.[0] || '(пустой текст состояния не найден)'" 2>/dev/null)
echo "мусорный запрос: $EMPTY"

kill $SRV 2>/dev/null; pkill -9 -f next-server 2>/dev/null
$AB close >/dev/null 2>&1
echo "DONE"
