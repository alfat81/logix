#!/usr/bin/env python3
"""Фикстура смоука гейта 2: заявка с требованием «На проверке» (submitted)
для скриншотов реестра 375/1440 (кнопки «Принять/Отклонить», §3.6, Р-2)."""
import json, os, sys, urllib.request
from http.cookiejar import CookieJar

B = os.environ.get('BASE_URL', 'http://localhost:3000')


def client():
    class P(CookieJar.DefaultCookiePolicy if hasattr(CookieJar, 'DefaultCookiePolicy') else object):
        pass
    from http.cookiejar import DefaultCookiePolicy

    class Pol(DefaultCookiePolicy):
        def return_ok_secure(self, c, r):
            return True
    j = CookieJar(Pol())
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(j))


def r(ses, m, p, b=None, raw=None, ct=None):
    data = json.dumps(b).encode() if b is not None else raw
    q = urllib.request.Request(B + p, data=data, method=m)
    if b is not None:
        q.add_header('Content-Type', 'application/json')
    if ct:
        q.add_header('Content-Type', ct)
    try:
        x = ses.open(q)
        body = x.read()
        try:
            return x.status, json.loads(body or b'null')
        except Exception:
            return x.status, body
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body or b'null')
        except Exception:
            return e.code, body[:200]


def main():
    ses = client()
    s, d = ses.open and r(ses, 'POST', '/api/auth/employee/login', {'phone': '+79000000000', 'password': 'logix-master'})
    assert s == 200, (s, d)
    # Контракт из реестра LegalEntities (первая запись сида)
    s, d = r(ses, 'GET', '/api/admin/legal-entities')
    leid = (d.get('items') or d.get('legalEntities') or [{}])[0].get('id')
    assert leid, d
    # Сделка: запрос → вариант → конвертация → в работе
    s, d = r(ses, 'POST', '/api/admin/leads', {
        'rawContact': {'name': 'DF26 w2 смоук', 'phone': '+79997777777'},
        'route': {'originCity': 'Шанхай', 'destinationCity': 'Москва', 'weightKg': 500},
    })
    lid = (d.get('lead') or d)['id']
    s, d = r(ses, 'POST', f'/api/admin/leads/{lid}/options', {
        'description': 'Смоук w2', 'transportModes': ['Море'], 'price': 70000,
        'currency': 'RUB', 'vatMode': 'WITHOUT_VAT', 'etaDays': 30,
        'priorityFit': 'cost', 'isSelected': True,
    })
    s, d = r(ses, 'POST', f'/api/admin/leads/{lid}/convert', {'legalEntityId': leid})
    order = (d.get('order') or d)
    oid = order['id']
    r(ses, 'PATCH', f'/api/admin/orders/{oid}', {'status': 'confirmed'})
    r(ses, 'PATCH', f'/api/admin/orders/{oid}', {'status': 'in_progress'})
    # Требование + загрузка (confirm → submitted)
    s, d = r(ses, 'POST', f'/api/admin/orders/{oid}/permits', {
        'title': 'Сертификат соответствия ТР ТС 018/2011',
        'providedBy': 'client', 'isBlocking': True, 'stageCode': 'import_customs',
    })
    permit = (d.get('permit') or d)
    pid = permit['id']
    body = {'fileName': 'sertifikat-ttc-018.pdf', 'mimeType': 'application/pdf',
            'size': 32, 'kind': 'permit_document',
            'title': 'Сертификат соответствия ТР ТС 018/2011'}
    s, d = r(ses, 'POST', f'/api/admin/orders/{oid}/documents', b=body)
    up = d.get('upload') or {}
    conf = d.get('confirmUrl')
    req = urllib.request.Request(up['url'] if up['url'].startswith('http') else B + up['url'],
                                 data=b'%PDF-1.4 smoke', method='PUT')
    for k, v in (up.get('headers') or {}).items():
        req.add_header(k, v)
    urllib.request.build_opener().open(req).read()
    s, d = r(ses, 'POST', conf, {'permitRequirementId': pid})
    assert s in (200, 201), (s, d)
    print(json.dumps({'orderId': oid, 'permitId': pid, 'status': 'submitted'}))


if __name__ == '__main__':
    main()
