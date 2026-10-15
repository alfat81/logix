#!/usr/bin/env python3
"""
Smoke-тест Дорожки Б6 (LOGISTICS-TASK-QUEUE.md) для Logix.

Сценарий из очереди задач:
  1. Создать заявку → обязательные этапы на месте
  2. Добавить один опциональный
  3. Попытаться удалить обязательный (должно быть отклонено на API)
  4. Сменить статус этапа
  5. Сменить статус заявки вручную (не автоматически от этапов — 8.1)

Плюс сопутствующие проверки: auth (неверный пароль, нормализация
телефона, me), повторное использование договора пары (8.2),
автонумерация заявок внутри договора (Б4), write-guard (401 без
сессии), фильтр списка по статусу.

Запуск: python3 smoke_test_logix.py [базовый URL, по умолчанию http://localhost:3000]
"""

import json
import sys
import urllib.request
import urllib.error
import urllib.parse
from http.cookiejar import CookieJar

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'

PASS = 0
FAIL = 0
FAILURES = []


def check(name, condition, detail=''):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f'  ✅ {name}')
    else:
        FAIL += 1
        FAILURES.append(f'{name} {detail}')
        print(f'  ❌ {name} — {detail}')


class Client:
    """HTTP-клиент с cookie-сервером (сессия сотрудника)."""

    def __init__(self):
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, method, path, body=None, auth=True):
        url = BASE + path
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            r.add_header('Content-Type', 'application/json')
        try:
            resp = self.opener.open(r)
            return resp.status, json.loads(resp.read() or b'null')
        except urllib.error.HTTPError as e:
            try:
                payload = json.loads(e.read() or b'null')
            except Exception:
                payload = None
            return e.code, payload

    def raw(self, method, path, body=None):
        """Запрос без cookie (проверка write-guard)."""
        url = BASE + path
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(url, data=data, method=method)
        if data is not None:
            r.add_header('Content-Type', 'application/json')
        try:
            resp = urllib.request.urlopen(r)
            return resp.status, json.loads(resp.read() or b'null')
        except urllib.error.HTTPError as e:
            try:
                payload = json.loads(e.read() or b'null')
            except Exception:
                payload = None
            return e.code, payload


def main():
    c = Client()
    print(f'== Smoke-тест Logix Б6 против {BASE} ==\n')

    # ── 0. Доступность ─────────────────────────────────────────
    print('[0] Доступность')
    s, _ = c.req('GET', '/api/auth/employee/me')
    check('API отвечает (401 без сессии — ожидаемо)', s == 401, f'получен {s}')
    s, _ = c.raw('POST', '/api/admin/orders', body={'cargoDescription': 'взлом'})
    check('Write-роут без сессии → 401', s == 401, f'получен {s}')

    # ── 1. Авторизация ─────────────────────────────────────────
    print('\n[1] Авторизация (А5)')
    s, d = c.req('POST', '/api/auth/employee/login', body={'phone': '+70000000001', 'password': 'неверный'})
    check('Неверный пароль → 401, единый текст', s == 401 and 'Неверный телефон или пароль' in (d or {}).get('error', ''), f'{s} {d}')

    s, d = c.req('POST', '/api/auth/employee/login', body={'phone': '8 000 000 00 01', 'password': 'changeme123'})
    check('Логин (нормализация 8-формата телефона)', s == 200 and d.get('authenticated') is True, f'{s} {d}')
    check('Роль мастера в ответе', 'master' in d.get('employee', {}).get('roles', []), str(d))

    s, d = c.req('GET', '/api/auth/employee/me')
    check('me: сессия жива', s == 200 and d.get('authenticated') is True, f'{s}')

    # ── 2. Справочники ─────────────────────────────────────────
    print('\n[2] Справочники')
    s, le = c.req('POST', '/api/admin/legal-entities', body={'name': 'ООО «Лоджикс»'})
    check('Создание юрлица', s == 201 and le.get('id'), f'{s} {le}')
    legal_entity_id = le['id']

    s, stages_catalog = c.req('GET', '/api/admin/stage-catalog')
    mandatory_codes = [x['code'] for x in stages_catalog if x['isMandatory']]
    optional_codes = [x['code'] for x in stages_catalog if not x['isMandatory']]
    check('Каталог: 6 обязательных этапов', len(mandatory_codes) == 6, str(mandatory_codes))
    check('Каталог: есть опциональные этапы', len(optional_codes) >= 1, str(optional_codes))

    # ── 3. Создание заявки (Б3, Б4, 8.2) ───────────────────────
    print('\n[3] Создание заявки — новый клиент, договор прозрачно (8.2)')
    s, o1 = c.req('POST', '/api/admin/orders', body={
        'newCustomer': {'name': 'ООО «Ромашка»', 'phone': '+7 495 000-00-01', 'email': 'zakaz@romashka.ru'},
        'legalEntityId': legal_entity_id,
        'cargoDescription': 'Станки, 2 контейнера 40HC, 34 т',
        'routeFrom': 'Шанхай, CN',
        'routeTo': 'Москва, RU',
        'transportMode': 'multimodal',
        'incoterm': 'dap',
        'hsCode': '8462.31',
    })
    check('Создана заявка', s == 201 and o1.get('number') == '1-1', f'{s} {o1}')
    check('Подставлено 6 обязательных этапов', len(o1.get('stages', [])) == 6, f"этапов: {len(o1.get('stages', []))}")
    check('Все обязательные в not_started', all(st['status'] == 'not_started' for st in o1.get('stages', [])))

    # Договор пары создан автоматически
    s, contracts = c.req('GET', '/api/admin/contracts')
    check('Договор №1 создан прозрачно', s == 200 and len(contracts) == 1 and contracts[0]['number'] == 1, f'{len(contracts)}')

    # ── 4. Карточка заявки ─────────────────────────────────────
    print('\n[4] Карточка заявки')
    s, card = c.req('GET', f"/api/admin/orders/{o1['id']}")
    check('Карточка отдаётся', s == 200 and card['number'] == '1-1', f'{s}')
    check('Этапы помечены isMandatory по каталогу', all(st['isMandatory'] for st in card['stages']))
    check('Инкотермс приведён к верхнему регистру', card['incoterm'] == 'DAP', card.get('incoterm'))
    check('Снимок создателя заполнен', card.get('createdByEmployeeName') is not None, str(card.get('createdByEmployeeName')))

    mandatory_stage = next(st for st in card['stages'] if st['code'] == 'transport')

    # ── 5. Добавление опционального этапа ──────────────────────
    print('\n[5] Добавление опционального этапа')
    insurance = next(x for x in stages_catalog if x['code'] == 'cargo_insurance')
    s, added = c.req('POST', f"/api/admin/orders/{o1['id']}/stages", body={'stageCatalogId': insurance['id']})
    check('Опциональный этап добавлен', s == 201 and added.get('title') == 'Страхование груза', f'{s} {added}')

    s, dup = c.req('POST', f"/api/admin/orders/{o1['id']}/stages", body={'stageCatalogId': insurance['id']})
    check('Дубликат этапа отклонён (409)', s == 409, f'{s} {dup}')

    s, card = c.req('GET', f"/api/admin/orders/{o1['id']}")
    check('Теперь 7 этапов', len(card['stages']) == 7, f"{len(card['stages'])}")

    # ── 6. Удаление: обязательный нельзя, опциональный можно ────
    print('\n[6] Серверная проверка удаления (раздел 3 роадмапа)')
    s, d = c.req('DELETE', f"/api/admin/orders/{o1['id']}/stages/{mandatory_stage['id']}")
    check('Удаление ОБЯЗАТЕЛЬНОГО отклонено на API (400)', s == 400, f'{s} {d}')
    check('Текст ошибки называет этап', 'не может быть удалён' in (d or {}).get('error', ''), str(d))

    s, d = c.req('DELETE', f"/api/admin/orders/{o1['id']}/stages/{added['id']}")
    check('Удаление опционального разрешено', s == 200, f'{s} {d}')

    s, card = c.req('GET', f"/api/admin/orders/{o1['id']}")
    check('Снова 6 этапов', len(card['stages']) == 6)

    # ── 7. Смена статуса этапа ─────────────────────────────────
    print('\n[7] Статус этапа')
    s, d = c.req('PATCH', f"/api/admin/orders/{o1['id']}/stages/{mandatory_stage['id']}", body={'status': 'in_progress'})
    check('Этап → в работе', s == 200 and d['status'] == 'in_progress', f'{s} {d}')
    s, d = c.req('PATCH', f"/api/admin/orders/{o1['id']}/stages/{mandatory_stage['id']}", body={'status': 'done'})
    check('Этап → завершён, факт зафиксирован', s == 200 and d.get('actualDate'), f'{s} {d}')
    s, d = c.req('PATCH', f"/api/admin/orders/{o1['id']}/stages/{mandatory_stage['id']}", body={'status': 'несуществующий'})
    check('Недопустимый статус этапа отклонён (400)', s == 400, f'{s}')

    # ── 8. Ручная смена статуса заявки (8.1) ────────────────────
    print('\n[8] Статус заявки — вручную (8.1)')
    s, d = c.req('PATCH', f"/api/admin/orders/{o1['id']}", body={'status': 'in_progress'})
    check('Заявка → в работе', s == 200 and d['status'] == 'in_progress', f'{s} {d}')
    s, d = c.req('PATCH', f"/api/admin/orders/{o1['id']}", body={'status': 'невалидный'})
    check('Недопустимый статус заявки отклонён (400)', s == 400, f'{s}')

    # 8.1: статус заявки НЕ агрегируется от этапов — завершаем ещё
    # один этап ПОСЛЕ ручного перевода заявки в «в работе» и убеждаемся,
    # что заявка не «завершилась» сама (этапы — прогресс, не статус)
    pickup_stage = next(st for st in card['stages'] if st['code'] == 'export_pickup')
    s, d = c.req('PATCH', f"/api/admin/orders/{o1['id']}/stages/{pickup_stage['id']}", body={'status': 'done'})
    check('Второй этап завершён', s == 200 and d['status'] == 'done', f'{s}')
    s, card2 = c.req('GET', f"/api/admin/orders/{o1['id']}")
    check('Статус заявки не агрегируется от этапов', card2['status'] == 'in_progress', card2['status'])

    # ── 9. Вторая заявка того же клиента (Б4, 8.2) ──────────────
    print('\n[9] Автонумерация внутри договора')
    customer_id = card['contract']['customer']['id']
    s, o2 = c.req('POST', '/api/admin/orders', body={
        'customerId': customer_id,
        'legalEntityId': legal_entity_id,
        'cargoDescription': 'Компрессор, 1 контейнер 20DV',
        'routeFrom': 'Нинбо, CN',
        'routeTo': 'Санкт-Петербург, RU',
        'transportMode': 'sea',
    })
    check('Вторая заявка: номер «1-2»', s == 201 and o2.get('number') == '1-2', f'{s} {o2}')
    check('Обязательные этапы подставлены и ей', len(o2.get('stages', [])) == 6)

    s, contracts = c.req('GET', '/api/admin/contracts')
    check('Договор НЕ задублирован (по-прежнему один)', len(contracts) == 1, f'{len(contracts)}')

    # ── 10. Список и фильтр ────────────────────────────────────
    print('\n[10] Список заявок и фильтр по статусу')
    s, lst = c.req('GET', '/api/admin/orders')
    check('В списке обе заявки', s == 200 and len(lst) == 2, f'{len(lst) if lst else 0}')
    s, lst = c.req('GET', '/api/admin/orders?status=in_progress')
    check('Фильтр по статусу работает', s == 200 and len(lst) == 1 and lst[0]['number'] == '1-1', f'{len(lst)}')
    s, lst = c.req('GET', '/api/admin/orders?q=' + urllib.parse.quote('Ромашка'))
    check('Поиск по клиенту работает', s == 200 and len(lst) == 2, f'{len(lst)}')

    # ── Итог ───────────────────────────────────────────────────
    print('\n' + '=' * 50)
    print(f'ИТОГ: {PASS} прошло, {FAIL} упало')
    if FAILURES:
        print('Упавшие проверки:')
        for f in FAILURES:
            print(f'  - {f}')
        sys.exit(1)
    print('Сценарий Б6 пройден полностью.')


if __name__ == '__main__':
    main()
