#!/usr/bin/env python3
# DF-02A Блок 5: смок users-API на живом dev-сервере (паттерн Блока 3).
# Проверяем: список/создание/правку людей клиента и брокера, охрану
# логинов (409 той же/чужой компании), computed hasCabinetAccess,
# гашение сессий при смене пароля/деактивации, 404 чужой компании,
# вход по прежним данным брокера (первичный из contactInfo).
# После прогона — фикстуры удаляются каскадом, LoginAttempt чистится.
import json
import os
import sys
import urllib.request

BASE = 'http://localhost:3000'
FAILS = []


def req(method, path, body=None, cookie=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        r.add_header('Content-Type', 'application/json')
    if cookie:
        r.add_header('Cookie', cookie)
    try:
        with urllib.request.urlopen(r) as resp:
            setc = resp.headers.get('Set-Cookie', '')
            return resp.status, json.loads(resp.read().decode() or '{}'), setc.split(';')[0] if setc else cookie
    except urllib.error.HTTPError as e:
        try:
            d = json.loads(e.read().decode() or '{}')
        except Exception:
            d = {}
        sc = e.headers.get('Set-Cookie', '')
        return e.code, d, sc.split(';')[0] if sc else cookie


def chk(name, cond, extra=''):
    print(('  OK  ' if cond else 'FAIL  ') + name + (f'  [{extra}]' if extra and not cond else ''))
    if not cond:
        FAILS.append(name)


ph = lambda n: f'+7777000000{n}' if n < 10 else f'+777700000{n}'

# ── 0. мастер ──
s, d, admin = req('POST', '/api/auth/employee/login', {'phone': '+79000000000', 'password': 'logix-master'})
chk('мастер вошёл', s == 200)

# ── 1. компании ──
s, d, _ = req('POST', '/api/admin/customers', {'name': 'Смоук Компания 1', 'phone': ph(1)}, admin)
c1 = d.get('customer', {}).get('id')
chk('C1 создана', s == 201 and c1, f'{s} {d}')
s, d, _ = req('POST', '/api/admin/customers', {'name': 'Смоук Компания 2', 'phone': ph(2)}, admin)
c2 = d.get('customer', {}).get('id')
chk('C2 создана', s == 201 and c2, f'{s} {d}')

# ── 2. computed hasCabinetAccess: нет людей → false ──
s, d, _ = req('GET', f'/api/admin/customers/{c1}', None, admin)
chk('карточка: доступа нет (людей нет)', s == 200 and d['customer']['hasCabinetAccess'] is False)

# ── 3. список пуст, создание человека с входом ──
s, d, _ = req('GET', f'/api/admin/customers/{c1}/users', None, admin)
chk('список людей пуст', s == 200 and d['users'] == [])
s, d, _ = req('POST', f'/api/admin/customers/{c1}/users',
              {'name': 'Анна Смоук', 'phone': ph(11), 'email': 'anna@smoke.ru', 'password': 'smoke-pass-1'}, admin)
u1 = d.get('user', {}).get('id')
chk('человек создан (201, hasPassword, не первичный)',
    s == 201 and u1 and d['user']['hasPassword'] is True and d['user']['isPrimary'] is False, f'{s} {d}')
chk('хеш не утёк', 'password' not in d['user'])

# ── 4. hasCabinetAccess стал true (computed из людей) ──
s, d, _ = req('GET', f'/api/admin/customers/{c1}', None, admin)
chk('карточка: доступ есть (человек с входом)', d['customer']['hasCabinetAccess'] is True)

# ── 5. вход по человеку, userId/userName в ответе и /me ──
s, d, cl = req('POST', '/api/auth/client/login', {'phone': ph(11), 'password': 'smoke-pass-1'})
cl_data = d.get('client') or {}
chk('вход по телефону человека', s == 200 and cl_data.get('userName') == 'Анна Смоук' and cl_data.get('userId') == u1, f'{s} {d}')
s, d, _ = req('GET', '/api/auth/client/me', None, cl)
chk('/me несёт человека', s == 200 and (d.get('client') or {}).get('userName') == 'Анна Смоук')

# ── 6. охрана логинов: 409 той же компании, 409 чужой, дубль без пароля легален ──
s, d, _ = req('POST', f'/api/admin/customers/{c1}/users',
              {'name': 'Второй С таким же', 'phone': ph(11), 'password': 'smoke-pass-2'}, admin)
chk('409: телефон занят человеком той же компании', s == 409 and 'Анна Смоук' in d.get('error', ''), f'{s} {d}')
s, d, _ = req('POST', f'/api/admin/customers/{c2}/users',
              {'name': 'Чужой Дубль', 'phone': ph(11), 'password': 'smoke-pass-2'}, admin)
chk('409: телефон занят входом чужой компании', s == 409 and 'Смоук Компания 1' in d.get('error', ''), f'{s} {d}')
s, d, u2x = req('POST', f'/api/admin/customers/{c2}/users',
                {'name': 'Контакт без входа', 'phone': ph(11)}, admin)
chk('201: дубль телефона БЕЗ пароля легален (контакт)', s == 201, f'{s} {d}')

# ── 7. 400: пароль без телефона; сырой телефон ──
s, d, _ = req('POST', f'/api/admin/customers/{c1}/users', {'name': 'Без телефона', 'password': 'smoke-pass-3'}, admin)
chk('400: пароль без телефона', s == 400, f'{s} {d}')
s, d, _ = req('POST', f'/api/admin/customers/{c1}/users', {'name': 'Сырой номер', 'phone': '123', 'password': 'smoke-pass-3'}, admin)
chk('400: сырой телефон отклонён', s == 400, f'{s} {d}')

# ── 8. смена пароля рвёт сессию; старый 401, новый 200 ──
s, d, _ = req('PATCH', f'/api/admin/customers/{c1}/users/{u1}', {'password': 'smoke-pass-2'}, admin)
chk('пароль обновлён (сообщение о сеансах)', s == 200 and 'сеансы' in d.get('message', ''), f'{s} {d}')
s, d, _ = req('GET', '/api/auth/client/me', None, cl)
chk('старая сессия человека погасла', s == 401, f'{s}')
s, d, _ = req('POST', '/api/auth/client/login', {'phone': ph(11), 'password': 'smoke-pass-1'})
chk('старый пароль 401', s == 401, f'{s}')
s, d, cl = req('POST', '/api/auth/client/login', {'phone': ph(11), 'password': 'smoke-pass-2'})
chk('новый пароль 200', s == 200, f'{s}')

# ── 9. деактивация: 403 после сверки пароля; сессии гаснут ──
s, d, _ = req('PATCH', f'/api/admin/customers/{c1}/users/{u1}', {'isActive': False}, admin)
chk('деактивирован', s == 200, f'{s}')
s, d, _ = req('GET', '/api/auth/client/me', None, cl)
chk('сессия деактивированного погасла', s == 401, f'{s}')
s, d, _ = req('POST', '/api/auth/client/login', {'phone': ph(11), 'password': 'smoke-pass-2'})
chk('вход деактивированного 403', s == 403, f'{s}')
s, d, _ = req('PATCH', f'/api/admin/customers/{c1}/users/{u1}', {'isActive': True}, admin)
chk('возврат', s == 200, f'{s}')

# ── 10. 404 чужой компании ──
s, d, _ = req('PATCH', f'/api/admin/customers/{c2}/users/{u1}', {'name': 'Взлом'}, admin)
chk('404: человек чужой компании не виден', s == 404, f'{s}')

# ── 11. отзыв входа (password null): человек остаётся контактом ──
s, d, _ = req('PATCH', f'/api/admin/customers/{c1}/users/{u1}', {'password': None}, admin)
chk('вход отозван', s == 200 and d['user']['hasPassword'] is False, f'{s} {d}')
s, d, _ = req('POST', '/api/auth/client/login', {'phone': ph(11), 'password': 'smoke-pass-2'})
chk('вход после отзыва 401', s == 401, f'{s}')
s, d, _ = req('GET', f'/api/admin/customers/{c1}', None, admin)
chk('карточка: доступа снова нет', d['customer']['hasCabinetAccess'] is False)

# ── 12. брокер: справочник → первичный (contactInfo) → второй человек ──
s, d, _ = req('POST', '/api/admin/brokers', {'companyName': 'Смоук Брокер', 'phone': ph(3), 'password': 'broker-pass-1', 'contactInfo': {'name': 'Пётр Смоков', 'email': 'petr@smoke.ru'}}, admin)
b1 = d.get('broker', {}).get('id')
chk('брокер создан', s == 201 and b1, f'{s} {d}')
s, d, _ = req('GET', f'/api/admin/brokers/{b1}/users', None, admin)
users = d.get('users', [])
chk('первичный пользователь переноса на месте', len(users) == 1 and users[0]['isPrimary'] and users[0]['name'] == 'Пётр Смоков' and users[0]['hasPassword'], f'{d}')
s, d, _ = req('POST', f'/api/admin/brokers/{b1}/users',
              {'name': 'Второй Брокер', 'phone': ph(4), 'email': 'v2@smoke.ru', 'password': 'broker-pass-2'}, admin)
u2 = d.get('user', {}).get('id')
chk('второй человек брокера создан', s == 201 and u2, f'{s} {d}')
s, d, _ = req('POST', f'/api/admin/brokers/{b1}/users', {'name': 'Дубль', 'phone': ph(3), 'password': 'broker-pass-2'}, admin)
chk('409: глобальный уникальный телефон брокера', s == 409 and 'Пётр Смоков' in d.get('error', ''), f'{s} {d}')
s, d, bl = req('POST', '/api/auth/broker/login', {'phone': ph(3), 'password': 'broker-pass-1'})
bl_data = d.get('broker') or {}
chk('вход брокера по прежним данным (первичный)', s == 200 and bl_data.get('userName') == 'Пётр Смоков', f'{s} {d}')
s, d, bl2 = req('POST', '/api/auth/broker/login', {'phone': ph(4), 'password': 'broker-pass-2'})
bl2_data = d.get('broker') or {}
chk('вход второго человека брокера', s == 200 and bl2_data.get('userName') == 'Второй Брокер', f'{s} {d}')
s, d, _ = req('PATCH', f'/api/admin/brokers/{b1}/users/{u2}', {'isActive': False}, admin)
chk('второй брокер-человек деактивирован', s == 200, f'{s}')
s, d, _ = req('GET', '/api/auth/broker/me', None, bl2)
chk('его сессия погасла', s == 401, f'{s}')
s, d, _ = req('GET', '/api/auth/broker/me', None, bl)
chk('сессия коллеги (первичного) жива', s == 200, f'{s}')
s, d, _ = req('PATCH', f'/api/admin/brokers/{b1}/users/{u1}x', {'name': 'X'}, admin)
chk('404: несуществующий человек', s == 404, f'{s}')

print()
print('ИТОГ:', 'ВСЕ OK' if not FAILS else f'ПРОВАЛОВ {len(FAILS)}: {FAILS}')
sys.exit(1 if FAILS else 0)
