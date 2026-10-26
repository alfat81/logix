#!/usr/bin/env python3
"""
E2E заморозки кабинета подрядчика (DF-00C, D31).

Запускается в CI ОТДЕЛЬНЫМ шагом при CONTRACTOR_PORTAL_ENABLED=false
(переменная окружения читается приложением, скрипту недоступна и не
нужна): кабинет обязан отвечать 404, админская база подрядчиков —
работать (рождение подрядчика, назначение исполнителя на этап).

  BASE_URL=... ADMIN_PHONE=+79000000000 ADMIN_PASSWORD=... \
  DISABLE_RATE_LIMIT=true python3 scripts/e2e_contractor_frozen.py

DISABLE_RATE_LIMIT=true задаётся СЕРВЕРУ (это его env): кабинет отвечает
404, а rate-limit не мешает админ-логину после основного e2e (тот
намеренно провоцирует блокировку; LoginAttempt не чистим).
Созданные данные остаются в тестовой БД (фабрики как в e2e_api_test.py).
"""
import os
import json
import sys
import uuid
import urllib.request
import urllib.error

B = os.environ.get('BASE_URL', 'http://localhost:3000')

R = []


def chk(name, cond, detail=''):
    R.append(bool(cond))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' :: ' + str(detail)[:300]))


class C:
    def __init__(s):
        # как в e2e_api_test.py: сессионная cookie Secure, а гоняем по
        # http://localhost — разрешаем безопасные cookie в небезопасном канале
        from http.cookiejar import CookieJar, DefaultCookiePolicy

        class P(DefaultCookiePolicy):
            def return_ok_secure(self, c, r):
                return True

        s.o = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar(P())))

    def r(s, m, p, b=None):
        data = json.dumps(b).encode() if b is not None else None
        q = urllib.request.Request(B + p, data=data, method=m)
        if b is not None:
            q.add_header('Content-Type', 'application/json')
        try:
            x = s.o.open(q)
            body = x.read()
            try:
                return x.status, json.loads(body or b'null')
            except Exception:
                # не-JSON (HTML-страницы) — тело целиком, чеки ищут по нему
                return x.status, body
        except urllib.error.HTTPError as e:
            body = e.read()
            try:
                return e.code, json.loads(body or b'null')
            except Exception:
                return e.code, body[:200]


u = uuid.uuid4().hex[:6]
base = str(int(u[:4], 16) % 8000000 + 1000000)

# ── 1. Кабинет заморожен: 404 до любой логики (D31) ──────────────────
s, d = C().r('GET', '/contractor/login')
chk('страница входа подрядчика → 404', s == 404, (s, d))
s, d = C().r('GET', '/contractor')
chk('корень кабинета подрядчика → 404', s == 404, (s, d))
s, d = C().r('GET', '/api/contractor/orders')
chk('API кабинета без сессии → 404 (не 401!)', s == 404, (s, d))
s, d = C().r('POST', '/api/auth/contractor/login', {'phone': '+79990000001', 'password': 'x'.ljust(8, 'y')})
chk('вход подрядчика → 404 (cookie не принимается)', s == 404, (s, d))

# ── 2. Лендинг без ссылки на замороженный кабинет ────────────────────
s, d = C().r('GET', '/')
txt = d.decode('utf-8', 'ignore') if isinstance(d, (bytes, bytearray)) else json.dumps(d, ensure_ascii=False)
chk('лендинг отвечает', s == 200, s)
chk('на лендинге нет ссылки «Вход для подрядчиков»', '/contractor/login' not in txt, txt[:120])
chk('ссылки брокера и клиента на месте', '/broker/login' in txt and '/client/login' in txt)

# ── 3. Админская база подрядчиков живёт (не заморожено, D31) ─────────
a = C()
s, d = a.r('POST', '/api/auth/employee/login', {
    'phone': os.environ.get('ADMIN_PHONE', '+79000000000'),
    'password': os.environ['ADMIN_PASSWORD'],
})
chk('админ входит (DISABLE_RATE_LIMIT)', s == 200, (s, d))

s, d = a.r('POST', '/api/admin/contractor-leads', {'companyName': 'Морозный воз ' + u})
chk('кандидат-подрядчик создаётся', s in (200, 201), (s, d))
clid = (d.get('contractorLead') or d.get('lead') or d)['id']
cph = '+7999' + base[:3] + base[3:7]
s, d = a.r('PATCH', f'/api/admin/contractor-leads/{clid}',
           {'status': 'contracted', 'phone': cph, 'password': 'frz-' + u + '-pass'})
chk('рождение подрядчика при заморозке работает', s in (200, 201), (s, d))
s, d = a.r('GET', '/api/admin/contractors')
cs = d.get('contractors', d)
chk('админ видит базу подрядчиков', s == 200 and any(c['phone'] == cph for c in cs), (s, str(d)[:150]))

# ── 4. Назначение исполнителя на этап менеджером (не заморожено) ─────
s, d = a.r('GET', '/api/admin/legal-entities')
le = (d.get('legalEntities') or d.get('items') or d) if isinstance(d, dict) else d
leid = le[0]['id'] if isinstance(le, list) else None
s, d = a.r('POST', '/api/admin/leads', {
    'rawContact': {'name': 'ЗАО Лёд ' + u, 'phone': '8 (999) ' + base[:3] + '-' + base[3:5] + '-' + base[5:7]},
    'route': {'originCity': 'Шанхай', 'destinationCity': 'Москва', 'weightKg': 900},
})
chk('запрос создаётся', s in (200, 201), (s, d))
lid = (d.get('lead') or d)['id']
s, d = a.r('POST', f'/api/admin/leads/{lid}/options',
           {'description': 'Море', 'price': 300000, 'currency': 'RUB', 'vatMode': 'WITHOUT_VAT',
            'etaDays': 30, 'priorityFit': 'cost', 'isSelected': True})
chk('вариант расчёта создаётся', s in (200, 201), (s, d))
s, d = a.r('POST', f'/api/admin/leads/{lid}/convert', {'legalEntityId': leid, 'incoterm': 'FOB'})
chk('конвертация в заявку работает', s == 201, (s, d))
order = d.get('order') if isinstance(d, dict) else None
oid = order['id'] if order else None
cid = [c for c in cs if c['phone'] == cph][0]['id']
s, d = a.r('PATCH', f'/api/admin/orders/{oid}/stages', {'stages': []})
# назначение — через конкретный этап (как в основном e2e): берём второй этап
s, d = a.r('GET', f'/api/admin/orders/{oid}')
st = (d.get('order', d)).get('stages', [])
chk('этапы заявки читаются', s == 200 and len(st) >= 2, (s, len(st)))
s, d = a.r('PATCH', f"/api/admin/orders/{oid}/stages/{st[1]['id']}", {'contractorId': cid})
chk('админ назначает исполнителя на этап', s == 200, (s, d))

ok = all(R)
print(f"\nИТОГО e2e-заморозка: {sum(R)}/{len(R)}")
sys.exit(0 if ok else 1)
