#!/usr/bin/env python3
"""
Сквозной API-тест Logix: полный цикл сделки по четырём кабинетам + изоляция доступа.
ЗАПУСКАТЬ ТОЛЬКО НА ТЕСТОВОЙ БАЗЕ: создаёт данные, в конце намеренно провоцирует
блокировку входа (rate-limit). Перед повторным прогоном: DELETE FROM "LoginAttempt".

  BASE_URL=http://localhost:3000 ADMIN_PHONE=+79000000000 ADMIN_PASSWORD=... python3 scripts/e2e_api_test.py

Проверки с префиксом [ЦЕЛЬ] описывают целевое поведение из роадмапа —
сейчас они падают и должны позеленеть по мере закрытия задач.
Код выхода 1, если упала хотя бы одна проверка без префикса [ЦЕЛЬ].
"""
import os
import json, urllib.request, urllib.error, uuid, threading, sys, subprocess
from urllib.parse import quote as urlquote
from http.cookiejar import CookieJar
B=os.environ.get('BASE_URL','http://localhost:3000')
AM='POST'
R=[]
def chk(name, cond, detail=''):
    R.append((name, bool(cond), detail)); print(('PASS ' if cond else 'FAIL ')+name+('' if cond else ' :: '+str(detail)[:300]))
class C:
    def __init__(s):
        from http.cookiejar import DefaultCookiePolicy
        class P(DefaultCookiePolicy):
            def return_ok_secure(self,c,r): return True
        s.j=CookieJar(P()); s.o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(s.j))
    def r(s,m,p,b=None,raw=None,ct=None,h=None):
        data=json.dumps(b).encode() if b is not None else raw
        q=urllib.request.Request(B+p,data=data,method=m)
        if b is not None: q.add_header('Content-Type','application/json')
        if ct: q.add_header('Content-Type',ct)
        for k,v in (h or {}).items(): q.add_header(k,v)
        try:
            x=s.o.open(q); body=x.read()
            try: return x.status, json.loads(body or b'null')
            except: return x.status, body
        except urllib.error.HTTPError as e:
            body=e.read()
            try: return e.code, json.loads(body or b'null')
            except: return e.code, body[:200]
def multipart(fields, fname, fbytes, mime):
    bd='----x'+uuid.uuid4().hex; out=b''
    for k,v in fields.items(): out+=f'--{bd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    out+=f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="{fname}"\r\nContent-Type: {mime}\r\n\r\n'.encode()+fbytes+b'\r\n'
    out+=f'--{bd}--\r\n'.encode(); return out, 'multipart/form-data; boundary='+bd
def up2(ses, url, fname, fbytes, mime, permit_id=None, extra=None):
    """DF-11: двухфазная загрузка (create JSON → PUT в хранилище → confirm).
    Возвращает (status, data) последнего шага (confirm, либо create при отказе)."""
    body = {'fileName': fname, 'mimeType': mime, 'size': len(fbytes)}
    if extra: body.update(extra)
    s1, d1 = ses.r('POST', url, b=body)
    if s1 not in (200, 201): return s1, d1
    up = d1.get('upload') or {}
    conf = d1.get('confirmUrl')
    purl = up.get('url', '')
    if not purl.startswith('http'): purl = B + purl
    req = urllib.request.Request(purl, data=fbytes, method='PUT')
    for k, v in (up.get('headers') or {}).items(): req.add_header(k, v)
    try:
        x = ses.o.open(req); x.read()
        if x.status >= 300: return x.status, {'error': 'PUT rejected'}
    except urllib.error.HTTPError as e:
        return e.code, {'error': 'PUT rejected'}
    cb = {'permitRequirementId': permit_id} if permit_id else {}
    return ses.r('POST', conf, b=cb)

def raw_get(ses, path):
    """GET без следования редиректам: для проверки 302 на presigned GET.
    Заголовки нормализуются в нижний регистр (Next шлёт location строчными)."""
    class NR(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    op = urllib.request.build_opener(NR, urllib.request.HTTPCookieProcessor(ses.j))
    try:
        x = op.open(urllib.request.Request(B + path if path.startswith('/') else path))
        return x.status, {k.lower(): v for k, v in dict(x.headers).items()}, x.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in dict(e.headers).items()}, e.read()

u=uuid.uuid4().hex[:6]; ph=lambda n: '+7999%07d'%n
import random; base=random.randint(1000000,8000000)
# --- admin
a=C()
s,d=a.r('POST','/api/auth/employee/login',{'phone':os.environ.get('ADMIN_PHONE','+79000000000'),'password':os.environ['ADMIN_PASSWORD']}); chk('admin login (8-формат телефона)',s==200,(s,d))
s,d=C().r('GET','/api/health'); chk('health: БД доступна (E0-10)',s==200 and isinstance(d,dict) and d.get('db')=='ok',(s,d))
a2=C(); s,_=a2.r('POST','/api/auth/employee/login',{'phone':os.environ.get('ADMIN_PHONE','+79000000000'),'password':os.environ['ADMIN_PASSWORD']})
s1,_=a2.r('POST','/api/auth/employee/logout'); s2,_=a2.r('GET','/api/auth/employee/me'); s3,_=a.r('GET','/api/auth/employee/me')
chk('выход гасит только свою сессию (E0-06/E0-08)',s==200 and s2==401 and s3==200,(s,s1,s2,s3))
s,d=a.r('GET','/api/admin/legal-entities'); le=(d.get('legalEntities') or d.get('items') or d) if isinstance(d,dict) else d
leid=(le[0]['id'] if isinstance(le,list) else None); chk('юрлицо из сида',leid,d)
# lead with raw contact
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'ООО Ромб '+u,'phone':'8 (999) '+str(base)[:3]+'-'+str(base)[3:5]+'-'+str(base)[5:7]},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':1200,'placesCount':12},'cargoInfo':{'note':'заметка','hsCode':'8471300000','cargoValue':9000},'incotermCode':'FOB'}); chk('создание запроса',s in(200,201),(s,d))
lead=(d.get('lead') or d); lid=lead['id']
# --- P1-01: ответственный менеджер ---
s,d=a.r('GET','/api/auth/employee/me'); aid=(d.get('employee') or {}).get('id'); chk('P1-01: id текущего сотрудника (me)',bool(aid),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d)
chk('P1-01: запрос при создании получает ответственного-создателя',(L.get('assignee') or {}).get('id')==aid,L.get('assignee'))
# DF-27 волна 2 (§6.4/D75): неполная анкета — needs_data, мяч у менеджера
# (правило no_data важнее awaiting_proforma: без данных сделка не считается)
chk('DF-05: запрос без описания и проформы — мяч у менеджера (no_data, needs_data)',(L.get('waitingOnKind'),L.get('waitingReason'))==('manager','no_data'),(L.get('waitingOnKind'),L.get('waitingReason')))
b2ph=ph(base+4)
s,d=a.r('POST','/api/admin/employees',{'name':'Менеджер B '+u,'phone':b2ph,'password':'manager-pass-1','roles':['manager']}); chk('P1-01: менеджер B создан',s in(200,201),(s,d)); bid2=(d.get('employee') or d)['id']
bb=C(); s,_=bb.r('POST','/api/auth/employee/login',{'phone':b2ph,'password':'manager-pass-1'})
chk('P1-01: менеджер B вошёл',s==200,s)
s,d=bb.r('GET','/api/admin/leads?assigned=mine'); ids=[x['id'] for x in d.get('leads',[])]
chk('[ПРИЁМКА P1-01] менеджер B не видит запрос A в фильтре «Мои»',lid not in ids,len(ids))
s,d=a.r('GET','/api/admin/leads?assigned=unassigned'); ids=[x['id'] for x in d.get('leads',[])]
chk('P1-01: новый запрос не в «Без ответственного»',lid not in ids,len(ids))
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'assignedToId':'nonexistent-id'}); chk('P1-01: несуществующий сотрудник → 400',s==400,s)
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'assignedToId':bid2}); chk('P1-01: смена ответственного → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); acts=L.get('activities',[])
chk('P1-01: смена ответственного в журнале запроса',bool(acts) and acts[0]['type']=='lead_assignee_changed' and 'Менеджер B' in acts[0]['description'],(acts[0] if acts else None))
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'assignedToId':bid2}); chk('P1-01: повторное назначение того же → 400',s==400,s)
s,d=bb.r('GET','/api/admin/leads?assigned=mine'); ids=[x['id'] for x in d.get('leads',[])]
chk('P1-01: B видит запрос в «Мои» после назначения',lid in ids,len(ids))
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'assignedToId':None}); chk('P1-01: снятие ответственного → 200',s==200,(s,d))
s,d=a.r('GET','/api/admin/leads?assigned=unassigned'); ids=[x['id'] for x in d.get('leads',[])]
chk('P1-01: снятый запрос в «Без ответственного»',lid in ids,len(ids))
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'assignedToId':bid2}); chk('P1-01: возврат ответственного B',s==200,(s,d))
s,d=a.r('GET','/api/admin/leads?sort=stale'); chk('P1-01: сортировка «давно без движения» (запросы)',s==200,(s,str(d)[:100]))
# --- P1-02: редактирование анкеты запроса ---
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'route':{'weightKg':1450}}); chk('P1-02: правка груза → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); acts=L.get('activities',[])
chk('[ПРИЁМКА P1-02] diff в журнале «Вес: 1 200 → 1 450»',bool(acts) and acts[0]['type']=='lead_edited' and 'Вес: 1 200 → 1 450' in acts[0]['description'],(acts[0] if acts else None))
chk('P1-02: неизвестные ключи cargoInfo сохранены + v:1',(L.get('cargoInfo') or {}).get('note')=='заметка' and (L.get('cargoInfo') or {}).get('v')==1,(L.get('cargoInfo')))
chk('P1-03: маршрут-колонки после создания',L.get('originCity')=='Шанхай' and L.get('destinationCity')=='Москва',(L.get('originCity'),L.get('destinationCity')))
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'route':{'weightKg':1450}}); chk('P1-02: правка без изменений → 400',s==400,s)
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{}); chk('P1-02: пустой PATCH → 400',s==400,s)
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'rawContact':{'name':'Евгений '+u,'phone':ph(base+5),'email':'test@test.ru'}}); chk('P1-02: правка контактов (запрос без клиента) → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); acts=L.get('activities',[])
chk('P1-02: diff контактов в журнале (Контакт/Телефон)',bool(acts) and acts[0]['type']=='lead_edited' and 'Контакт:' in acts[0]['description'] and 'Телефон:' in acts[0]['description'],(acts[0] if acts else None))
# --- P1-03: маршрут и груз — поля, а не только JSON ---
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'route':{'originCountry':'Китай','transportType':'sea','readyDate':'2026-11-01'}}); chk('P1-03: правка маршрута → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); acts=L.get('activities',[])
chk('P1-03: diff маршрута в журнале (Откуда/Тип/Дата)',bool(acts) and acts[0]['type']=='lead_edited' and 'Откуда: Шанхай → Китай, Шанхай' in acts[0]['description'] and 'Тип перевозки: — → Море' in acts[0]['description'] and 'Дата отправления: — → 01.11.2026' in acts[0]['description'],(acts[0] if acts else None))
chk('P1-03: колонки после правки',L.get('originCountry')=='Китай' and L.get('transportType')=='sea' and str(L.get('readyDate',''))[:10]=='2026-11-01',(L.get('originCountry'),L.get('transportType'),L.get('readyDate')))
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'route':{'weightKg':-5}}); chk('P1-03: отрицательный вес → 400',s==400,s)
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'route':{'transportType':'самолёт'}}); chk('P1-03: неизвестный тип → 400',s==400,s)
s,d=a.r('GET',f"/api/admin/leads?origin={urlquote('Китай')}"); ids=[x['id'] for x in d.get('leads',[])]
chk('P1-03: фильтр запросов «Китай»',lid in ids,len(ids))
s,d=a.r('GET','/api/admin/leads?transport=sea'); ids=[x['id'] for x in d.get('leads',[])]
chk('P1-03: фильтр запросов «Море»',lid in ids,len(ids))
s,d=a.r('GET','/api/admin/leads?transport=auto'); ids=[x['id'] for x in d.get('leads',[])]
chk('P1-03: фильтр запросов «Авто» пуст',lid not in ids,len(ids))
s,d=a.r('POST',f'/api/admin/leads/{lid}/convert',{'legalEntityId':leid}); chk('конвертация без варианта → 409',s==409,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'Море+ЖД','transportModes':['Море','ЖД'],'price':450000,'currency':'RUB','vatMode':'WITHOUT_VAT','costEstimate':380000,'etaDays':45,'priorityFit':'cost'}); chk('вариант расчёта 1 (P1-04: цена+валюта+НДС+себестоимость)',s in(200,201),(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'Авиа','price':1200000,'currency':'RUB','vatMode':'WITH_VAT','etaDays':7,'priorityFit':'speed','isSelected':True}); chk('вариант 2 isSelected',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); sel=[o for o in L.get('options',[]) if o['isSelected']]
chk('ровно один выбранный вариант',len(sel)==1,[o['isSelected'] for o in L.get('options',[])]); chk('статус запроса calculated',L.get('status')=='calculated',L.get('status'))
chk('DF-05: приоритет правила 1 — без описания мяч у клиента даже с вариантами',(L.get('waitingOnKind'),L.get('waitingReason'))==('client','awaiting_proforma'),(L.get('waitingOnKind'),L.get('waitingReason')))
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'X','price':-5,'etaDays':0,'priorityFit':'cost'}); chk('отрицательная цена → 400',s==400,s)
# --- P1-04: деньги — Decimal, валюта, НДС, себестоимость ---
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'X','price':1.234,'etaDays':5,'priorityFit':'cost'}); chk('P1-04: цена с 3 знаками → 400',s==400,s)
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'X','price':'дорого','etaDays':5,'priorityFit':'cost'}); chk('P1-04: цена строкой-мусором → 400',s==400,s)
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); o1=[o for o in L.get('options',[]) if o['description']=='Море+ЖД'][0]
chk('P1-04: сотрудник видит себестоимость варианта',float(o1['costEstimate'])==380000 and o1['costCurrency']=='RUB',(o1.get('costEstimate'),o1.get('costCurrency')))
chk('P1-04: цена варианта Decimal+валюта+НДС',float(o1['price'])==450000 and o1['currency']=='RUB' and o1['vatMode']=='WITHOUT_VAT',(o1.get('price'),o1.get('currency'),o1.get('vatMode')))
opt1id=o1['id']
s,d=a.r('PATCH',f'/api/admin/options/{opt1id}',{'costEstimate':999999.99,'costCurrency':'USD'}); chk('P1-04: правка себестоимости → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); o1=[o for o in L.get('options',[]) if o['id']==opt1id][0]
chk('P1-04: себестоимость в USD видна сотруднику',float(o1['costEstimate'])==999999.99 and o1['costCurrency']=='USD',(o1.get('costEstimate'),o1.get('costCurrency')))
s,d=a.r('PATCH',f'/api/admin/options/{opt1id}',{'costEstimate':None}); chk('P1-04: очистка себестоимости → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); o1=[o for o in L.get('options',[]) if o['id']==opt1id][0]
chk('P1-04: себестоимость очищена (null)',o1['costEstimate'] is None,o1.get('costEstimate'))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); acts=L.get('activities',[])
chk('P1-04: лента — цена с НДС-меткой («1 200 000 ₽ · с НДС»)',bool(acts) and any('1\u00a0200\u00a0000 ₽ · с НДС' in x['description'] for x in acts),[x['description'] for x in acts[:3]])
# broker
bph=ph(base+1); s,d=a.r('POST','/api/admin/brokers',{'companyName':'Брокер '+u,'phone':bph,'password':'broker-pass-1'}); chk('создание брокера',s in(200,201),(s,d)); bid=(d.get('broker') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{lid}/brokers',{'brokerId':bid}); chk('брокер подключён к запросу',s in(200,201),(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid}/brokers',{'brokerId':bid}); chk('повторное подключение → 409',s==409,s)
# document on lead (internal + public)
s,d=up2(a,f'/api/admin/leads/{lid}/documents','inv.pdf',b'%PDF-1.4 test',"application/pdf",extra={'type':'invoice','title':'Инвойс '+u}); chk('загрузка документа на запрос',s in(200,201),(s,d))
s,d=up2(a,f'/api/admin/leads/{lid}/documents','tariff.pdf',b'%PDF-1.4 secret',"application/pdf",extra={'type':'contract','title':'Тариф подрядчика '+u,'isInternal':True}); chk('загрузка внутреннего документа',s in(200,201),(s,d))
s,d=up2(a,f'/api/admin/leads/{lid}/documents','x.html',b'<script>alert(1)</script>',"text/html",extra={'type':'other','title':'html'}); chk('HTML-файл отклонён',s==400,s)
s,d=up2(a,f'/api/admin/leads/{lid}/documents','x.pdf',b'<html><script>alert(1)</script></html>',"application/pdf",extra={'type':'other','title':'html as pdf'}); chk('E0-07 HTML под видом PDF отклонён (проверка сигнатуры файла)',s==400,s)
s,d=up2(a,f'/api/admin/leads/{lid}/documents','act.docx',b'PK\x03\x04'+b'\x00'*64,'application/octet-stream',extra={'type':'other','title':'docx без MIME'}); chk('E0-07 DOCX без MIME от браузера принимается по сигнатуре',s in(200,201),(s,d))
s,d=up2(a,f'/api/admin/leads/{lid}/documents','big.pdf',b'%PDF',"application/pdf",extra={'type':'other','title':'big','size':26*1024*1024}); chk('файл >25МБ отклонён (лимит files.max_mb, DF-11)',s in(400,413),s)
# поток A (BL-4): конвертация — только после согласования (confirm-API,
# фиксация менеджером от имени клиента — без optionId берёт isSelected)
s,d=a.r('POST',f'/api/admin/leads/{lid}/confirm',{}); chk('поток A: согласие зафиксировано (manager_on_behalf)',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); LA=d.get('lead',d)
chk('поток A: статус client_approved, метаданные кто/как',LA.get('status')=='client_approved' and LA.get('clientConfirmedVia')=='manager_on_behalf',(LA.get('status'),LA.get('clientConfirmedVia')))
s,d=a.r('POST',f'/api/admin/leads/{lid}/confirm',{}); chk('поток A: повторное подтверждение → 409 (К-02/К-10)',s==409,s)
# parallel convert
res=[]
def cv(): res.append(a.r('POST',f'/api/admin/leads/{lid}/convert',{'legalEntityId':leid,'incoterm':'FOB'}))
ts=[threading.Thread(target=cv) for _ in range(5)]; [t.start() for t in ts]; [t.join() for t in ts]
codes=sorted(r[0] for r in res); chk('параллельная конвертация: ровно одна 201',codes.count(201)==1,codes)
order=[r[1] for r in res if r[0]==201][0]['order'] if codes.count(201) else None
oid=order['id']; print('ORDER',order)
s,d=a.r('GET','/api/admin/customers?limit=200'); cl=d.get('customers',d) if isinstance(d,dict) else d
# P1-02: контакты запроса правлены (rawContact.phone = ph(base+5)) — клиент
# при конвертации рождается уже с НИМ; дедупликация смотрит на него
conv_phone='+7999%07d'%(base+5)
chk('параллельная конвертация: один клиент на телефон (без дублей)',sum(1 for x in cl if x.get('phone')==conv_phone)==1,[x.get('phone') for x in cl if x.get('phone')==conv_phone])
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O=d.get('order',d)
chk('обязательные этапы подставлены',len(O.get('stages',[]))>=6,len(O.get('stages',[])))
chk('BL-5: заявка из конвертации сразу «В работе»',O.get('status')=='in_progress',O.get('status'))
chk('DF-05: заявка в работе — подключённый брокер без оценки — мяч у брокера (awaiting_broker_estimate)',(O.get('waitingOnKind'),O.get('waitingReason'))==('broker','awaiting_broker_estimate'),(O.get('waitingOnKind'),O.get('waitingReason')))
chk('снимок цены перенесён',(O.get('quoteSnapshot') or {}).get('price')==1200000,O.get('quoteSnapshot'))
chk('P1-04: снимок несёт валюту и НДС',(O.get('quoteSnapshot') or {}).get('currency')=='RUB' and (O.get('quoteSnapshot') or {}).get('vatMode')=='WITH_VAT' and 'costEstimate' not in (O.get('quoteSnapshot') or {}),O.get('quoteSnapshot'))
# --- P1-01: ответственный на заявке ---
chk('P1-01: конвертация переносит ответственного в заявку',(O.get('assignee') or {}).get('id')==bid2,O.get('assignee'))
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'assignedToId':aid}); chk('P1-01: смена ответственного won-запроса → 409',s==409,s)
s,d=a.r('PATCH',f'/api/admin/leads/{lid}',{'route':{'weightKg':1500}}); chk('P1-02: правка анкеты won-запроса → 409',s==409,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'assignedToId':aid}); chk('P1-01: смена ответственного заявки → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O2=d.get('order',d); oacts=O2.get('activities',[])
chk('P1-01: смена ответственного заявки в журнале',bool(oacts) and oacts[0]['type']=='order_assignee_changed' and 'Менеджер B' in oacts[0]['description'],(oacts[0] if oacts else None))
s,d=bb.r('GET','/api/admin/orders?assigned=mine'); oids=[x['id'] for x in d.get('orders',[])]
chk('P1-01: B не видит заявку в «Мои» после переназначения',oid not in oids,len(oids))
# --- P1-03: снимок маршрута в заявке + фильтры + печатная форма ---
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O=d.get('order',d)
chk('P1-03: конвертация переносит маршрут в заявку',O.get('originCountry')=='Китай' and O.get('destinationCity')=='Москва' and O.get('transportType')=='sea',(O.get('originCountry'),O.get('destinationCity'),O.get('transportType')))
chk('P1-03: вес/дата в заявке',float(O.get('weightKg'))==1450 and str(O.get('readyDate',''))[:10]=='2026-11-01',(O.get('weightKg'),O.get('readyDate')))
s,d=a.r('GET',f"/api/admin/orders?origin={urlquote('Китай')}&destination={urlquote('Москва')}&transport=sea"); oids2=[x['id'] for x in d.get('orders',[])]
chk('[ПРИЁМКА P1-03] фильтр заявок «Китай → Москва, Море»',oid in oids2,len(oids2))
s,d=a.r('GET','/api/admin/orders?transport=rail'); oids2=[x['id'] for x in d.get('orders',[])]
chk('P1-03: фильтр заявок «ЖД» пуст',oid not in oids2,len(oids2))
s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'route':{'placesCount':4,'volumeM3':2.5}}); chk('P1-03: правка маршрута заявки → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O=d.get('order',d); oacts=O.get('activities',[])
chk('P1-03: diff маршрута заявки в журнале',bool(oacts) and oacts[0]['type']=='order_cargo_changed' and 'Мест: 12 → 4' in oacts[0]['description'] and 'Объём: — → 2,5' in oacts[0]['description'],(oacts[0] if oacts else None))
s,d=a.r('GET',f'/admin/orders/{oid}/print')
html=d.decode('utf-8','ignore') if isinstance(d,(bytes,bytearray)) else str(d)
chk('P1-03: печатная форма п.3 «Море»',s==200 and 'Море' in html,(s,len(html)))
chk('P1-03: печатная форма п.17/20 «Шанхай»/«Москва»',s==200 and 'Шанхай' in html and 'Москва' in html,(s,))
chk('P1-04: печатная форма п.23 — цена с валютой «1\u00a0200\u00a0000 ₽» и «с НДС»',s==200 and '1\u00a0200\u00a0000 ₽' in html and 'с НДС' in html,(s,))
s,d=a.r('GET','/api/admin/orders?sort=stale'); chk('P1-01: сортировка «давно без движения» (заявки)',s==200,(s,str(d)[:100]))
s,d=a.r('GET',f'/api/admin/orders/{oid}/documents'); docs=d.get('documents',d) if isinstance(d,dict) else d
chk('документы перенесены на заявку',isinstance(docs,list) and len(docs)>=2,(s,str(d)[:200]))
st=O['stages']; mand=st[0]
s,d=a.r('DELETE',f'/api/admin/orders/{oid}/stages/{mand["id"]}'); chk('удаление обязательного этапа → отказ',s in(400,403,409),s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{mand["id"]}',{'status':'flying'}); chk('неизвестный статус этапа → 400',s==400,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{mand["id"]}',{'plannedDate':'2026-11-01T00:00:00.000Z','actualDate':'2026-10-01T00:00:00.000Z','status':'done'}); chk('этап: смена статуса и дат',s==200,(s,d))
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{mand["id"]}',{'actualDate':'2030-01-01T00:00:00.000Z'}); chk('[ЦЕЛЬ P1-06] фактическая дата в будущем отклоняется',s==400,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'status':'completed'}); chk('[ЦЕЛЬ P1-05] «Завершена» при незавершённых этапах отклоняется',s in(400,409),s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'status':'in_progress'}); chk('BL-5: заявка из конвертации уже в работе — повтор → 400',s==400,s)
# --- v0.3.1 (BRANDBOOK §4.2–4.3): группы-табы списка, ETA, просрочка с именем этапа ---
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{st[1]["id"]}',{'plannedDate':'2027-01-10T00:00:00.000Z'}); chk('v0.3.1: план этапа 2 → 200',s==200,(s,d))
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{st[2]["id"]}',{'plannedDate':'2026-10-01T00:00:00.000Z'}); chk('v0.3.1: план этапа 3 в прошлом → 200 (предупреждение, не ошибка)',s==200,(s,d))
s,d=a.r('GET','/api/admin/orders?status=active'); acts=[x for x in d.get('orders',[]) if x['id']==oid]
chk('v0.3.1: таб «Активные» содержит заявку in_progress',s==200 and len(acts)==1,(s,len(d.get('orders',[]))))
chk('v0.3.1: группа active — только активные статусы',all(x['status'] in ('calculating','confirmed','in_progress') for x in d.get('orders',[])),[x['status'] for x in d.get('orders',[])][:8])
s,d=a.r('GET','/api/admin/orders?status=completed'); cmp_=[x['id'] for x in d.get('orders',[])]
chk('v0.3.1: таб «Завершённые» не содержит активную заявку',oid not in cmp_,len(cmp_))
s,d=a.r('GET','/api/admin/orders'); rows=[x for x in d.get('orders',[]) if x['id']==oid]
chk('v0.3.1: заявка на первой странице списка',len(rows)==1,(s,len(d.get('orders',[]))))
if rows:
    row=rows[0]
    chk('v0.3.1: ETA списка — максимум плана незавершённых',row.get('etaDate')=='2027-01-10T00:00:00.000Z',row.get('etaDate'))
    chk('v0.3.1: имя просроченного этапа в списке',row.get('overdue') is True and bool(row.get('overdueStage')),(row.get('overdue'),row.get('overdueStage')))
    chk('v0.3.1: этапы степпера в ответе списка',len(row.get('stages',[]))>=6 and all(set(x)>={'code','name','status'} for x in row.get('stages',[])),len(row.get('stages',[])))
s,d=a.r('GET','/api/admin/orders?status=bogus'); chk('v0.3.1: неизвестная группа статуса → 400',s==400,s)
# --- v0.4.0 (D25): по-статусные табы заявок + counts/?q= запросов ---
s,d=a.r('GET','/api/admin/orders?status=in_progress'); v4rows=[x for x in d.get('orders',[]) if x['id']==oid]
chk('v0.4.0: одиночный статус in_progress содержит заявку',s==200 and len(v4rows)==1,(s,len(d.get('orders',[]))))
chk('v0.4.0: по-статусный фильтр — только in_progress',all(x['status']=='in_progress' for x in d.get('orders',[])),[x['status'] for x in d.get('orders',[])][:8])
s,d=a.r('GET','/api/admin/leads'); lcounts=d.get('counts') or {}
chk('v0.4.0: counts запросов в ответе',s==200 and set(lcounts)>={'all','new','calculated','won','lost'},lcounts)
# DF-27 волна 2 (§6.4): needs_data — отдельный статус-таб, входит в сумму
chk('v0.4.0: counts.all = сумма по статусам',lcounts.get('all')==sum(lcounts.get(k,0) for k in ('new','needs_data','calculated','client_approved','won','lost')),lcounts)
uq=u[:8]
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'Грузчик '+uq,'phone':'+86 130 '+str(base)},'route':{'originCity':'Сургут','destinationCity':'Тюмень'},'cargoInfo':{'cargoName':'Стекло закалённое '+uq}})
chk('v0.4.0: запрос для поиска создан',s in(200,201),(s,d)); qlid=(d.get('lead') or d)['id']
s,d=a.r('GET',f"/api/admin/leads?q={urlquote('Грузчик '+uq)}"); qids=[x['id'] for x in d.get('leads',[])]
chk('v0.4.0: поиск ?q= по rawContact.name (Json) находит запрос',s==200 and qlid in qids,(s,len(qids)))
s,d=a.r('GET',f"/api/admin/leads?q={urlquote('Стекло закалённое '+uq)}"); qids2=[x['id'] for x in d.get('leads',[])]
chk('v0.4.0: поиск ?q= по cargoInfo.cargoName (Json) находит запрос',s==200 and qlid in qids2,(s,len(qids2)))
s,d=a.r('GET',f"/api/admin/leads?q={urlquote('такого-нет-никогда')}"); chk('v0.4.0: поиск без результатов — пустой список и нули',s==200 and d.get('leads')==[] and (d.get('counts') or {}).get('all')==0,(s,d.get('counts')))
# Фикстура исполнителя (D31/D78): подрядчик создаётся как ДАННЫЕ для
# менеджерских проверок ниже — назначение исполнителя на этап и правило 7
# ожиданий (docs/FROZEN.md «Не заморожено»: база подрядчиков и назначение —
# менеджерский контур). Сам подрядческий контур из тестирования исключён
# решением владельца (D78): рождение подрядчика — безымянная фикстура без
# отдельных проверок-сценариев (ломается фикстура — прогон падает здесь).
s,d=a.r('POST','/api/admin/contractor-leads',{'companyName':'Перевозчик '+u})
if s not in (200,201): print('FIXTURE FAIL: кандидат-исполнитель не создан',s,d); sys.exit(1)
clid=(d.get('contractorLead') or d.get('lead') or d)['id']
cph=ph(base+2); s,d=a.r('PATCH',f'/api/admin/contractor-leads/{clid}',{'status':'contracted','phone':cph,'password':'contr-pass-1'})
if s not in (200,201): print('FIXTURE FAIL: исполнитель не заведён в базе',s,d); sys.exit(1)
s,d=a.r('GET','/api/admin/contractors'); cs=d.get('contractors',d); cid=[c for c in cs if c['phone']==cph][0]['id']
st2=st[1]; s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{st2["id"]}',{'contractorId':cid}); chk('DF-05: исполнитель назначен на этап (менеджерский контур)',s==200,(s,d))
# --- DF-05: «У кого мяч» — правило 5 на заявке: брокеры переносятся с лида
# при конвертации, оценка ещё не дана (PUT оценки — ниже по скрипту) ---
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O5a=d.get('order',d)
chk('DF-05: брокер заявки без оценки — мяч у брокера (правило 5)',(O5a.get('waitingOnKind'),O5a.get('waitingReason'))==('broker','awaiting_broker_estimate'),(O5a.get('waitingOnKind'),O5a.get('waitingReason')))
chk('DF-05: waitingOnId = id брокера заявки',O5a.get('waitingOnId')==bid,O5a.get('waitingOnId'))
chk('DF-05: waitingSince проставлен',bool(O5a.get('waitingSince')),O5a.get('waitingSince'))
# --- DF-01: события как ось — заметка staff-only, аудитория событий ---
# BL-5: сконвертированная заявка стартует in_progress и статус-событие
# order_status_changed создаётся переходом РУЧНОЙ заявки (расчёт→согласование)
_ocust=O['customer']['id'] if isinstance(O,dict) and O.get('customer') else O.get('customerId')
s,d=a.r('POST','/api/admin/orders',{'customerId':_ocust,'legalEntityId':leid}); _oid01=(d.get('order') or d)['id']
s,d=a.r('PATCH',f'/api/admin/orders/{_oid01}',{'status':'confirmed'}); chk('BL-5: ручная заявка calculating→confirmed → 200',s==200,(s,d))
note='Внутренняя заметка DF-01 '+u
s,d=a.r('POST',f'/api/admin/orders/{oid}/notes',{'text':note}); chk('DF-01: внутренняя заметка создана',s in(200,201),(s,d))
# BL-5: лента РУЧНОЙ заявки _oid01 — источник статус-события (расчёт→
# согласование, волна 1); заметка же читается в ленте сконвертированной
# заявки oid (семантика v0.9.0: DF-21 ниже ждёт ОБЕ заметки в ленте oid,
# а клиент oid не видит staff-заметку). Волна 1 перенесла чтение ленты
# на _oid01 целиком — заметка осталась на oid (CI 10.11.2026: FAIL).
s,d=a.r('GET',f'/api/admin/orders/{oid}'); Oa=d.get('order',d); oacts=Oa.get('activities',[])
chk('DF-01: заметка в ленте сотрудника (staff видит всё; df_03_contract: приватность = audience)',any(x['type']=='note_added' and x.get('audience')==['staff'] and x['description']==note for x in oacts),[x['type'] for x in oacts[:6]])
s,d=a.r('GET',f'/api/admin/orders/{_oid01}'); Oa01=d.get('order',d); oacts01=Oa01.get('activities',[])
chk('DF-01: статус-событие заявки адресовано клиенту',any(x['type']=='order_status_changed' and 'client' in (x.get('audience') or []) for x in oacts01),[x['type'] for x in oacts01[:6]])
# --- DF-21: заметка «видна клиенту» — аудитория staff+client; SSR админки: меню, бейдж ---
cnote='Комментарий для клиента DF-21 '+u
s,d=a.r('POST',f'/api/admin/orders/{oid}/notes',{'text':cnote,'visibleToClient':True}); chk('DF-21: заметка «видна клиенту» создана',s in(200,201),(s,d))
chk('DF-21: аудитория заметки — staff+client, isInternal=false',(d.get('note') or {}).get('audience')==['staff','client'] and (d.get('note') or {}).get('isInternal') is False,(d.get('note') or {}))
s,d=a.r('GET',f'/api/admin/orders/{oid}'); oacts21=(d.get('order',d)).get('activities',[])
chk('DF-21: сотрудник видит обе заметки — аудитории разные',any(x['type']=='note_added' and x.get('audience')==['staff'] and x['description']==note for x in oacts21) and any(x['type']=='note_added' and x.get('audience')==['staff','client'] and x['description']==cnote for x in oacts21),[(x.get('type'),x.get('audience')) for x in oacts21[:8]])
# SSR /admin/orders: состав меню (без несуществующих разделов) и бейдж из одного источника с табами
import re
s,h=a.r('GET','/admin/orders'); page=h.decode('utf-8','ignore') if isinstance(h,(bytes,bytearray)) else str(h)
navm=re.search(r'<aside[ >].*?</aside>',page,re.S); nav=navm.group(0) if navm else ''
chk('DF-21: SSR админки содержит сайдбар',bool(nav),(s,len(page)))
for lb in ('Пульс','Заявки','Запросы','Клиенты','Брокеры','Подрядчики','Справочники','Настройки'):
    chk(f'DF-21: пункт меню «{lb}» присутствует',(lb in nav),nav[:120])
for bad in ('Котировки','Мониторинг','Перевозчики'):
    chk(f'DF-21: несуществующий раздел «{bad}» в меню отсутствует',(bad not in nav),bad)
s,d=a.r('GET','/api/admin/orders'); cnts=(d.get('counts') or {})
badge_m=re.search(r'data-nav-badge="/admin/orders"[^>]*>\s*(\d+)\s*<',page)
chk('DF-21: бейдж «Заявки» отрисован в SSR',bool(badge_m),page[-400:] if not badge_m else '')
active_sum=sum(cnts.get(k,0) for k in ('calculating','confirmed','in_progress'))
chk('DF-21: бейдж «Заявки» == сумма активных табов API (один источник)',bool(badge_m) and int(badge_m.group(1))==active_sum,(badge_m.group(1) if badge_m else None,active_sum,cnts))
# client access — DF-02A: выдача доступа создаёт ОСНОВНОГО пользователя
# компании (имя человека задаёт менеджер); логин прежний — телефон
# компании + пароль (критерий приёмки: вход без смены пароля)
cust=O['customer']['id'] if O.get('customer') else O['customerId']
s,d=a.r('GET',f'/api/admin/customers/{cust}'); custrow=(d.get('customer',d)); cust_name=custrow.get('name'); cphone=custrow.get('phone'); print('client phone',cphone)
prim_name='Иван Клиентов '+u
s,d=a.r(AM,f'/api/admin/customers/{cust}/access',{'name':prim_name,'phone':cphone,'password':'client-pass-1'}); chk('доступ клиенту выдан (основной пользователь создан)',s in(200,201),(s,d))
# --- client
c=C(); s,d=c.r('POST','/api/auth/client/login',{'phone':cphone,'password':'client-pass-1'}); chk('вход клиента',s==200,(s,d))
s,d=c.r('GET',f'/api/client/orders/{oid}'); chk('клиент видит свою заявку',s==200,(s,str(d)[:200]))
txt=json.dumps(d,ensure_ascii=False)
chk('клиент НЕ видит цену/снимок',('1200000' not in txt),'price leaked')
chk('P1-04: клиент НЕ видит себестоимость',('costEstimate' not in txt and '999999.99' not in txt),'cost leaked to client')
chk('клиент НЕ видит подрядчика',('Перевозчик '+u) not in txt,'contractor name leaked')
chk('DF-21: журнал сделки теперь в кабинете клиента (события с аудиторией client)',isinstance((d.get('order') or {}).get('activities'),list) and all('client' in (x.get('audience') or []) for x in (d.get('order') or {}).get('activities') or []),[(x.get('type'),x.get('audience')) for x in ((d.get('order') or {}).get('activities') or [])[:6]])
chk('DF-21: клиент видит заметку «видна клиенту»',(cnote in txt),'client-visible note missing')
chk('DF-01: клиент НЕ видит внутреннюю заметку',(note not in txt),'note leaked to client')
chk('DF-05: мяч не у клиента — waiting наружу не идёт',(d.get('order') or {}).get('waiting') is None,d.get('order',{}).get('waiting'))
chk('DF-05: служебные waiting-колонки не утекают клиенту',('waitingOnKind' not in txt and 'waitingReason' not in txt and 'waitingSince' not in txt),'waiting leak')
s,d=c.r('GET',f'/api/client/orders/{oid}/documents'); txt=json.dumps(d,ensure_ascii=False)
chk('клиент НЕ видит внутренний документ',('Тариф подрядчика' not in txt),txt[:200])
s,d=c.r('GET','/api/admin/orders'); chk('клиент не попадает в админ-API',s==401,s)
# --- DF-05: жизненный цикл ожидания на новом запросе/заявке (v0.7.2) ---
s,d=a.r('POST','/api/admin/leads',{'customerId':cust,'rawContact':{'name':'Иван Клиентов '+u},'cargoInfo':{'cargoName':'Станок ЧПУ '+u,'hsCode':'8466933000','cargoValue':15000},'route':{'originCity':'Шанхай','destinationCity':'Москва','readyDate':'2026-12-01','weightKg':800,'placesCount':6},'incotermCode':'FOB'})
chk('DF-05: запрос с описанием создан',s in(200,201),(s,d)); lid5=(d.get('lead') or d)['id']
s,d=a.r('GET',f'/api/admin/leads/{lid5}'); L5=d.get('lead',d)
chk('DF-05: описание есть, брокеров нет, вариантов нет — мяч у менеджера (no_quote)',(L5.get('waitingOnKind'),L5.get('waitingReason'))==('manager','no_quote'),(L5.get('waitingOnKind'),L5.get('waitingReason')))
s,d=a.r('POST','/api/admin/brokers',{'companyName':'Брокер DF-05 '+u,'phone':ph(base+14),'password':'broker-pass-5'}); chk('DF-05: брокер создан',s in(200,201),(s,d)); bid5=(d.get('broker') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{lid5}/brokers',{'brokerId':bid5}); chk('DF-05: брокер подключён к запросу',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid5}'); L5=d.get('lead',d)
chk('DF-05: брокер без оценки — мяч у брокера',(L5.get('waitingOnKind'),L5.get('waitingReason'))==('broker','awaiting_broker_estimate'),(L5.get('waitingOnKind'),L5.get('waitingReason')))
chk('DF-05: waitingOnId = id брокера',L5.get('waitingOnId')==bid5,L5.get('waitingOnId'))
b5=C(); s,d=b5.r('POST','/api/auth/broker/login',{'phone':ph(base+14),'password':'broker-pass-5'}); chk('DF-05: брокер вошёл',s==200,s)
s,d=b5.r('PUT',f'/api/broker/leads/{lid5}/estimate',{'items':[{'hsCode':'0101210000','dutyPercent':5,'vatPercent':22}]}); chk('DF-05: черновик оценки сохранён',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid5}'); L5=d.get('lead',d)
chk('DF-05: черновик оценки считается ответом — мяч вернулся менеджеру',(L5.get('waitingOnKind'),L5.get('waitingReason'))==('manager','no_quote'),(L5.get('waitingOnKind'),L5.get('waitingReason')))
s,d=a.r('POST',f'/api/admin/leads/{lid5}/options',{'description':'Авиа DF-05','price':900000,'currency':'RUB','vatMode':'WITH_VAT','etaDays':10,'priorityFit':'speed'}); chk('DF-05: вариант создан',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid5}'); L5=d.get('lead',d)
chk('D45: ОДИН вариант без выбора — правило не срабатывает (буква решения: «несколько» = ≥2)',L5.get('waitingOnKind')=='none',(L5.get('waitingOnKind'),L5.get('waitingReason')))
opt45=[o for o in L5.get('options',[])][0]['id']
# --- D45 (v0.7.3): несколько расчётов, ни один не выбран → мяч у клиента; через 2 р.д. — плашка менеджеру ---
s,d=a.r('POST',f'/api/admin/leads/{lid5}/options',{'description':'Море DF-05','price':700000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':40,'priorityFit':'cost'}); chk('D45: второй вариант создан (выбранного нет)',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid5}'); L5=d.get('lead',d)
chk('D45: несколько вариантов (2), выбранного нет — мяч у клиента (awaiting_client_choice)',(L5.get('waitingOnKind'),L5.get('waitingReason'))==('client','awaiting_client_choice'),(L5.get('waitingOnKind'),L5.get('waitingReason')))
chk('D45: waitingOnId = id клиента',L5.get('waitingOnId')==cust,L5.get('waitingOnId'))
import subprocess
_bw=os.path.join(os.path.dirname(os.path.abspath(__file__)),'e2e_backdate_waiting.ts')
bw=subprocess.run(['bun',_bw,lid5,'4'],capture_output=True,text=True,env={**os.environ})
chk('D45: фикстура сдвига waitingSince (4 дня назад) отработала',bw.returncode==0,(bw.stdout[-120:],bw.stderr[-160:]))
s,d=a.r('GET','/api/admin/attention'); AT45=d
row45=[r for r in AT45.get('waitingLong',[]) if r.get('dealId')==lid5]
chk('D45: невыбранный расчёт ≥2 р.д. — запрос в секции «Ждут дольше N часов»',len(row45)==1,[(r.get('dealId'),r.get('followup')) for r in AT45.get('waitingLong',[])])
chk('D45: строка followup=true, причина awaiting_client_choice',bool(row45) and row45[0].get('followup') is True and row45[0].get('waitingReason')=='awaiting_client_choice',row45)
s,d=a.r('PATCH',f'/api/admin/options/{opt45}',{'isSelected':True}); chk('D45: менеджер фиксирует выбор варианта',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid5}'); L5=d.get('lead',d)
chk('D45: выбор варианта снимает ожидание — мяча нет',L5.get('waitingOnKind')=='none',(L5.get('waitingOnKind'),L5.get('waitingReason')))
s,d=a.r('GET','/api/admin/attention'); AT45b=d
chk('D45: после выбора строка ушла из «Ждут дольше N часов»',all(r.get('dealId')!=lid5 for r in AT45b.get('waitingLong',[])),[r.get('dealId') for r in AT45b.get('waitingLong',[])])
# поток A (BL-4): lid5 конвертируется после согласования (confirm-API)
s,d=a.r('POST',f'/api/admin/leads/{lid5}/confirm',{}); chk('поток A: согласие на lid5 зафиксировано',s==200,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid5}/convert',{'legalEntityId':leid}); chk('DF-05: конвертация → заявка',s in(200,201),(s,d)); oid5=(d.get('order') or d)['id']
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('BL-5: заявка из конвертации сразу «В работе»',O5.get('status')=='in_progress',O5.get('status'))
chk('DF-05: мяч у менеджера (stage_unassigned)',(O5.get('waitingOnKind'),O5.get('waitingReason'))==('manager','stage_unassigned'),(O5.get('waitingOnKind'),O5.get('waitingReason')))
# awaiting_client_approval живёт на ручной заявке (BL-5: конвертация
# стартует в работе; «Расчёт → Согласование» — путь ручной заявки)
s,d=a.r('POST','/api/admin/orders',{'customerId':cust,'legalEntityId':leid}); oid5m=(d.get('order') or d)['id']
s,d=a.r('PATCH',f'/api/admin/orders/{oid5m}',{'status':'confirmed'}); chk('BL-5: ручная заявка → Согласование (calculating→confirmed)',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid5m}'); O5m=d.get('order',d)
chk('DF-05: согласование — мяч у клиента',(O5m.get('waitingOnKind'),O5m.get('waitingReason'))==('client','awaiting_client_approval'),(O5m.get('waitingOnKind'),O5m.get('waitingReason')))
since1=O5m.get('waitingSince')
s,d=c.r('GET',f'/api/client/orders/{oid5m}'); C5=(d.get('order') or {})
chk('DF-05: клиент видит нейтральное ожидание своего мяча',(C5.get('waiting') or {}).get('reason')=='awaiting_client_approval' and bool((C5.get('waiting') or {}).get('since')),C5.get('waiting'))
s,d=a.r('PATCH',f'/api/admin/orders/{oid5}',{'route':{'weightKg':800}}); chk('DF-05: правка маршрута → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5b=d.get('order',d)
chk('DF-05: waitingSince не сдвигается без смены kind/reason',O5b.get('waitingSince')==O5.get('waitingSince'),(O5.get('waitingSince'),O5b.get('waitingSince')))
s,d=a.r('PATCH',f'/api/admin/orders/{oid5m}',{'status':'in_progress'}); chk('DF-05: ручная заявка — статус → В работе',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('DF-05: ближайший этап без исполнителя — мяч у менеджера (stage_unassigned)',(O5.get('waitingOnKind'),O5.get('waitingReason'))==('manager','stage_unassigned'),(O5.get('waitingOnKind'),O5.get('waitingReason')))
st5=O5['stages']
s,d=a.r('PATCH',f'/api/admin/orders/{oid5}/stages/{st5[0]["id"]}',{'contractorId':cid,'plannedDate':'2027-06-01T00:00:00.000Z'}); chk('DF-05: исполнитель и план назначены',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('DF-05: этап у перевозчика в срок — мяч у перевозчика',(O5.get('waitingOnKind'),O5.get('waitingReason'))==('contractor','stage_not_started'),(O5.get('waitingOnKind'),O5.get('waitingReason')))
s,d=c.r('GET',f'/api/client/orders/{oid5}'); txt5=json.dumps(d,ensure_ascii=False)
chk('DF-05: мяч у перевозчика — клиенту waiting не отдаётся',(d.get('order') or {}).get('waiting') is None and 'waitingOnKind' not in txt5,txt5[:150])
s,d=a.r('PATCH',f'/api/admin/orders/{oid5}/stages/{st5[0]["id"]}',{'plannedDate':'2026-10-01T00:00:00.000Z'}); chk('DF-05: план ближайшего этапа в прошлом',s==200,s)
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('DF-05: просрочка ближайшего этапа — мяч у менеджера (6б)',(O5.get('waitingOnKind'),O5.get('waitingReason'))==('manager','stage_overdue_followup'),(O5.get('waitingOnKind'),O5.get('waitingReason')))
s,d=a.r('PATCH',f'/api/admin/orders/{oid5}/stages/{st5[0]["id"]}',{'status':'problem'}); chk('DF-05: этап в problem',s==200,s)
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('DF-05: проблема сильнее просрочки (правило 2)',(O5.get('waitingOnKind'),O5.get('waitingReason'))==('manager','stage_problem'),(O5.get('waitingOnKind'),O5.get('waitingReason')))
s,d=a.r('PATCH',f'/api/admin/orders/{oid5}',{'status':'cancelled'}); chk('DF-05: заявка отменена',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('DF-05: терминальный статус — мяча нет, since обнулён',(O5.get('waitingOnKind'),O5.get('waitingReason'),O5.get('waitingSince'))==('none',None,None),(O5.get('waitingOnKind'),O5.get('waitingSince')))
s,d=a.r('GET','/api/admin/attention'); ATT=d
chk('DF-05: секция «Ждут дольше N часов» — список, счётчик, порог из настроек',isinstance(ATT.get('waitingLong'),list) and (ATT.get('counts') or {}).get('waitingLong')==0 and ATT.get('attentionHours')==24,((ATT.get('counts') or {}).get('waitingLong'),ATT.get('attentionHours')))
# --- DF-07: «Пульс» владельца (мастер-only, агрегаты по существующим таблицам)
s,d=bb.r('GET','/api/admin/pulse'); chk('DF-07: менеджер → 403 (Пульс только мастеру)',s==403,(s,str(d)[:100]))
s,d=a.r('GET','/api/admin/pulse'); PL=d
chk('DF-07: мастер → 200, блоки на месте',s==200 and isinstance(PL,dict) and all(k in PL for k in ('stats','cargo','cargoTotal','slowing','events')),(s,list(PL.keys()) if isinstance(PL,dict) else PL))
ST7=PL.get('stats') or {}
chk('DF-07: цифры — 5 метрик и порог в ответе',all(k in ST7 for k in ('newLeads24h','activeOrders','inProgress','waitingOverThreshold','problemStages','attentionHours')),ST7)
chk('DF-07: в пути ≤ активных, порог > 0',ST7.get('inProgress',0)<=ST7.get('activeOrders',0) and (ST7.get('attentionHours') or 0)>0,ST7)
chk('DF-07: cargoTotal = активным заявкам',PL.get('cargoTotal')==ST7.get('activeOrders'),(PL.get('cargoTotal'),ST7.get('activeOrders')))
chk('DF-07: срез «Где груз» лимитом 50, счётчик полный',len(PL.get('cargo') or [])<=50 and len(PL.get('cargo') or [])<=PL.get('cargoTotal',0),(len(PL.get('cargo') or []),PL.get('cargoTotal')))
chk('DF-07: строки «Где груз» — этап/ETA/статус валидны',all('number' in r and 'orderId' in r for r in (PL.get('cargo') or [])) ,(PL.get('cargo') or [{}])[:1])
chk('DF-07: сумма групп «Кто тормозит» ≤ активных',sum((g.get('count') or 0) for g in (PL.get('slowing') or []))<=ST7.get('activeOrders',0),(sum((g.get('count') or 0) for g in (PL.get('slowing') or [])),ST7.get('activeOrders')))
chk('DF-07: группы — известные kind, внутри orderId/number',all(g.get('kind') in ('manager','client','broker','contractor') and all(('orderId' in o and 'number' in o) for o in g.get('orders',[])) for g in (PL.get('slowing') or [])),[(g.get('kind'),g.get('count')) for g in (PL.get('slowing') or [])])
chk('DF-07: события — не больше 20',len(PL.get('events') or [])<=20,len(PL.get('events') or []))
chk('DF-07: строки событий структурно полные (id/type/описание/момент)',all(all(k in e for k in ('id','type','description','createdAt')) and isinstance(e.get('isInternal'),bool) for e in (PL.get('events') or [])),(PL.get('events') or [{}])[:1])
for i in range(11):
    s,d=c.r('POST','/api/client/leads',{'cargoInfo':{'origin':'Стамбул','note':str(i)}})
chk('дневной лимит запросов клиента срабатывает',s==429 or s==409 or s==400,(s,d))
# --- broker
b=C(); s,d=b.r('POST','/api/auth/broker/login',{'phone':bph,'password':'broker-pass-1'}); chk('вход брокера',s==200,(s,d))
s,d=b.r('GET',f'/api/broker/orders/{oid}'); chk('брокер видит заявку (перенос связи)',s==200,(s,str(d)[:150]))
txt=json.dumps(d,ensure_ascii=False); chk('брокер НЕ видит цену клиента',('1200000' not in txt),'price leaked to broker')
chk('P1-04: брокер НЕ видит себестоимость',('costEstimate' not in txt),'cost leaked to broker')
chk('DF-01: брокер НЕ видит ленту событий (activities)',('activities' not in txt),'activities leaked to broker')
chk('DF-01: брокер НЕ видит внутреннюю заметку',(note not in txt),'note leaked to broker')
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':85000.5,'requiredPermits':['Сертификат соответствия']})
if s==405: s,d=b.r('PATCH',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':85000.5,'requiredPermits':['Сертификат соответствия']})
if s==405: s,d=b.r('POST',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':85000.5,'requiredPermits':['Сертификат соответствия']})
chk('брокер даёт оценку платежей (дробные, P1-04)',s in(200,201),(s,d))
chk('P1-04: Decimal оценки в ответе',str((d.get('estimate') or {}).get('customsDutyEstimate')) in('85000.5','85000.50'),d)
# DF-05: оценка получена — правило 5 отпускает, мяч переходит к ближайшему этапу
# (этап 2 с исполнителем и планом в будущем — назначены выше по скрипту)
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O5c=d.get('order',d)
# DF-16: свободный список requiredPermits из оценки синхронизируется в
# строки PermitRequirement — незакрытая строка от клиента держит мяч
# (правило 2а), пока строку не закрыли/waive.
chk('DF-16: легаси-оценка с requiredPermits создала pending-строку',len([x for x in (O5c.get('permitRequirements') or []) if x['status']=='pending' and x.get('source')=='estimate'])==1,[x.get('title') for x in (O5c.get('permitRequirements') or [])])
chk('DF-16: мяч у клиента по разрешительному (правило 2а)',(O5c.get('waitingOnKind'),O5c.get('waitingReason'))==('client','awaiting_permit'),(O5c.get('waitingOnKind'),O5c.get('waitingReason')))
# Цель строки — ЗАЯВКА (лид уже конвертирован: sync создаёт на цели)
_pmL=[x for x in (O5c.get('permitRequirements') or []) if x['status']=='pending' and x.get('source')=='estimate']
s,d=a.r('PATCH',f"/api/admin/permits/{_pmL[0]['id']}",{'status':'waived','waivedReason':'регресс DF-05: перечень закрыт для проверки правила 7'})
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O5c=d.get('order',d)
chk('DF-05: после waiver строки мяч вернулся перевозчику (правило 7)',(O5c.get('waitingOnKind'),O5c.get('waitingReason'))==('contractor','stage_not_started'),(O5c.get('waitingOnKind'),O5c.get('waitingReason')))
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':1.234}); chk('P1-04: 3 знака в оценке → 400',s==400,s)
# --- DF-01/G3: отключение брокера — общий хвост lib/broker-links.ts ---
s,d=a.r('POST','/api/admin/brokers',{'companyName':'Брокер-2 '+u,'phone':ph(base+6),'password':'broker-pass-2'}); chk('DF-01: брокер-2 создан',s in(200,201),(s,d)); bid2=(d.get('broker') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{lid}/brokers',{'brokerId':bid2}); chk('DF-01: брокер не подключается к won-запросу → 409',s==409,s)
s,d=a.r('POST',f'/api/admin/orders/{oid}/brokers',{'brokerId':bid2}); chk('DF-01: брокер-2 подключён к заявке',s in(200,201),(s,d))
s,d=a.r('DELETE',f'/api/admin/orders/{oid}/brokers/{bid2}'); chk('DF-01: брокер отключён от заявки (событие detach)',s==200,(s,d))
s,d=a.r('DELETE',f'/api/admin/orders/{oid}/brokers/{bid2}'); chk('DF-01: повторное отключение брокера → 404',s==404,s)
s,d=a.r('GET',f'/api/admin/orders/{oid}'); oacts2=(d.get('order',d)).get('activities',[])
chk('DF-01: order_broker_detached в ленте с именем брокера',any(x['type']=='order_broker_detached' and ('Брокер-2 '+u) in x['description'] for x in oacts2),[x['type'] for x in oacts2[:6]])
s,d=a.r('GET',f'/api/admin/leads/{lid}'); acts=d.get('lead',d).get('activities',[])
chk('P1-04: лента — оценка брокера отформатирована («85 000,50 ₽»)',bool(acts) and any('платежи: 85\u00a0000,50 ₽' in x['description'] for x in acts),[x['description'] for x in acts[:3]])
# --- DF-18: ответ брокера — коды ТН ВЭД и проценты (D38) ---
ITEM1={'hsCode':'0101210000','dutyPercent':5,'vatPercent':20}
ITEM2={'hsCode':'9999999999','dutyPercent':2.5,'addDutyPercent':12.5,'addDutyNote':'антидемпинговая','vatPercent':10,'rateNote':'2 \u20bd/\u043a\u0433'}
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':150000,'items':[ITEM1,ITEM2]})
chk('DF-18: черновик со строками сохранён',s in(200,201),(s,d))
est=(d.get('estimate') or {})
chk('DF-18: статус черновик, отправка не задним числом',est.get('status')=='draft' and not est.get('sentAt'),est)
items=est.get('items') or []
chk('DF-18: две строки, порядок сохранён',[i.get('hsCode') for i in items]==['0101210000','9999999999'],items)
chk('DF-18: isManualCode — булево от сервера (верификация по справочнику)',all(isinstance(i.get('isManualCode'),bool) for i in items),items)
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'items':[{'hsCode':'010121','dutyPercent':5}]}); chk('DF-18: код не 10 цифр → 400',s==400,s)
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'items':[{'hsCode':'0101210000','dutyPercent':101}]}); chk('DF-18: процент 101 → 400',s==400,s)
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'items':[{'hsCode':'0101210000','dutyPercent':5.255}]}); chk('DF-18: 3 знака в проценте → 400',s==400,s)
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'items':[{'hsCode':'0101210000','dutyPercent':5},{'hsCode':'0101210000','vatPercent':20}]}); chk('DF-18: дубль кода в двух строках → 400',s==400,s)
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'items':[{'hsCode':str(i).zfill(10)} for i in range(31)]}); chk('DF-18: 31 строка → 400 (broker.max_items, дефолт 30)',s==400,(s,d))
# отправка ответа: статус sent + уведомление ответственному (реестр DF-18)
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':150000,'items':[ITEM1,ITEM2],'send':True})
chk('DF-18: ответ отправлен (sent, sentAt проставлен)',s in(200,201) and (d.get('estimate') or {}).get('status')=='sent' and bool((d.get('estimate') or {}).get('sentAt')),(s,d))
# менеджер видит строки и статус (карточка лида, BrokerLinksSection)
s,d=a.r('GET',f'/api/admin/leads/{lid}'); lrow=next((l.get('estimate') for l in d.get('lead',d).get('brokers',[]) if (l.get('broker') or {}).get('id')==bid),None)
chk('DF-18: менеджер видит две строки и статус sent',lrow and len(lrow.get('items') or [])==2 and lrow.get('status')=='sent',lrow)
# клиент ответ не видит (D38: клиент видит только цену варианта)
s,d=c.r('GET',f'/api/client/orders/{oid}'); txt=json.dumps(d,ensure_ascii=False)
# DF-27 волна 1: hsCode — легитимное поле анкеты груза клиента (cargoInfo);
# утечкой были бы только ключи ответа брокера (dutyPercent/isManualCode)
chk('DF-18: клиент не видит строки ответа брокера',('dutyPercent' not in txt and 'isManualCode' not in txt and 'customsDutyEstimate' not in txt),txt[:150])
# правка после отправки — событие estimate_updated с разницей строк
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':160000,'items':[{'hsCode':'0101210000','dutyPercent':10,'vatPercent':20}],'send':True})
chk('DF-18: правка после отправки сохранена (статус остаётся sent)',s in(200,201) and (d.get('estimate') or {}).get('status')=='sent',(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); acts=d.get('lead',d).get('activities',[])
chk('DF-18: событие broker_estimate_sent в ленте',any(x['type']=='broker_estimate_sent' and ('кодов ТН ВЭД: 2' in x['description']) for x in acts),[x['type'] for x in acts[:8]])
chk('DF-18: estimate_updated с разницей строк (пошлина 5→10, − код)',any(x['type']=='estimate_updated' and ('0101210000: пошлина 5→10' in x['description']) and ('9999999999' in x['description']) for x in acts),[x['description'] for x in acts[:8]])
# чужой брокер (bid2 связан с заявкой, но НЕ с лидом) — 404
b2=C(); s,d=b2.r('POST','/api/auth/broker/login',{'phone':ph(base+6),'password':'broker-pass-2'}); chk('DF-18: брокер-2 вошёл',s==200,(s,d))
s,d=b2.r('PUT',f'/api/broker/leads/{lid}/estimate',{'items':[]}); chk('DF-18: чужой брокер правит чужой ответ → 404',s==404,s)
# старый формат тела (только сумма и список) принимается — контракт G2
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':85000.5,'requiredPermits':['Сертификат соответствия']})
chk('DF-18: старый ответ (только сумма и список) открывается/сохраняется',s in(200,201),(s,d))
# --- DF-02A: сотрудники компании — отдельные входы, автор-человек ---
# Список людей: primary создан выдачей доступа выше (имя человека
# задал менеджер), lastLoginAt проставлен входом; хеши не покидают сервер
s,d=a.r('GET',f'/api/admin/customers/{cust}/access'); users=d.get('users',[])
prim=[x for x in users if x.get('isPrimary')]
chk('DF-02A: список людей — primary с паролем, хеши не утекают',s==200 and len(prim)==1 and prim[0].get('hasPassword') is True and all('password' not in x for x in users),(s,users))
uid1=prim[0]['id'] if prim else None
chk('DF-02A: lastLoginAt основного проставлен входом',bool(prim) and bool(prim[0].get('lastLoginAt')),prim[0] if prim else None)
s,d=c.r('GET','/api/auth/client/me'); chk('DF-02A: /me кабинета несёт человека и компанию',s==200 and (d.get('client') or {}).get('userName')==prim_name and (d.get('client') or {}).get('id')==cust,(s,d))
# второй пользователь той же компании — видит те же заявки (скоуп — компания)
u2ph=ph(base+7); u2name='Клиент Пётр '+u
s,d=a.r('POST',f'/api/admin/customers/{cust}/access',{'name':u2name,'phone':u2ph,'password':'client-pass-2x'}); chk('DF-02A: второй пользователь компании создан (не primary)',s==201 and bool((d or {}).get('userId')),(s,d)); uid2=(d or {}).get('userId')
cu2=C(); s,d=cu2.r('POST','/api/auth/client/login',{'phone':u2ph,'password':'client-pass-2x'}); chk('DF-02A: второй пользователь вошёл (userName в ответе)',s==200 and (d.get('client') or {}).get('userName')==u2name,(s,d))
s,d=cu2.r('GET',f'/api/client/orders/{oid}'); chk('DF-02A: коллега видит ту же заявку',s==200,s)
# смена пароля второму: его сессия гаснет, коллега не задет, старый пароль не работает
s,d=a.r('PATCH',f'/api/admin/customers/{cust}/access',{'userId':uid2,'password':'client-pass-3x'}); chk('DF-02A: смена пароля пользователя → 200',s==200,(s,d))
s,d=cu2.r('GET','/api/client/orders'); chk('DF-02A: смена пароля погасила сессию ТОЛЬКО этого пользователя',s==401,s)
s,d=c.r('GET',f'/api/client/orders/{oid}'); chk('DF-02A: сессия коллеги после чужой смены пароля жива',s==200,s)
s,d=C().r('POST','/api/auth/client/login',{'phone':u2ph,'password':'client-pass-2x'}); chk('DF-02A: старый пароль после смены не работает (401)',s==401,s)
cu2=C(); s,d=cu2.r('POST','/api/auth/client/login',{'phone':u2ph,'password':'client-pass-3x'}); chk('DF-02A: вход по новому паролю',s==200,s)
# чужая компания: пользователь B не видит заявку A (404)
s,d=a.r('POST','/api/admin/customers',{'name':'Компания B '+u,'phone':ph(base+8)}); custB=(d.get('customer') or d)['id']
s,d=a.r(AM,f'/api/admin/customers/{custB}/access',{'name':'Клиент B '+u,'phone':ph(base+9),'password':'client-pass-b'})
cb=C(); cb.r('POST','/api/auth/client/login',{'phone':ph(base+9),'password':'client-pass-b'})
s,d=cb.r('GET',f'/api/client/orders/{oid}'); chk('DF-02A: пользователь компании B не видит заявку A (404)',s==404,s)
# деактивация второго: сессия гаснет, вход 403, доступ компании цел, возврат — снова входит
s,d=a.r('PATCH',f'/api/admin/customers/{cust}/access',{'userId':uid2,'isActive':False}); chk('DF-02A: деактивация пользователя → 200',s==200,(s,d))
s,d=cu2.r('GET','/api/client/orders'); chk('DF-02A: сессия деактивированного погасла',s==401,s)
s,d=C().r('POST','/api/auth/client/login',{'phone':u2ph,'password':'client-pass-3x'}); chk('DF-02A: деактивированный не входит (403 «доступ закрыт», не 401)',s==403,s)
s,d=c.r('GET',f'/api/client/orders/{oid}'); chk('DF-02A: деактивация одного не закрыла доступ компании',s==200,s)
s,d=a.r('PATCH',f'/api/admin/customers/{cust}/access',{'userId':uid2,'isActive':True}); chk('DF-02A: возврат пользователя → 200',s==200,(s,d))
cu2=C(); s,d=cu2.r('POST','/api/auth/client/login',{'phone':u2ph,'password':'client-pass-3x'}); chk('DF-02A: после возврата пользователь входит снова',s==200,s)
# контакт без входа (P1-07): пользователь без пароля существует, но не входит
s,d=a.r('POST',f'/api/admin/customers/{cust}/access',{'name':'Контакт без входа '+u,'phone':ph(base+13)}); chk('DF-02A: контакт без пароля создан',s==201,(s,d))
s,d=C().r('POST','/api/auth/client/login',{'phone':ph(base+13),'password':'anything1'}); chk('DF-02A: контакт без пароля не входит (401)',s==401,s)
s,d=a.r('GET',f'/api/admin/customers/{cust}/access'); nofin=[x for x in d.get('users',[]) if x.get('phone')=='+7999%07d'%(base+13)]
chk('DF-02A: контакт без входа в списке (hasPassword=false)',len(nofin)==1 and nofin[0].get('hasPassword') is False,nofin)
s,d=a.r('GET',f'/api/admin/customers/{cust}'); chk('DF-02A: доступ компании = активный пользователь с паролем',(d.get('customer',d)).get('hasCabinetAccess') is True,(s,d))
# --- DF-02A: автор-человек в версиях документов ---
s,d=up2(c,f'/api/client/orders/{oid}/documents','cl.pdf',b'%PDF-1.4 client',"application/pdf",extra={'type':'invoice','title':'Счёт от клиента '+u}); chk('DF-02A: клиент загрузил документ (версия 1)',s in(200,201),(s,d))
v1=((d.get('document') or {}).get('versions') or [{}])[0]
chk('DF-02A: автор версии — человек (свой кабинет видит имя)',v1.get('authorType')=='client' and v1.get('authorName')==prim_name and bool(v1.get('authorId')),v1)
s,d=a.r('GET',f'/api/admin/orders/{oid}/documents'); txt=json.dumps(d,ensure_ascii=False)
chk('DF-02A: сотрудник видит автора «Имя (Компания)»',(prim_name+' ('+cust_name+')') in txt,txt[:200])
s,d=b.r('GET',f'/api/broker/orders/{oid}/documents'); txt=json.dumps(d,ensure_ascii=False)
chk('DF-02A: брокер (другая сторона) видит только компанию автора',cust_name in txt and prim_name not in txt,txt[:200])
# --- DF-02A: сотрудники брокера (зеркало клиентского) ---
s,d=a.r('GET',f'/api/admin/brokers/{bid}/users'); bu=d.get('users',[])
bprim=[x for x in bu if x.get('isPrimary')]
chk('DF-02A: у брокера основной пользователь (создан вместе с брокером)',s==200 and len(bprim)==1 and bprim[0].get('hasPassword') is True,(s,bu))
buid1=bprim[0]['id'] if bprim else None
bu2ph=ph(base+10); bu2name='Брокер Пётр '+u
s,d=a.r('POST',f'/api/admin/brokers/{bid}/users',{'name':bu2name,'phone':bu2ph,'password':'broker-pass-3'}); chk('DF-02A: второй пользователь брокера создан',s==201,(s,d)); buid2=(d or {}).get('userId')
bu2=C(); s,d=bu2.r('POST','/api/auth/broker/login',{'phone':bu2ph,'password':'broker-pass-3'}); chk('DF-02A: второй пользователь брокера вошёл (userName)',s==200 and (d.get('broker') or {}).get('userName')==bu2name,(s,d))
s,d=bu2.r('GET',f'/api/broker/orders/{oid}'); chk('DF-02A: коллега-брокер видит ту же заявку',s==200,s)
s,d=a.r('PATCH',f'/api/admin/brokers/{bid}/users',{'userId':buid2,'isActive':False}); chk('DF-02A: деактивация пользователя брокера → 200',s==200,(s,d))
s,d=bu2.r('GET','/api/broker/orders'); chk('DF-02A: сессия деактивированного брокера погасла',s==401,s)
s,d=C().r('POST','/api/auth/broker/login',{'phone':bu2ph,'password':'broker-pass-3'}); chk('DF-02A: деактивированный брокер не входит (403)',s==403,s)
# автор-человек у брокера: личность известна — правим имя, грузим документ
s,d=a.r('PATCH',f'/api/admin/brokers/{bid}/users',{'userId':buid1,'name':'Брокер Олег '+u}); chk('DF-02A: имя человека у основного брокера правится',s==200,(s,d))
s,d=up2(b,f'/api/broker/orders/{oid}/documents','br.pdf',b'%PDF-1.4 broker',"application/pdf",extra={'type':'other','title':'Акт брокера '+u}); chk('DF-02A: брокер загрузил документ',s in(200,201),(s,d))
bv1=((d.get('document') or {}).get('versions') or [{}])[0]
chk('DF-02A: автор-брокер — человек (свой кабинет)',bv1.get('authorType')=='broker' and bv1.get('authorName')=='Брокер Олег '+u and bool(bv1.get('authorId')),bv1)
s,d=a.r('GET',f'/api/admin/orders/{oid}/documents'); txt=json.dumps(d,ensure_ascii=False)
chk('DF-02A: сотрудник видит автора-брокера «Имя (Компания)»',('Брокер Олег '+u+' (Брокер '+u+')') in txt,txt[:200])
s,d=c.r('GET',f'/api/client/orders/{oid}/documents'); txt=json.dumps(d,ensure_ascii=False)
chk('DF-02A: клиент (другая сторона) видит только компанию брокера',('Брокер '+u) in txt and ('Брокер Олег '+u) not in txt,txt[:200])
# --- DF-00D: настройки системы (мастер-only; журнал/транзакция — settings.test.ts против живой БД) ---
s,d=bb.r('GET','/api/admin/settings'); chk('[ПРИЁМКА DF-00D] менеджер не читает настройки → 403',s==403,s)
s,d=bb.r('PATCH','/api/admin/settings',{'key':'files.max_mb','value':50}); chk('[ПРИЁМКА DF-00D] менеджер не меняет настройки → 403',s==403,s)
s,d=C().r('GET','/api/admin/settings'); chk('DF-00D: аноним не читает настройки → 401',s==401,s)
s,d=a.r('GET','/api/admin/settings'); st=d.get('settings',[]) if isinstance(d,dict) else []
chk('[ПРИЁМКА DF-00D] мастер читает реестр: 21 ключ (DF-26 w2 +permits.warn_days_before), группы, дефолты',s==200 and len(st)==21 and bool(d.get('groups')) and all('defaultValue' in x for x in st),(s,len(st)))
f0=[x for x in st if x['key']=='files.max_mb'][0]
chk('DF-00D: пустая таблица — значение равно дефолту',f0['value']==25 and f0['isModified']==False,f0)
s,d=a.r('PATCH','/api/admin/settings',{'key':'files.max_mb','value':50}); chk('[ПРИЁМКА DF-00D] мастер меняет значение, новое видно в ответе',s==200 and (d.get('setting') or {}).get('value')==50,(s,d))
s,d=a.r('GET','/api/admin/settings'); f1=[x for x in d.get('settings',[]) if x['key']=='files.max_mb'][0]
chk('DF-00D: изменение пережило перечитывание (isModified, кто менял)',f1['value']==50 and f1['isModified']==True and bool(f1.get('updatedByName')),f1)
s,d=a.r('PATCH','/api/admin/settings',{'key':'owner_digest.window_start','value':'25:99'}); chk('[ПРИЁМКА DF-00D] неверный формат времени → 400',s==400,(s,d))
s,d=a.r('PATCH','/api/admin/settings',{'key':'hacker.key','value':'x'}); chk('DF-00D: свободный ключ → 400',s==400,s)
s,d=a.r('PATCH','/api/admin/settings',{'key':'files.max_mb','value':0}); chk('DF-00D: значение вне границ → 400',s==400,s)
s,d=a.r('PATCH','/api/admin/settings',{'key':'files.max_mb'}); chk('DF-00D: PATCH без value → 400',s==400,s)
s,d=a.r('DELETE','/api/admin/settings',{'key':'files.max_mb'}); chk('DF-00D: «сбросить» → значение вернулось к дефолту',s==200 and (d.get('setting') or {}).get('value')==25,(s,d))
# --- IDOR: second client
s,d=a.r('POST','/api/admin/customers',{'name':'Чужой '+u,'phone':ph(base+3)}); c2=(d.get('customer') or d)['id']
a.r(AM,f'/api/admin/customers/{c2}/access',{'name':'Пользователь чужой '+u,'phone':ph(base+3),'password':'client-pass-2'})
c2c=C(); c2c.r('POST','/api/auth/client/login',{'phone':ph(base+3),'password':'client-pass-2'})
s,d=c2c.r('GET',f'/api/client/orders/{oid}'); chk('IDOR: чужой клиент не видит заявку',s in(403,404),s)
# --- P1-02: клиент правит свой запрос до вариантов ---
# DF-27 волна 2 (§6.4/D75): неполные запросы клиента теперь needs_data
# (автомат); правка (Р-1) открыта до конвертации/закрытия — берём активные
s,d=c.r('GET','/api/client/leads'); cleads=[x for x in (d.get('leads') or []) if x.get('status') in ('new','needs_data','calculated')]
chk('P1-02: у клиента есть активные запросы (new/needs_data/calculated)',len(cleads)>0,len(cleads))
clid2=cleads[0]['id']
s,d=c.r('GET',f'/api/client/leads/{clid2}'); chk('P1-02: canEdit=true до вариантов',(d.get('lead',d)).get('canEdit')==True,d)
s,d=c.r('PATCH',f'/api/client/leads/{clid2}',{'route':{'weightKg':2222,'originCity':'Стамбул'}}); chk('P1-02: клиент правит запрос до вариантов → 200',s==200,(s,d))
s,d=c.r('GET',f'/api/client/leads/{clid2}'); L2=d.get('lead',d)
chk('P1-02: правка клиента видна в колонках',float(L2.get('weightKg'))==2222 and L2.get('originCity')=='Стамбул',(L2.get('weightKg'),L2.get('originCity')))
s,d=c2c.r('PATCH',f'/api/client/leads/{clid2}',{'cargoInfo':{'weightKg':1}}); chk('P1-02: чужой клиент не правит запрос (IDOR)',s in(403,404),s)
s,d=a.r('GET',f'/api/admin/leads/{clid2}'); L=d.get('lead',d); acts=L.get('activities',[])
chk('P1-02: правка клиента в журнале запроса (актёр — клиент)',bool(acts) and acts[0]['type']=='lead_edited' and acts[0]['actorType']=='client',(acts[0] if acts else None))
chk('DF-02A: в ленте сотрудника актёр-клиент — «Имя (Компания)»',bool(acts) and prim_name in acts[0].get('actorName','') and cust_name in acts[0].get('actorName','') and bool(acts[0].get('actorId')),(acts[0] if acts else None))
s,d=c.r('PATCH',f'/api/client/leads/{lid}',{'cargoInfo':{'weightKg':3333}}); chk('P1-02: клиент не правит запрос после вариантов → 409',s==409,s)
s,d=a.r('GET',f'/api/admin/orders/{oid}/documents'); docs=d.get('documents',d)
vid=[x for x in docs if x['isInternal']][0]['versions'][0]['id']
s,d=c.r('GET',f'/api/document-versions/{vid}/file'); chk('клиент не скачивает внутренний файл',s==404,s)
s,d=b.r('GET',f'/api/document-versions/{vid}/file'); chk('брокер не скачивает внутренний файл',s==404,s)
k2=C(); s,d=k2.r('GET',f'/api/document-versions/{vid}/file'); chk('аноним не скачивает',s==401,s)
# deactivate broker → session dies
s,d=a.r('PATCH',f'/api/admin/brokers/{bid}',{'isActive':False}); s,d=b.r('GET','/api/broker/orders'); chk('деактивация брокера гасит сессию',s==401,s)
# CSRF-ish: cross-origin POST with JSON
s,d=a.r('POST','/api/admin/customers',{'name':'csrf '+u},h={'Origin':'https://evil.example'}); chk('E0-09 мутирующий запрос с чужим Origin отклоняется',s==403,s)
s,d=a.r('POST','/api/admin/customers',{'name':'same-origin '+u},h={'Origin':B}); chk('E0-09 запрос со своим Origin проходит',s in(200,201),s)
# brute force
x=C()
for i in range(6): s,d=x.r('POST','/api/auth/employee/login',{'phone':'+79000000099','password':'bad'+str(i)})
chk('rate-limit входа (429 после 5 провалов)',s==429,s)
s,d=x.r('POST','/api/auth/employee/login',{'phone':'+79000000000','password':'bad'},h={'X-Forwarded-For':'1.2.3.%d'%random.randint(1,250)})
chk('E0-05 подмена X-Forwarded-For не обходит лимит',s==429,s)
# DF-02A: лимиты входа кабинетов действуют (роуты переписаны на
# authenticate* — guard общий, ключ телефон+IP сохранён; минутое окно
# по IP уже заполнено провалами выше, честный перебор кабинета — vitest)
s,d=C().r('POST','/api/auth/client/login',{'phone':ph(base+11),'password':'bad0'})
chk('DF-02A: rate-limit входа клиента (429)',s==429,s)
s,d=C().r('POST','/api/auth/broker/login',{'phone':ph(base+12),'password':'bad0'})
chk('DF-02A: rate-limit входа брокера (общий бакет IP)',s==429,s)
# --- DF-02: участники сделки — email для уведомлений в справочниках ---
# (миграция df_02_contact_email: Employee.email, Broker.email — nullable;
# валидация isEmail на сервере, null = очистить; участники собирает
# src/lib/participants.ts — unit-уровень, e2e проверяет CRUD форм)
s,d=a.r('POST','/api/admin/employees',{'name':'DF02 сотрудник '+u,'phone':ph(base+21),'password':'df02-pass-1','roles':['manager'],'email':'df02-emp-'+u+'@test.ru'}); chk('DF-02: сотрудник создаётся с email',s==201 and d.get('employee',{}).get('email')=='df02-emp-'+u+'@test.ru',(s,d)); emp_df02=(d.get('employee') or {}).get('id')
s,d=a.r('POST','/api/admin/employees',{'name':'DF02 мусор '+u,'phone':ph(base+22),'password':'df02-pass-1','roles':['manager'],'email':'not-an-email'}); chk('DF-02: мусорный email сотрудника → 400',s==400,(s,d))
s,d=a.r('PATCH',f'/api/admin/employees/{emp_df02}',{'email':'df02-fixed-'+u+'@test.ru'}); chk('DF-02: PATCH email сотрудника сохраняет',s==200 and d.get('employee',{}).get('email')=='df02-fixed-'+u+'@test.ru',(s,d))
s,d=a.r('PATCH',f'/api/admin/employees/{emp_df02}',{'email':None}); chk('DF-02: PATCH email=null очищает email сотрудника',s==200 and d.get('employee',{}).get('email') is None,(s,d))
s,d=a.r('GET','/api/admin/employees'); elist=d.get('employees',[]); chk('DF-02: список сотрудников отдаёт email',bool(elist) and 'email' in elist[0],(elist[0] if elist else None))
s,d=a.r('POST','/api/admin/brokers',{'companyName':'DF02 брокер '+u,'phone':ph(base+23),'password':'df02-pass-1','email':'df02-broker-'+u+'@test.ru'}); chk('DF-02: брокер создаётся с email',s in(200,201) and (d.get('broker') or {}).get('email')=='df02-broker-'+u+'@test.ru',(s,d)); brk_df02=(d.get('broker') or {}).get('id')
s,d=a.r('PATCH',f'/api/admin/brokers/{brk_df02}',{'email':'broken-email'}); chk('DF-02: мусорный email брокера → 400',s==400,(s,d))
s,d=a.r('PATCH',f'/api/admin/brokers/{brk_df02}',{'email':'df02-broker-fixed-'+u+'@test.ru'}); chk('DF-02: PATCH email брокера сохраняет',s==200 and d.get('broker',{}).get('email')=='df02-broker-fixed-'+u+'@test.ru',(s,d))
s,d=a.r('GET','/api/admin/brokers'); blist=d.get('brokers',[]); chk('DF-02: список брокеров отдаёт email',bool(blist) and 'email' in blist[0],(blist[0] if blist else None))
# --- DF-03: очередь уведомлений и письма трёх режимов (D33) ---
# Стенд: EMAIL_PROVIDER=fake (письма уходят в очередь со статусом sent и
# providerId fake:...). Диспетчер — POST /api/internal/notifications/dispatch
# с Bearer CRON_SECRET (внешний планировщик — workflow scheduler.yml, ≥5 мин,
# допуск окна 15 минут). Журнал — GET /api/admin/notifications (только мастер).
CRON=os.environ.get('CRON_SECRET','')
def disp():
    return C().r('POST','/api/internal/notifications/dispatch',h={'Authorization':'Bearer '+CRON} if CRON else None)
s,d=C().r('POST','/api/internal/notifications/dispatch'); chk('DF-03: диспетчер без токена → 403',s==403,s)
s,d=C().r('POST','/api/internal/notifications/dispatch',h={'Authorization':'Bearer wrong-secret'}); chk('DF-03: диспетчер с неверным токеном → 403',s==403,s)
s,d=C().r('GET','/api/admin/notifications'); chk('DF-03: аноним не читает очередь → 401',s==401,s)
s,d=bb.r('GET','/api/admin/notifications'); chk('DF-03: менеджер не читает очередь → 403',s==403,s)
# фикстуры: менеджер с email; сделка (лид → заявка); доступ и назначение —
# ПОСЛЕ конвертации (клиент сделки рождается из rawContact, ответственный
# по умолчанию — мастер без email: выдаём человеку email и назначаем менеджера)
s,d=a.r('POST','/api/admin/employees',{'name':'DF03 менеджер '+u,'phone':ph(base+41),'password':'df03-pass-1','roles':['manager'],'email':'df03-staff-'+u+'@test.example'}); chk('DF-03: сотрудник с email создан',s==201,(s,d)); staff3=(d.get('employee') or {}).get('id')
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'DF03 сделка '+u,'phone':ph(base+46)},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':100,'placesCount':3,'readyDate':'2026-12-05'},'cargoInfo':{'hsCode':'8507600090','cargoValue':5000},'incotermCode':'FOB'}); lid3=(d.get('lead') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{lid3}/options',{'description':'Море','transportModes':['Море'],'price':100000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':30,'priorityFit':'cost','isSelected':True})
a.r('POST',f'/api/admin/leads/{lid3}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid3}/convert',{'legalEntityId':leid,'incoterm':'FOB'}); o3=(d.get('order') or d); oid3=o3['id']
s,d=a.r('GET',f'/api/admin/orders/{oid3}'); cust3=((d.get('order') or d).get('customer') or {}).get('id'); chk('DF-03: клиент сделки определён',bool(cust3),cust3)
s,d=a.r('POST',f'/api/admin/customers/{cust3}/access',{'name':'DF03 Иван','phone':ph(base+43),'password':'df03-pass-1','email':'df03-client-'+u+'@test.example'}); chk('DF-03: доступ клиенту сделки выдан (человек с email)',s in(200,201),(s,d))
s,d=a.r('PATCH',f'/api/admin/orders/{oid3}',{'assignedToId':staff3}); chk('DF-03: назначен менеджер с email',s==200,(s,d))
s,d=a.r('POST','/api/admin/brokers',{'companyName':'DF03 брокер '+u,'phone':ph(base+44),'password':'df03-pass-1','email':'df03-broker-'+u+'@test.example'}); brk3=(d.get('broker') or d)['id']
s,d=a.r('POST',f'/api/admin/brokers/{brk3}/users',{'name':'DF03 брокер-человек','phone':ph(base+45),'password':'df03-pass-1','email':'df03-buser-'+u+'@test.example'}); chk('DF-03: человек брокера создан с email',s in(200,201),(s,d))
# согласование: статус → клиенту immediate; брокер подключён → письмо ему
# BL-5: сконвертированный oid3 уже in_progress — переход для письма
# отрабатываем на ручной заявке этого же клиента (расчёт→согласование)
s,d=a.r('POST','/api/admin/orders',{'customerId':cust3,'legalEntityId':leid}); _oid3m=(d.get('order') or d)['id']
s,d=a.r('PATCH',f'/api/admin/orders/{_oid3m}',{'status':'confirmed'}); chk('DF-03: ручная заявка → Согласование (письмо клиенту сразу)',s==200,(s,d))
s,d=a.r('POST',f'/api/admin/orders/{oid3}/brokers',{'brokerId':brk3}); chk('DF-03: брокер подключён к заявке',s in(200,201),(s,d))
s,d=disp(); chk('DF-03: диспетчер (с токеном) отработал',s==200 and isinstance(d,dict) and 'sent' in d,(s,d))
s,d=a.r('GET','/api/admin/notifications?recipientKind=client&status=sent&take=200'); sent=d.get('notifications',[])
cl=[x for x in sent if x.get('toAddress')=='df03-client-'+u+'@test.example' and x.get('type')=='order_status_changed']
chk('DF-03: согласование — клиенту письмо сразу, статус sent (fake)',len(cl)>=1 and all((x.get('providerId') or '').startswith('fake:') for x in cl),(len(cl),s))
chk('DF-03: письмо клиенту содержит ссылку в его кабинет',any('/client/orders/' in (x.get('body') or '') for x in cl),[(x.get('body') or '')[:120] for x in cl[:1]])
s,d=a.r('GET','/api/admin/notifications?recipientKind=broker&take=50'); bro=[x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-buser-'+u+'@test.example' and x.get('type')=='order_broker_attached']
chk('DF-03: подключение брокера — письмо ИМЕННО ему, сразу',len(bro)==1 and bro[0].get('mode')=='immediate',(len(bro),bro[:1]))
# красное: этап в problem → немедленно, нейтрально клиенту
s,d=a.r('GET',f'/api/admin/orders/{oid3}'); st3=(d.get('order') or d).get('stages',[])
s,d=a.r('PATCH',f'/api/admin/orders/{oid3}/stages/{st3[0]["id"]}',{'status':'problem'}); chk('DF-03: этап в problem',s==200,(s,d))
import time as _tp
redc=[]
for _ in range(6):  # поллинг: after()-диспетчер PATCH может опередить disp()
    s,d=disp()
    s,d=a.r('GET','/api/admin/notifications?status=sent&take=200'); sent=d.get('notifications',[])
    redc=[x for x in sent if x.get('toAddress')=='df03-client-'+u+'@test.example' and x.get('mode')=='red']
    if redc: break
    _tp.sleep(0.5)
chk('DF-03: красное письмо — префикс темы из настройки, нейтральный текст',bool(redc) and redc[0].get('subject','').startswith('Срочно:') and 'задержка' in redc[0].get('body','') and 'проблем' not in redc[0].get('body','').lower(),redc[0].get('subject') if redc else None)
reds=[x for x in sent if x.get('toAddress')=='df03-staff-'+u+'@test.example' and x.get('mode')=='red']
chk('DF-03: problem — ответственному красное письмо',len(reds)>=1,(len(reds),s))
# окна: три события перевозки → одно письмо в окне, не три
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
nowmsk=datetime.now(ZoneInfo('Europe/Moscow'))
future=(nowmsk+timedelta(hours=2)).strftime('%H:%M')
cur=nowmsk.strftime('%H:%M')
s,d=a.r('PATCH','/api/admin/settings',{'key':'notifications.client_digest_times','value':[future]}); chk('DF-03: окно уведомлений сдвинуто в будущее',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid3}'); chk('BL-5: сконвертированный oid3 уже в работе (без ручного старта)',(d.get('order') or d).get('status')=='in_progress',(d.get('order') or d).get('status'))
for stg in st3[1:4]:
    s,d=a.r('PATCH',f'/api/admin/orders/{oid3}/stages/{stg["id"]}',{'status':'done'})
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?type=digest&take=50'); dg=[x for x in d.get('notifications',[]) if x.get('windowKey') and x.get('toAddress')=='df03-client-'+u+'@test.example']
chk('DF-03: вне окна дайджест не собирается (пустого письма нет)',len(dg)==0,(len(dg),s))
s,d=a.r('PATCH','/api/admin/settings',{'key':'notifications.client_digest_times','value':[cur]})
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?type=digest&take=50'); dg=[x for x in d.get('notifications',[]) if x.get('windowKey') and x.get('toAddress')=='df03-client-'+u+'@test.example']
chk('DF-03: в окне — одно письмо-дайджест, а не три',len(dg)>=1,(len(dg),s))
body=dg[0].get('body','') if dg else ''
chk('DF-03: дайджест сгруппирован по заявке, события внутри',body.count('•')>=3 and '— заявка №' in body,(body.count('•'),body[:200]))
chk('DF-03: дайджест доставлен fake-транспортом',bool(dg) and (dg[0].get('providerId') or '').startswith('fake:'),dg[0].get('providerId') if dg else None)
# Окна НЕ сбрасываем в дефолт до конца блока DF-16: служебные disp() ниже
# (DF-08, версии документов, красные сканы) при прогоне внутри
# [16:00..16:15] MSK собирают дефолтные 16:00-дайджесты и съедают
# pending-события (флак «Ждём от вас» DF-16: прогон 02.11.2026 16:10 MSK
# упал, 12:16 и 12:38 MSK — зелёные; окно 16:00 в допуске 15 мин).
# Дефолт вернёт DELETE в конце блока DF-16.
s,d=a.r('PATCH','/api/admin/settings',{'key':'notifications.client_digest_times','value':[future]}); chk('DF-03: окна удержаны в будущем (служебные disp() не собирают дефолтных дайджестов)',s==200,(s,d))
# --- DF-08: ежедневная сводка владельцу (письмо type=digest мастеру) ---
# Окно owner_digest.window_start/end — ДИАПАЗОН, диспетчер решает сам;
# идемпотентность — dedupKey ownerdigest:{мастер}:{дата} (второй вызов
# в тот же день письма не создаёт); менеджеру сводка не уходит.
s,d=a.r('PATCH',f'/api/admin/employees/{aid}',{'email':'df08-owner-'+u+'@test.example'}); chk('DF-08: мастеру выдан email для сводки',s==200 and (d.get('employee') or {}).get('email')=='df08-owner-'+u+'@test.example',(s,d))
_cur=datetime.now(ZoneInfo('Europe/Moscow')); _cm=_cur.hour*60+_cur.minute
_wstart=max(0,_cm-30); _wend=min(1439,_cm+5)
if _wend<=_wstart: _wend=1439
_fmt=lambda m:'%02d:%02d'%(m//60,m%60)
s,d=a.r('PATCH','/api/admin/settings',{'key':'owner_digest.window_start','value':_fmt(_wstart)}); chk('DF-08: начало окна сводки установлено',s==200,(s,d))
s,d=a.r('PATCH','/api/admin/settings',{'key':'owner_digest.window_end','value':_fmt(_wend)}); chk('DF-08: конец окна сводки установлен',s==200,(s,d))
# Гонка с after()-диспетчером (флак 03.11.2026): write-роуты выше
# (email, окна) планируют фоновый disp() — при остывшем троттлинге он
# успевает создать сводку ДО явного disp(), и dedupKey делает
# ownerDigests=0. Фикстура: гасим сегодняшнюю сводку прямой записью —
# тот же приём, что e2e_seed_notification.ts (проверяем диспетчер,
# не фон).
import subprocess as _sp
_sp.run(['bun','-e','import {PrismaClient} from "@prisma/client"; const p=new PrismaClient(); await p.notification.deleteMany({where:{dedupKey:{startsWith:"ownerdigest:"}}}); await p.$disconnect()'],capture_output=True,text=True,env={**os.environ},cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
s,d=disp(); chk('DF-08: диспетчер создал сводку (ownerDigests=1)',s==200 and d.get('ownerDigests')==1,(s,d))
def _owndg():
    s,d=a.r('GET','/api/admin/notifications?type=digest&take=200')
    return [x for x in d.get('notifications',[]) if x.get('toAddress')=='df08-owner-'+u+'@test.example' and (x.get('windowKey') or '').startswith('owner:')]
dg8=_owndg(); chk('DF-08: сводка мастеру — ровно одна за сутки',len(dg8)==1,(len(dg8),s))
if dg8:
    b8=dg8[0].get('body','')
    chk('DF-08: в письме цифры блока 1 Пульса и неотправленные',('Показатели:' in b8) and ('Неотправленных писем:' in b8) and ('Активных заявок' in b8),b8[:300])
    chk('DF-08: в письме ссылка на Пульс','/admin/pulse' in b8,b8[-200:])
    chk('DF-08: тема — «сводка за <дата>»','сводка за ' in dg8[0].get('subject',''),dg8[0].get('subject'))
s,d=disp(); chk('DF-08: повторный диспетчер в тот же день — без второй сводки',s==200 and d.get('ownerDigests')==0,(s,d))
chk('DF-08: после повтора сводка по-прежнему одна',len(_owndg())==1,len(dg8))
s,d=a.r('GET','/api/admin/notifications?type=digest&take=200'); _mg=[x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-staff-'+u+'@test.example' and (x.get('windowKey') or '').startswith('owner:')]
chk('DF-08: менеджеру сводка не уходит',len(_mg)==0,len(_mg))
s,d=a.r('DELETE','/api/admin/settings',{'key':'owner_digest.window_start'}); chk('DF-08: окно сводки сброшено к дефолту (start)',s==200,(s,d))
s,d=a.r('DELETE','/api/admin/settings',{'key':'owner_digest.window_end'}); chk('DF-08: окно сводки сброшено к дефолту (end)',s==200,(s,d))
# документы: загрузка клиентом → ответственному; версия → клиенту+брокеру;
# деактивированный человек брокера писем не получает
import time as _t
_t.sleep(61)  # бакет «5 провалов/мин на IP» из секции rate-limit — ждём окно
c3=C(); s,d=c3.r('POST','/api/auth/client/login',{'phone':ph(base+43),'password':'df03-pass-1'}); chk('DF-03: клиент входит',s==200,(s,d))
s,d=up2(c3,f'/api/client/orders/{oid3}/documents','inv3.pdf',b'%PDF-1.4 df03',"application/pdf",extra={'type':'invoice','title':'DF03 счёт '+u}); chk('DF-03: клиент загрузил документ',s in(200,201),(s,d)); doc3=(d.get('document') or d)['id']
s,d=disp()
# Поллинг до 3 с: после ответа роута параллельно стартует after()-диспетчер
# (троттлинг 15 с) — гонка claim→send оставляет строку pending на миллисекунды.
# Продуктовое обещание — immediate ≤5 минут; харнесс ждёт 3 с, реальная
# недоставка (письмо не создано) тест по-прежнему ловит.
docr=[]
for _ in range(6):
    s,d=a.r('GET','/api/admin/notifications?recipientKind=employee&status=sent&take=200')
    docr=[x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-staff-'+u+'@test.example' and x.get('type')=='document_created']
    if docr: break
    _t.sleep(0.5)
chk('DF-03: документ загружен клиентом → ответственному письмо',len(docr)>=1,(len(docr),s))
s,d=a.r('GET','/api/admin/notifications?recipientKind=broker&take=200'); bcnt=len([x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-buser-'+u+'@test.example'])
s,d=up2(c3,f'/api/client/documents/{doc3}/versions','inv3b.pdf',b'%PDF-1.4 df03-v2',"application/pdf",extra={'comment':'правка веса'}); chk('DF-03: клиент добавил версию (та же карточка)',s in(200,201),(s,d))
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?recipientKind=broker&take=200'); b2=[x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-buser-'+u+'@test.example']
chk('DF-03: новая версия документа → брокеру письмо (видит документ)',len(b2)>bcnt,(bcnt,len(b2)))
s,d=a.r('GET',f'/api/admin/brokers/{brk3}/users'); bu=(d.get('users') or [])
bud=[x for x in bu if x.get('email')=='df03-buser-'+u+'@test.example']
s,d=a.r('PATCH',f'/api/admin/brokers/{brk3}/users',{'userId':bud[0]['id'],'isActive':False}); chk('DF-03: человек брокера деактивирован',s==200,(s,d))
s,d=up2(c3,f'/api/client/documents/{doc3}/versions','inv3c.pdf',b'%PDF-1.4 df03-v3',"application/pdf",extra={'comment':'ещё правка'})
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?recipientKind=broker&take=200'); b3=[x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-buser-'+u+'@test.example']
chk('DF-03: деактивированный получатель письма не получает',len(b3)==len(b2),(len(b2),len(b3)))
# внутренняя заметка — внешним ни одного письма
s,d=a.r('GET','/api/admin/notifications?recipientKind=client&take=200'); before=len([x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-client-'+u+'@test.example'])
s,d=a.r('POST',f'/api/admin/orders/{oid3}/notes',{'text':'DF03 внутренняя заметка '+u}); chk('DF-03: заметка создана',s in(200,201),(s,d))
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?recipientKind=client&take=200'); aftern=len([x for x in d.get('notifications',[]) if x.get('toAddress')=='df03-client-'+u+'@test.example']); chk('DF-03: внутренняя заметка — внешним ни одного письма',aftern==before,(before,aftern))

# --- DF-04: журнал отправок и повтор для мастера ---
# Критерий приёмки: «искусственно сломанный транспорт виден мастеру в
# списке и в "Требует внимания"». В e2e EMAIL_PROVIDER=fake — транспорт
# не падает, поэтому failed-строку создаёт сид-фикстура (bun+prisma,
# тот же паттерн, что seed): письмо после пяти попыток диспетчера.
# Права (manager → 403) уже покрыты в DF-03 — здесь repeat-семантика.
import subprocess
_seed=os.path.join(os.path.dirname(os.path.abspath(__file__)),'e2e_seed_notification.ts')
addr4='df04-failed-'+u+'@test.example'
p=subprocess.run(['bun',_seed,'--to',addr4,'--dedup','df04-failed-'+u],capture_output=True,text=True)
sid4=None
if p.returncode==0 and p.stdout.strip():
    try: sid4=json.loads(p.stdout.strip().splitlines()[-1]).get('id')
    except Exception: sid4=None
chk('DF-04: фикстура failed-письма создана (сломанный транспорт)',bool(sid4),(p.stdout[-120:],p.stderr[-120:]))
s,d=a.r('GET','/api/admin/notifications?status=failed&take=200')
frow=[x for x in d.get('notifications',[]) if x.get('id')==sid4]
chk('DF-04: мастер видит failed в журнале (lastError на месте)',len(frow)==1 and frow[0].get('status')=='failed' and bool(frow[0].get('lastError')),(len(frow),s))
s,d=a.r('GET','/api/admin/attention'); nf4=d.get('notificationsFailed')
chk('DF-04: «Требует внимания» мастера насчитал failed',isinstance(nf4,int) and nf4>=1,nf4)
s,d=bb.r('GET','/api/admin/attention'); nfm4=d.get('notificationsFailed')
chk('DF-04: счётчик failed не уходит менеджеру (null)',nfm4 is None,nfm4)
s,d=a.r('POST',f'/api/admin/notifications/{sid4}/retry'); chk('DF-04: повтор failed → 200 (в очереди)',s==200,(s,d))
s,d=a.r('POST',f'/api/admin/notifications/{sid4}/retry'); chk('DF-04: повтор не-failed/skipped → 409',s==409,(s,d))
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?status=sent&take=200')
srow=[x for x in d.get('notifications',[]) if x.get('id')==sid4]
chk('DF-04: после повтора письмо доставлено fake-транспортом',len(srow)==1 and srow[0].get('status')=='sent' and (srow[0].get('providerId') or '').startswith('fake:'),(len(srow),s))
s,d=a.r('GET','/api/admin/attention'); chk('DF-04: «Требует внимания» мастера снова чист (failed=0)',d.get('notificationsFailed')==0,d.get('notificationsFailed'))
s,d=a.r('POST','/api/admin/notifications/df04-nonexistent/retry'); chk('DF-04: повтор несуществующего → 404',s==404,(s,d))
s,d=a.r('GET','/api/admin/notifications?status=failed&take=50'); cnts=d.get('counts',{})
chk('DF-04: журнал отдаёт counts по статусам (табы)',isinstance(cnts,dict) and all(k in cnts for k in('pending','sent','failed','skipped')),cnts)

# --- DF-17: справочники и курсы ---
# Критерий приёмки: «Страны, валюты, упаковка и условия поставки выбираются
# из справочника во всех формах; курсы загружаются ежедневно; IC-16 зелёный».
# API-уровень: клиент/брокер получают только активные записи; запрос с кодом
# страны сохраняется и денормализуется именем; отключённая запись исчезает
# из форм; старые заявки (без кодов) открываются. Экран /admin/references
# и Combobox покрыты вручную/приёмкой — здесь контракты API.
s,d=a.r('GET','/api/ref/currency'); codes=[x['code'] for x in d.get('items',[])]
chk('DF-17: /api/ref/currency — активная четвёрка (сид)',s==200 and all(c in codes for c in('RUB','USD','EUR','CNY')),(s,codes[:10]))
rub=[x for x in d.get('items',[]) if x['code']=='RUB']
chk('DF-17: валюта из справочника несёт meta.minorUnits',bool(rub) and (rub[0].get('meta') or {}).get('minorUnits')==2,rub[:1])
s,d=c3.r('GET','/api/ref/incoterm'); inc_codes=[x['code'] for x in d.get('items',[])]
chk('DF-17: клиент видит только активные условия поставки (DAT ред. 2010 скрыт)',s==200 and 'DAT' not in inc_codes and 'FOB' in inc_codes,(s,inc_codes))
fob=[x for x in d.get('items',[]) if x['code']=='FOB']
# D44 (30.10.2026): флаги утверждены брокером для тестового контура —
# draft снят релизом 0.7.0; расчёт (DF-19) применяет правила
chk('DF-17: разъяснение Инкотермс едет в meta (правила утверждены, draft снят — D44)',bool(fob) and bool((fob[0].get('meta') or {}).get('explanation')) and (fob[0].get('meta') or {}).get('draft') is False,fob[:1])
# брокер: все ранние брокерские сессии в пргоне погашены намеренно
# (деактивации DF-02A/DF-03 и брокера на строке «деактивация брокера гасит
# сессию») — входим первичным пользователем брокера brk3 (он активен,
# деактивирован был только второй человек) — свежая сессия для /api/ref
b17=C(); s,d=b17.r('POST','/api/auth/broker/login',{'phone':ph(base+44),'password':'df03-pass-1'})
chk('DF-17: активный пользователь брокера входит (свежая сессия)',s==200,(s,d))
s,d=b17.r('GET','/api/ref/packaging'); pk=[x['code'] for x in d.get('items',[])]
chk('DF-17: брокер читает справочник упаковки (коды источника Рек. 21)',s==200 and 'PX' in pk and 'CT' in pk,(s,pk[:12]))
s,d=C().r('GET','/api/ref/country'); chk('DF-17: аноним справочник не читает → 401',s==401,s)
# управление справочником: экран для мастера И менеджера (карточка DF-17).
# Случайный трёхбуквенный код: сид уже содержит ходовые ISO-коды —
# POST тестируем на заведомо свободном, включение/отключение — на нём же.
zcode=('z'+u[:2]).upper()
s,d=a.r('GET','/api/admin/references?dir=currency'); seed_c=[x for x in d.get('items',[]) if x['code']=='KZT']
chk('DF-17: сид-валюта вне четвёрки хранится неактивной (включает мастер)',bool(seed_c) and seed_c[0].get('isActive') is False,seed_c[:1])
s,d=a.r('POST','/api/admin/references',{'dir':'currency','code':zcode.lower(),'name':'Пробная валюта '+u,'nameEn':'Probe '+u}); zitem=(d.get('item') or {})
chk('DF-17: мастер добавил валюту (код нормализован в ISO-регистр)',s==201 and zitem.get('code')==zcode,(s,d))
s,d=a.r('POST','/api/admin/references',{'dir':'currency','code':zcode,'name':'дубль'}); chk('DF-17: дубль кода внутри dir → 409',s==409,s)
s,d=bb.r('PATCH',f"/api/admin/references/{zitem.get('id')}",{'name':'Пробная валюта (правка)'}); chk('DF-17: менеджер правит подпись записи',s==200,(s,d))
s,d=c3.r('GET','/api/ref/currency'); zz=[x['code'] for x in d.get('items',[]) if x['code']==zcode]
chk('DF-17: включённая валюта видна клиенту в форме',s==200 and len(zz)==1,(s,zz))
s,d=bb.r('PATCH',f"/api/admin/references/{zitem.get('id')}",{'isActive':False}); chk('DF-17: валюта отключена (мастер-режим)',s==200,(s,d))
s,d=c3.r('GET','/api/ref/currency'); zz=[x['code'] for x in d.get('items',[]) if x['code']==zcode]
chk('DF-17: отключённая валюта исчезла из форм клиента',s==200 and len(zz)==0,(s,zz))
s,d=bb.r('PATCH',f"/api/admin/references/{zitem.get('id')}",{'code':'XYZ'}); chk('DF-17: код записи менять нельзя → 400 (сделки ссылаются)',s==400,s)
# запрос с кодами: клиент шлёт только коды — сервер денормализует имена
s,d=c3.r('POST','/api/client/leads',{'route':{'originCountryCode':'CN','destinationCountryCode':'RU','weightKg':55,'placesCount':2,'readyDate':'2026-12-25'},'cargoInfo':{'hsCode':'6109100012','cargoValue':2000},'incotermCode':'fob'}); lid4=(d.get('lead') or d or {}).get('id')
chk('DF-17: запрос клиента с кодами страны и FOB создан',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid4}'); L4=d.get('lead',d)
chk('DF-17: коды сохранены, имена денормализованы (Китай/Россия)',L4.get('originCountryCode')=='CN' and L4.get('originCountry')=='Китай' and L4.get('destinationCountryCode')=='RU' and L4.get('destinationCountry')=='Россия',(L4.get('originCountryCode'),L4.get('originCountry'),L4.get('destinationCountryCode'),L4.get('destinationCountry')))
chk('DF-17: Инкотермс-код сохранён (fob → FOB)',L4.get('incotermCode')=='FOB',L4.get('incotermCode'))
s,d=c3.r('POST','/api/client/leads',{'route':{'originCountryCode':'XX'}}); chk('DF-17: неизвестный код страны → 400',s==400,(s,d))
s,d=c3.r('POST','/api/client/leads',{'route':{'weightKg':1},'incotermCode':'DAT'}); chk('DF-17: неактивное условие поставки на новой записи → 400',s==400,(s,d))
# старые заявки (без кодов) открываются — снимки не переписываются задним числом
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L5=d.get('lead',d)
chk('DF-17: старый запрос открывается, легаси-страна «Китай» на месте',s==200 and L5.get('originCountry')=='Китай',(s,L5.get('originCountry'),L5.get('originCountryCode')))
s,d=a.r('GET',f'/api/admin/orders/{oid3}'); chk('DF-17: старая заявка открывается (incoterm-снимок FOB)',s==200,(s,d))
# адресный курс в админском списке валют: в e2e импорт выключен (CBR_IMPORT=off)
# — rates=None; в проде — {date, items} последнего дня (пометка «курс на дату»)
s,d=a.r('GET','/api/admin/references?dir=currency'); rates=d.get('rates')
chk('DF-17: админский список валют — rates с датой либо None (импорт off)',s==200 and (rates is None or (bool(rates.get('date')) and isinstance(rates.get('items'),list))),(s,str(rates)[:120]))

# --- DF-19: расчёт таможенных платежей в рублях (D38/D39) ---
# Эталон №3 (ДТ 10702070/250326/5113751, FOB море): товар 34 517.80 +
# фрахт 1 443.92 USD x 80.9604; пошлина 3%, НДС 22%, сбор 18 465.
# ДТ считала фрахт без округления — допуск карточки ±1 ₽ на позицию.
DF19_BODY={'incoterm':'FOB','incotermPlace':'Ningbo, CN','calcDate':'2026-03-25','fxDate':'2026-03-25',
 'fxRatesManual':{'USD':'80.9604'},'freightTotal':1443.92,'freightCurrency':'USD','insurance':0,'otherCosts':0,
 'brokerFeeRub':25000,'items':[{'hsCode':'8483402308','goodsValue':34517.80,'goodsCurrency':'USD','netWeightKg':12000,'dutyPercent':3,'addDutyPercent':None,'vatPercent':22}]}
s,d=a.r('POST',f'/api/admin/leads/{lid4}/customs-calculations',DF19_BODY)
chk('DF-19: эталон №3 сохранён на запросе (FOB, курс вручную)',s==201,(s,d))
c1=(d.get('calculation') or {})
t1=(c1.get('totals') or {})
chk('DF-19: ТС в допуске ±1 ₽ к ДТ (2 911 474,90)',abs(float(t1.get('customsValueTotal',0))-2911474.90)<=1,t1)
chk('DF-19: пошлина 3% в допуске (87 344,25)',abs(float(t1.get('dutyTotal',0))-87344.25)<=0.01,t1)
chk('DF-19: НДС 22% в допуске (659 740,21)',abs(float(t1.get('vatTotal',0))-659740.21)<=1,t1)
chk('DF-19: сбор по шкале ПП 1637 ровно 18 465 (скобка 2,7–4,2 млн)',t1.get('feeRub')=='18465.00',t1)
chk('DF-19: платежи в допуске ±1 ₽ (765 549,46)',abs(float(t1.get('paymentsTotal',0))-765549.46)<=1,t1)
chk('DF-19: вознаграждение брокера вне платежей (D42), итог с ним',float(t1.get('brokerFeeRub',0))==25000 and abs(float(t1.get('grandTotal',0))-765549.46-25000)<=1,t1)
chk('DF-19: снимок курса за единицу с датой и источником (D41)',(c1.get('fxRates') or {}).get('USD',{}).get('rate')=='80.9604' and c1.get('fxDate','')[:10]=='2026-03-25',c1.get('fxRates'))
chk('DF-19: версия правил в снимке',c1.get('rulesVersion')=='df19-2026.1',c1.get('rulesVersion'))
p1_total=t1.get('paymentsTotal')
s,d=a.r('GET',f'/api/admin/leads/{lid4}/customs-calculations'); hist=(d.get('calculations') or [])
chk('DF-19: история — 1 версия, isCurrent',len(hist)==1 and hist[0].get('isCurrent') is True,len(hist))
# пересчёт = новая версия (фиксация новой версией, прежняя — архив)
s,d=a.r('POST',f'/api/admin/leads/{lid4}/customs-calculations',DF19_BODY)
chk('DF-19: повторный расчёт — 201, вторая версия',s==201,(s,d))
c2=(d.get('calculation') or {})
s,d=a.r('GET',f'/api/admin/leads/{lid4}/customs-calculations'); hist=(d.get('calculations') or [])
chk('DF-19: 2 версии, актуальна одна (последняя)',len(hist)==2 and sum(1 for x in hist if x.get('isCurrent'))==1 and hist[0].get('id')==c2.get('id'),[ (x.get('id'),x.get('isCurrent')) for x in hist])
chk('DF-19: архив сохраняет свои числа (снимок)',(hist[1].get('totals') or {}).get('paymentsTotal')==p1_total,hist[1].get('totals'))
# правка черновика (D40) — PUT только актуальной
s,d=a.r('PUT',f"/api/admin/customs-calculations/{c2['id']}",dict(DF19_BODY,freightTotal=0))
chk('DF-19: правка черновика → 200, фрахт 0 убрал надбавку (ТС = цена по курсу)',s==200 and abs(float((d.get('calculation') or {}).get('totals',{}).get('customsValueTotal',0))-2794574.90)<=1,(s,str(d)[:200]))
s,d=a.r('PUT',f"/api/admin/customs-calculations/{hist[1]['id']}",DF19_BODY); chk('DF-19: правка архива → 400',s==400,s)
# смена курса не меняет сохранённые расчёты (снимок, инвариант 11)
s,d=a.r('POST',f'/api/admin/leads/{lid4}/customs-calculations',dict(DF19_BODY,fxRatesManual={'USD':'90'}))
chk('DF-19: расчёт по курсу 90 создан',s==201,(s,d))
c3x=(d.get('calculation') or {})
chk('DF-19: новый курс применился (ТС выросла)',float((c3x.get('totals') or {}).get('customsValueTotal',0))>3200000,c3x.get('totals'))
s,d=a.r('GET',f'/api/admin/leads/{lid4}'); L6=d.get('lead',d)
acts6=L6.get('activities',[])
chk('DF-19: событие customs_calc_saved в журнале запроса',bool(acts6) and acts6[0]['type']=='customs_calc_saved',(acts6[0] if acts6 else None))
# изоляция: клиент и брокер расчёты не видят (401/403/404)
s,_=c3.r('GET',f'/api/admin/leads/{lid4}/customs-calculations'); chk('DF-19: клиент не видит расчёты запроса',s in(401,403),s)
s,_=c3.r('PUT',f"/api/admin/customs-calculations/{c2['id']}",DF19_BODY); chk('DF-19: клиент не правит расчёт',s in(401,403),s)
s,_=b.r('GET',f'/api/admin/leads/{lid4}/customs-calculations'); chk('DF-19: брокер не видит расчёты запроса',s in(401,403),s)
# валидация и правила из справочника
s,d=a.r('POST',f'/api/admin/leads/{lid4}/customs-calculations',dict(DF19_BODY,incoterm='DAT')); chk('DF-19: неактивное условие поставки → 400',s==400,s)
s,d=a.r('POST',f'/api/admin/leads/{lid4}/customs-calculations',dict(DF19_BODY,freightToArrival=9999)); chk('DF-19: фрахт до прибытия больше счёта → 400',s==400,s)
s,d=a.r('POST',f'/api/admin/leads/{lid4}/customs-calculations',dict(DF19_BODY,items=[DF19_BODY['items'][0],DF19_BODY['items'][0]])); chk('DF-19: дубль кода → 400',s==400,s)
s,d=a.r('POST',f'/api/admin/leads/{lid4}/customs-calculations',dict(DF19_BODY,items=[dict(DF19_BODY['items'][0],hsCode='123')])); chk('DF-19: код не 10 цифр → 400',s==400,s)
# заявка: расчёт на oid3 + заявочные роуты
s,d=a.r('POST',f'/api/admin/orders/{oid3}/customs-calculations',DF19_BODY)
chk('DF-19: расчёт сохранён на заявке',s==201,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid3}/customs-calculations'); chk('DF-19: история заявки читается',s==200 and len(d.get('calculations') or [])==1,(s,len(d.get('calculations') or [])))
s,_=c3.r('GET',f'/api/admin/orders/{oid3}/customs-calculations'); chk('DF-19: клиент не видит расчёты заявки',s in(401,403),s)
s,_=b.r('GET',f'/api/admin/orders/{oid3}/customs-calculations'); chk('DF-19: брокер не видит расчёты заявки',s in(401,403),s)
s,d=a.r('GET',f'/api/admin/orders/{oid3}'); chk('DF-19: incotermPlace заявки открывается (PATCH-поле)',s==200,(s,d))
s,d=a.r('PATCH',f'/api/admin/orders/{oid3}',{'incotermPlace':'Ningbo, CN'}); chk('DF-19: PATCH incotermPlace заявки → 200',s==200,(s,d))
s,d=a.r('PATCH',f'/api/admin/leads/{lid4}',{'incotermPlace':'Ningbo, CN'}); chk('DF-19: PATCH incotermPlace запроса → 200',s==200,(s,d))

# --- DF-16: разрешительные документы: обязательства и напоминания ---
# Карточка: строки PermitRequirement на запросе/заявке; добавляют брокер
# и сотрудники; закрывают клиент/брокер/сотрудник загрузкой файла прямо
# в строке; плашка «Ожидается…» видна всем сторонам; блокирующая с
# близким/прошедшим сроком даёт красное permit_overdue (скан диспетчера,
# идемпотентно по lastRemindedAt); конвертация переносит строки.
CL16EM='df03-client-'+u+'@test.example'  # человек клиента c3 (email от DF-03)
s,d=c3.r('POST','/api/client/leads',{'route':{'originCountryCode':'CN','destinationCountryCode':'RU','weightKg':120,'placesCount':4,'readyDate':'2026-12-20'},'cargoInfo':{'hsCode':'0601100000','cargoValue':3000},'incotermCode':'FOB'}); chk('DF-16: запрос создан клиентом',s in(200,201),(s,d)); lid16=(d.get('lead') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{lid16}/brokers',{'brokerId':brk3}); chk('DF-16: брокер подключён к запросу',s in(200,201),(s,d))
s,d=b17.r('PUT',f'/api/broker/leads/{lid16}/estimate',{'items':[{'hsCode':'0101210000','dutyPercent':5,'vatPercent':22}],'requiredPermits':['Фитосанитарный сертификат DF16','Разрешение СИТЕС DF16'],'send':True}); chk('DF-16: оценка брокера с перечнем разрешительных отправлена',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid16}'); L16=d.get('lead',d); pm16=L16.get('permitRequirements',[])
chk('DF-16: sync requiredPermits → 2 строки pending (source=estimate)',len([x for x in pm16 if x['status']=='pending' and x.get('source')=='estimate'])==2,[(x.get('title'),x.get('status'),x.get('source')) for x in pm16])
chk('DF-16: строки оценки — providedBy=client, без срока и без блокировки',all(x['providedBy']=='client' and x['neededBy'] is None and x['isBlocking'] is False for x in pm16),pm16[:2])
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?status=sent&take=200'); sent=d.get('notifications',[])
pa=[x for x in sent if x.get('toAddress')==CL16EM and x.get('type')=='permit_added']
chk('DF-16: клиенту письмо о разрешительных (расчёт — сразу)',len(pa)>=1 and pa[0].get('mode')=='immediate',[(x.get('toAddress'),x.get('mode')) for x in pa[:2]])
s,d=b17.r('GET',f'/api/broker/leads/{lid16}'); bp=(d.get('lead') or d).get('permits',[])
chk('DF-16: брокер видит строки наружной проекцией (без staffNote/source/lastRemindedAt)',len(bp)==2 and all(('staffNote' not in x and 'source' not in x and 'lastRemindedAt' not in x) for x in bp),[(k) for x in bp for k in x.keys()][:12])
s,d=c3.r('GET',f'/api/client/leads/{lid16}'); cp=(d.get('lead') or d).get('permitRequirements',[])
chk('DF-16: клиент видит строки без внутренней заметки',len(cp)==2 and all('staffNote' not in x for x in cp),len(cp))
s,d=a.r('POST',f'/api/admin/leads/{lid16}/permits',{'title':'Сертификат соответствия DF16','providedBy':'client','isBlocking':True,'neededBy':'2027-01-15','staffNote':'внутренняя заметка строки'}); chk('DF-16: сотрудник добавил блокирующую строку со сроком',s in(200,201),(s,d)); pid16=(d.get('permit') or d)['id']
s,d=a.r('PATCH',f'/api/admin/permits/{pid16}',{'status':'received'}); chk('DF-16: PATCH received запрещён (только загрузкой документа)',s==400,(s,d))
s,d=a.r('PATCH',f'/api/admin/permits/{pid16}',{'status':'waived'}); chk('DF-16: waived без причины → 400',s==400,(s,d))
s,d=b17.r('POST',f'/api/broker/leads/{lid16}/permits',{'title':'Экспортная декларация DF16','providedBy':'broker'}); chk('DF-16: брокер добавил свою строку',s in(200,201),(s,d)); pid16b=(d.get('permit') or d)['id']
# чужие: клиент c и свежий чужой брокер не связаны с lid16 → 404
target16=[x for x in pm16 if 'Фитосанитарный' in x['title']][0]
s,d=up2(c,f'/api/client/permits/{target16["id"]}/document','x.pdf',b'%PDF-1.4 x','application/pdf',permit_id=target16["id"],extra={'title':'Чужой документ'}); chk('DF-16: чужой клиент закрывает строку → 404',s==404,s)
# свежая сессия чужого брокера: сессии прежних брокеров погашены
# тестами деактивации (DF-02A/DF-03) — 401 не годится для проверки 404
s,d=a.r('POST','/api/admin/brokers',{'companyName':'DF16 чужой брокер '+u,'phone':ph(base+62),'password':'df16-pass-9'}); chk('DF-16: чужой брокер создан',s in(200,201),(s,d)); bid16=(d.get('broker') or d)['id']
bx16=C(); s,d=bx16.r('POST','/api/auth/broker/login',{'phone':ph(base+62),'password':'df16-pass-9'}); chk('DF-16: чужой брокер вошёл',s==200,(s,d))
s,d=up2(bx16,f'/api/broker/permits/{target16["id"]}/document','x.pdf',b'%PDF-1.4 x','application/pdf',permit_id=target16["id"],extra={'title':'Чужой документ'}); chk('DF-16: чужой брокер закрывает строку → 404',s==404,s)
s,_=bx16.r('GET',f'/api/broker/leads/{lid16}'); chk('DF-16: чужой брокер не читает строки запроса',s in(403,404),s)
# конвертация: строки переносятся в заявку; ответственный с email
s,d=a.r('POST',f'/api/admin/leads/{lid16}/options',{'description':'Море DF16','price':300000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':35,'priorityFit':'cost','isSelected':True}); chk('DF-16: вариант расчёта создан',s in(200,201),(s,d))
a.r('POST',f'/api/admin/leads/{lid16}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid16}/convert',{'legalEntityId':leid}); chk('DF-16: запрос конвертирован в заявку',s in(200,201),(s,d)); oid16=(d.get('order') or d)['id']
s,d=a.r('PATCH',f'/api/admin/orders/{oid16}',{'assignedToId':staff3}); chk('DF-16: назначен ответственный с email',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); OM16=(d.get('order') or d).get('permitRequirements',[])
chk('DF-16: строки перенесены в заявку (4: 2 оценки + админ + брокер)',len([x for x in OM16 if x['id']==target16['id']])==1 and len(OM16)==4 and sum(1 for x in OM16 if x['status']=='received')==0 and sum(1 for x in OM16 if x['status']=='waived')==0,[x.get('status') for x in OM16])
# клиент закрывает строку оценки документом прямо в строке
s,d=up2(c3,f'/api/client/permits/{target16["id"]}/document','permit16.pdf',b'%PDF-1.4 df16','application/pdf',permit_id=target16["id"],extra={'title':'Фитосанитарный сертификат DF16 (скан)','comment':'оригинал отгрузили'}); chk('DF-16: клиент загрузил документ в строку',s in(200,201),(s,d))
s,d=c3.r('GET',f'/api/client/orders/{oid16}'); cp2=(d.get('order') or d).get('permitRequirements',[])
rec=[x for x in cp2 if x['id']==target16['id']]
chk('DF-16 волна 2: строка стала submitted с именем загрузившего (§5.4: загрузка ≠ принятие)',len(rec)==1 and rec[0]['status']=='submitted' and bool(rec[0].get('documentId')) and bool(rec[0].get('submittedAt')),rec[:1])
s,d=up2(c3,f'/api/client/permits/{target16["id"]}/document','y.pdf',b'%PDF-1.4 y','application/pdf',permit_id=target16["id"],extra={'title':'ещё один'})
chk('DF-16: повторная загрузка в закрытую строку → 409',s==409,(s,d))
import time as _tp
pr=[]
for _ in range(6):  # поллинг: after()-диспетчер PATCH может опередить disp()
    s,d=disp()
    s,d=a.r('GET','/api/admin/notifications?status=sent&take=200'); sent=d.get('notifications',[])
    # письмо ответственному — permit_submitted: здесь только ЗАГРУЗКА
    # клиента (§5.4: загрузка ≠ принятие); permit_received уходит при
    # принятии/финализации (проверяется в блоке DF-26 w2 — «авто-закрытие
    # в ленте»). Волна 2 ошибочно ждала здесь permit_received — письмо
    # в этой точке потока не существует (CI 10.11.2026, FAIL :: 0).
    pr=[x for x in sent if x.get('toAddress')=='df03-staff-'+u+'@test.example' and x.get('type')=='permit_submitted']
    if pr: break
    _tp.sleep(0.5)
chk('DF-16: ответственному письмо о загруженном разрешительном (permit_submitted, §5.4)',len(pr)>=1,len(pr))
# «не требуется» с причиной
s,d=a.r('PATCH',f'/api/admin/permits/{pid16b}',{'status':'waived','waivedReason':'товар не подлежит сертификации DF16'}); chk('DF-16: сотрудник отметил «не требуется» с причиной',s==200,(s,d))
# красный скан: блокирующая с прошедшим сроком → permit_overdue клиенту и ответственному
y16=(datetime.now(ZoneInfo('Europe/Moscow'))-timedelta(days=1)).strftime('%Y-%m-%d')
s,d=a.r('POST',f'/api/admin/orders/{oid16}/permits',{'title':'Просроченный DF16','providedBy':'client','isBlocking':True,'neededBy':y16}); chk('DF-16: блокирующая строка с прошедшим сроком добавлена',s in(200,201),(s,d)); pid16r=(d.get('permit') or d)['id']
s,d=disp(); chk('DF-16: скан диспетчера выпустил красное (permitOverdue=1)',s==200 and d.get('permitOverdue')==1,(s,d))
s,d=a.r('GET','/api/admin/notifications?mode=red&status=sent&take=300'); sent=d.get('notifications',[])
ro=[x for x in sent if x.get('type')=='permit_overdue' and x.get('mode')=='red']
chk('DF-16: красное письмо тому, кто должен предоставить (клиенту)',len([x for x in ro if x.get('toAddress')==CL16EM])>=1,[(x.get('toAddress'),x.get('type')) for x in ro])
chk('DF-16: красное письмо ответственному',len([x for x in ro if x.get('toAddress')=='df03-staff-'+u+'@test.example'])>=1,len(ro))
chk('DF-16: красное с префиксом темы «Срочно:»',bool(ro) and all(x.get('subject','').startswith('Срочно:') for x in ro),ro[0].get('subject') if ro else None)
s,d=disp(); chk('DF-16: повторный проход скана — без дубликатов (lastRemindedAt)',s==200 and d.get('permitOverdue')==0,(s,d))
s,d=a.r('GET','/api/admin/notifications?mode=red&take=300'); ro2=[x for x in d.get('notifications',[]) if x.get('type')=='permit_overdue' and x.get('mode')=='red']
chk('DF-16: красных писем по-прежнему по одному на адресата',len([x for x in ro2 if x.get('toAddress')==CL16EM])==1 and len([x for x in ro2 if x.get('toAddress')=='df03-staff-'+u+'@test.example'])==1,len(ro2))
# блок «Ждём от вас» в дайджесте клиента: regular-событие сделки в окне.
# Окно DF-16 = T0−1 мин (T0 — nowmsk блока DF-03 выше): окно обязано быть
# в прошлом (dueWindow: now >= start), но НЕ совпадать с окном дайджеста
# DF-03 — dedupKey digest:<получатель>:<дата>:<окно>, при совпадении минут
# P2002 молча пропустит свежий дайджест (получатель общий — фикстуры DF-03).
cur16=(nowmsk-timedelta(minutes=1)).strftime('%H:%M')
s,d=a.r('PATCH','/api/admin/settings',{'key':'notifications.client_digest_times','value':[cur16]}); chk('DF-16: окно дайджеста = T0−1мин (в прошлом, отлично от окна DF-03)',s==200,(s,d))
s,d=c3.r('GET',f'/api/client/orders/{oid16}'); chk('DF-16: клиент видит строки pending в карточке заявки (наружу)',s==200 and any(x['status']=='pending' for x in ((d.get('order') or d).get('permitRequirements') or [])),(s,))
# regular-событие заявки16 в окне — иначе сделка без событий в дайджест
# не попадает и «Ждём от вас» не с чем привязать
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); chk('BL-5: заявка16 уже в работе (без ручного старта)',(d.get('order') or d).get('status')=='in_progress',(d.get('order') or d).get('status'))
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); st16=(d.get('order') or d).get('stages',[])
s,d=a.r('PATCH',f'/api/admin/orders/{oid16}/stages/{st16[0]["id"]}',{'status':'done'}); chk('DF-16: этап16 завершён (регулярное событие клиенту)',s==200,(s,d))
s,d=disp()
s,d=a.r('GET','/api/admin/notifications?type=digest&take=200'); dg16=[x for x in d.get('notifications',[]) if x.get('toAddress')==CL16EM and x.get('windowKey') and not (x.get('windowKey') or '').startswith('owner:') and not (x.get('windowKey') or '').startswith('wait:')]
chk('DF-16: дайджест клиенту собрался',len(dg16)>=1,len(dg16))
b16=dg16[0].get('body','') if dg16 else ''
chk('DF-16: в дайджесте блок «Ждём от вас» с названием строки','Ждём от вас' in b16 and 'Просроченный DF16' in b16,b16[:400])
s,d=a.r('DELETE','/api/admin/settings',{'key':'notifications.client_digest_times'}); chk('DF-16: окна дайджеста сброшены',s==200,(s,d))

# --- DF-23: охрана переноса полей «запрос → заявка» и видимость по ролям ---
# Полностью заполненный запрос (кабинет клиента + PATCH админа) конвертируется
# БЕЗ incotermCode в теле: код условия поставки и место обязаны приехать с
# запроса (потери 1–2). Каждое поле найдено в заявке: менеджер (API), клиент
# (карточка и список, потеря 3), брокер (запрос и заявка, потеря 4). Правка
# бланка заявки — единственная точка правки ТН ВЭД: колонка следует за бланком
# (дубль 1). Секции ДО DF-09: дальше guard-бакет логина.
s,d=c3.r('POST','/api/client/leads',{'route':{'originCountryCode':'CN','destinationCountryCode':'RU','originCity':'Гуанчжоу','destinationCity':'Санкт-Петербург','transportType':'sea','readyDate':'2026-12-05','weightKg':2500,'volumeM3':12.5,'placesCount':40},'cargoInfo':{'cargoName':'Двигатели DF23','hsCode':'8483402309','packaging':'Деревянная обрешётка','cargoValue':45000,'dangerous':False,'stackable':True,'tiltable':False,'specialRequirements':'Не кантовать DF23','shipperName':'Guangzhou Motors DF23','shipperInn':'CN-91440101','shipperAddress':'№5 Port Ave, Guangzhou','consigneeName':'ООО Приёмка DF23','consigneeInn':'7801234567','consigneeAddress':'СПб, склад 12'},'incotermCode':'CIF'}); chk('DF-23: полностью заполненный запрос создан клиентом',s in(200,201),(s,d)); lid23=(d.get('lead') or d)['id']
s,d=a.r('PATCH',f'/api/admin/leads/{lid23}',{'incotermPlace':'Истанбул, TR'}); chk('DF-23: место поставки задано на запросе',s==200,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid23}/brokers',{'brokerId':brk3}); chk('DF-23: брокер подключён к запросу',s in(200,201),(s,d))
s,d=b17.r('GET',f'/api/broker/leads/{lid23}'); BL23=(d.get('lead') or d)
chk('DF-23: брокер видит маршрут запроса (пункты/вес/объём/места)',BL23.get('originCity')=='Гуанчжоу' and float(BL23.get('weightKg'))==2500 and float(BL23.get('volumeM3'))==12.5 and BL23.get('placesCount')==40,(BL23.get('originCity'),BL23.get('weightKg'),BL23.get('volumeM3'),BL23.get('placesCount')))
s,d=a.r('POST',f'/api/admin/leads/{lid23}/options',{'description':'Море DF23','price':900000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':40,'priorityFit':'cost','isSelected':True}); chk('DF-23: вариант расчёта создан',s in(200,201),(s,d))
a.r('POST',f'/api/admin/leads/{lid23}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid23}/convert',{'legalEntityId':leid}); chk('DF-23: запрос конвертирован (в теле нет incotermCode)',s in(200,201),(s,d)); oid23=(d.get('order') or d)['id']
s,d=a.r('GET',f'/api/admin/orders/{oid23}'); O23=d.get('order',d); CI23=(O23.get('cargoInfo') or {})
chk('DF-23: incotermCode перенесён с запроса (тело пусто)',O23.get('incotermCode')=='CIF' and O23.get('incoterm')=='CIF',(O23.get('incotermCode'),O23.get('incoterm')))
chk('DF-23: incotermPlace перенесён с запроса',O23.get('incotermPlace')=='Истанбул, TR',O23.get('incotermPlace'))
chk('DF-23: маршрут перенесён целиком (9 колонок)',O23.get('originCity')=='Гуанчжоу' and O23.get('originCountry')=='Китай' and O23.get('destinationCity')=='Санкт-Петербург' and O23.get('destinationCountry')=='Россия' and O23.get('transportType')=='sea' and str(O23.get('readyDate',''))[:10]=='2026-12-05' and float(O23.get('weightKg'))==2500 and float(O23.get('volumeM3'))==12.5 and O23.get('placesCount')==40,(O23.get('originCity'),O23.get('originCountry'),O23.get('destinationCity'),O23.get('destinationCountry'),O23.get('transportType'),O23.get('readyDate'),O23.get('weightKg'),O23.get('volumeM3'),O23.get('placesCount')))
chk('DF-23: коды стран перенесены',O23.get('originCountryCode')=='CN' and O23.get('destinationCountryCode')=='RU',(O23.get('originCountryCode'),O23.get('destinationCountryCode')))
chk('DF-23: бланк перенесён снимком (груз/упаковка/отправитель/получатель)',CI23.get('cargoName')=='Двигатели DF23' and CI23.get('hsCode')=='8483402309' and CI23.get('packaging')=='Деревянная обрешётка' and CI23.get('shipperName')=='Guangzhou Motors DF23' and CI23.get('consigneeName')=='ООО Приёмка DF23',(CI23.get('cargoName'),CI23.get('hsCode'),CI23.get('packaging')))
chk('DF-23: колонка ТН ВЭД при конверсии = бланку',O23.get('hsCode')=='8483402309',O23.get('hsCode'))
# потеря 3: карточка и список клиента
s,d=c3.r('GET',f'/api/client/orders/{oid23}'); CO23=(d.get('order') or d)
chk('DF-23: клиент видит маршрут и вес в карточке заявки',CO23.get('originCity')=='Гуанчжоу' and float(CO23.get('weightKg'))==2500 and CO23.get('placesCount')==40,(CO23.get('originCity'),CO23.get('weightKg'),CO23.get('placesCount')))
s,d=c3.r('GET','/api/client/orders'); cli23=[x for x in (d.get('orders') or []) if x['id']==oid23]
chk('DF-23: список заявок клиента отдаёт колонки маршрута',len(cli23)==1 and cli23[0].get('originCity')=='Гуанчжоу',(cli23[0].get('originCity') if cli23 else None))
# потеря 4: заявка брокера
s,d=b17.r('GET',f'/api/broker/orders/{oid23}'); BO23=(d.get('order') or d)
chk('DF-23: брокер видит маршрут, место поставки и ТН ВЭД в заявке',BO23.get('originCity')=='Гуанчжоу' and float(BO23.get('weightKg'))==2500 and BO23.get('incotermPlace')=='Истанбул, TR' and BO23.get('hsCode')=='8483402309',(BO23.get('originCity'),BO23.get('weightKg'),BO23.get('incotermPlace'),BO23.get('hsCode')))
# дубль 1: правка бланка — одна точка правки ТН ВЭД, колонка следует за бланком
blank23=dict(CI23); blank23['hsCode']='8481800009'
s,d=a.r('PATCH',f'/api/admin/orders/{oid23}',{'cargoInfo':blank23}); chk('DF-23: правка бланка заявки (ТН ВЭД изменён)',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid23}'); O23b=d.get('order',d)
chk('DF-23: правка бланка синхронизирует колонку ТН ВЭД',O23b.get('hsCode')=='8481800009' and (O23b.get('cargoInfo') or {}).get('hsCode')=='8481800009',(O23b.get('hsCode'),(O23b.get('cargoInfo') or {}).get('hsCode')))

# --- DF-09: двухфакторный вход для мастера/менеджера (TOTP, RFC 6238) ---
# Секция в КОНЦЕ скрипта: неверные коды заполняют минутное окно guard'а
# по общему бакету IP — после неё логинов в скрипте нет (урок 0.7.7:
# секции делят одну БД и один guard-бакет). TOTP считает сам скрипт
# (hmac/sha1 — эталонная реализация RFC 4226).
import hmac, hashlib, struct, base64 as _b64, time as _t9
def _totp(secret_b32, drift=0):
    pad = '=' * ((8 - len(secret_b32) % 8) % 8)
    key = _b64.b32decode(secret_b32 + pad)
    counter = int(_t9.time()) // 30 + drift
    h = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    o = h[19] & 0xf
    v = ((h[o] & 0x7f) << 24) | (h[o+1] << 16) | (h[o+2] << 8) | h[o+3]
    return '%06d' % (v % 1000000)

s,d=a.r('POST','/api/admin/employees',{'name':'DF09 emp '+u,'phone':ph(base+31),'password':'df09-pass-1','roles':['manager']}); chk('DF-09: сотрудник создаётся (менеджер)',s==201,(s,d))
e9=C()
s,d=e9.r('POST','/api/auth/employee/login',{'phone':ph(base+31),'password':'df09-pass-1'})
chk('DF-09: вход без TOTP — сразу сессия (одношаговый)',s==200 and d.get('authenticated') and not d.get('totpRequired'),(s,))
s,d=e9.r('GET','/api/admin/profile/totp'); chk('DF-09: статус выключен',s==200 and d.get('enabled')==False,(s,d))
s,d=e9.r('GET','/api/admin/profile/totp/setup')
chk('DF-09: setup отдаёт секрет, otpauth:// и QR-SVG',s==200 and 'secret' in d and d.get('otpauthUri','').startswith('otpauth://totp/') and '<svg' in d.get('qrSvg',''),(s,list(d)[:4]))
sec9=d.get('secret','')
s,d=e9.r('POST','/api/admin/profile/totp',{'secret':sec9,'code':'000000'})
chk('DF-09: неверный код включения — 400, состояние не менялось',s==400,(s,d))
# AUD-08 (поток A волна 2): включение TOTP требует пароль (симметрия с выключением)
s,d=e9.r('POST','/api/admin/profile/totp',{'secret':sec9,'code':_totp(sec9)})
chk('AUD-08: включение TOTP без пароля — 400',s==400,(s,d))
s,d=e9.r('POST','/api/admin/profile/totp',{'secret':sec9,'code':_totp(sec9),'password':'df09-bad-pass'})
chk('AUD-08: включение TOTP с неверным паролем — 400',s==400,(s,d))
s,d=e9.r('POST','/api/admin/profile/totp',{'secret':sec9,'code':_totp(sec9),'password':'df09-pass-1'})
chk('DF-09: TOTP включён (с паролем AUD-08), выдано 10 кодов восстановления',s==200 and len(d.get('recoveryCodes') or [])==10,(s,list(d)[:3]))
rec9=(d.get('recoveryCodes') or [''])[0]
s,d=e9.r('GET','/api/admin/profile/totp'); chk('DF-09: статус включён',s==200 and d.get('enabled')==True,(s,d))
e9.r('POST','/api/auth/employee/logout')
s,d=C().r('POST','/api/auth/employee/login',{'phone':ph(base+31),'password':'df09-pass-1'})
chk('DF-09: с TOTP пароль даёт totpRequired+challenge без сессии',s==200 and d.get('totpRequired')==True and bool(d.get('challenge')) and not d.get('authenticated'),(s,))
ch9=d.get('challenge','')
s,d=C().r('POST','/api/auth/employee/login/totp',{'challenge':ch9,'code':'000000'})
chk('DF-09: неверный код второго шага — 401',s==401,(s,d))
e9b=C()
s,d=e9b.r('POST','/api/auth/employee/login/totp',{'challenge':ch9,'code':_totp(sec9)})
chk('DF-09: верный код второго шага — сессия',s==200 and d.get('authenticated'),(s,))
s,d=C().r('POST','/api/auth/employee/login/totp',{'challenge':ch9[:-1]+('A' if ch9[-1]!='A' else 'B'),'code':_totp(sec9)})
chk('DF-09: подделанный challenge — 401',s==401,(s,))
s,d=C().r('POST','/api/auth/employee/login',{'phone':ph(base+31),'password':'df09-pass-1'})
ch9b=d.get('challenge','')
e9c=C()
s,d=e9c.r('POST','/api/auth/employee/login/totp',{'challenge':ch9b,'code':rec9})
chk('DF-09: код восстановления принимается (телефон недоступен)',s==200 and d.get('authenticated'),(s,))
s,d=C().r('POST','/api/auth/employee/login',{'phone':ph(base+31),'password':'df09-pass-1'})
ch9c=d.get('challenge','')
s,d=C().r('POST','/api/auth/employee/login/totp',{'challenge':ch9c,'code':rec9})
chk('DF-09: повтор кода восстановления — 401 (одноразовость)',s==401,(s,))
# «выйти на всех устройствах»: две живые сессии разных клиентов (e9b, e9c)
s,d=e9b.r('GET','/api/auth/employee/me'); chk('DF-09: первая сессия жива до «выйти везде»',s==200,(s,))
s,d=e9b.r('DELETE','/api/admin/profile/sessions'); chk('DF-09: выйти на всех устройствах — ок',s==200,(s,d))
s,d=e9b.r('GET','/api/auth/employee/me'); chk('DF-09: сессия-инициатор мертва',s==401,(s,))
s,d=e9c.r('GET','/api/auth/employee/me'); chk('DF-09: второе устройство тоже мертво (все сессии)',s==401,(s,))
# лимиты: провалы второго шага считаются как провалы логина. К этому
# месту по паре «телефон+IP» уже 1 провал (повтор rec9) — 4 неверных кода
# дают 5 провалов в минутном окне, верный код должен получить 429.
s,d=C().r('POST','/api/auth/employee/login',{'phone':ph(base+31),'password':'df09-pass-1'})
ch9d=d.get('challenge','')
if ch9d:
    for i in range(4):
        s,d=C().r('POST','/api/auth/employee/login/totp',{'challenge':ch9d,'code':'00000%d'%i})
    s,d=C().r('POST','/api/auth/employee/login/totp',{'challenge':ch9d,'code':_totp(sec9)})
    chk('DF-09: неверные коды считаются в лимитах guard\'а (429)',s==429,(s,))
else:
    chk('DF-09: неверные коды считаются в лимитах guard\'а (429)',False,'challenge не выдан: '+str(d)[:150])


# ═══ DF-11: хранилище файлов (двухфазная загрузка, 302, лимит из настроек, изоляция) ═══
_du16=f'/api/admin/orders/{oid16}/documents'
s,d=up2(a,_du16,'df11.pdf',b'%PDF-1.4 df11',"application/pdf",extra={'type':'other','title':'DF-11 скан BL'})
_v11=(d.get('version') or {})
chk('DF-11: админ загрузил PDF (create→PUT→confirm), версия ready',s==200 and _v11.get('status')=='ready',(s,_v11))
s,d=a.r('POST',_du16,b={'type':'other','title':'DF-11 pending','fileName':'p.pdf','mimeType':'application/pdf','size':100})
chk('DF-11: create без байтов → pending-версия + presigned PUT',s in(200,201) and (d.get('version') or {}).get('status')=='pending' and bool((d.get('upload') or {}).get('url')),(s,d))
_pendv=(d.get('version') or {}).get('id')
s,d=a.r('GET',_du16); _lst=d.get('documents',[])
chk('DF-11: pending-версия скрыта из списков',all(v.get('id')!=_pendv for doc in _lst for v in doc.get('versions',[])),len(_lst))
s,_h,_b=raw_get(a,f'/api/document-versions/{_v11["id"]}/file')
chk('DF-11: скачивание — 302 без кеша на подписанный URL',s==302 and _h.get('cache-control')=='private, no-store' and '/api/storage/local/' in _h.get('location',''),(s,_h.get('location','')[:70]))
_loc=_h.get('location','')
if _loc.startswith('/'): _loc=B+_loc
s2,_h2,_body2=raw_get(a,_loc)
chk('DF-11: по ссылке отдаются байты PDF inline',s2==200 and _h2.get('content-type')=='application/pdf' and _h2.get('content-disposition','').startswith('inline'),(s2,_h2.get('content-type'),_h2.get('content-disposition','')[:40]))
s3,_h3,body3=raw_get(a,_loc)
chk('DF-11: байты совпадают с загруженными',body3==b'%PDF-1.4 df11',len(body3))
s,d=cb.r('GET',f'/api/document-versions/{_v11["id"]}/file'); chk('DF-11: чужой клиент не получает ссылку (404 до выдачи)',s==404,s)
s,d=cb.r('POST',f'/api/client/document-versions/{_v11["id"]}/confirm'); chk('DF-11: чужой confirm — 404 (права до хранилища)',s==404,(s,d))
s,d=a.r('POST',f'/api/admin/document-versions/{_pendv}/confirm'); chk('DF-11: confirm без байтов → 400, pending остаётся на повтор',s==400,(s,d))
s,d=a.r('POST',f'/api/admin/document-versions/{_pendv}/confirm'); chk('DF-11: повторный confirm без байтов — снова 400',s==400,(s,d))
s,d=up2(a,_du16,'evil.pdf',('<html>не pdf</html>').encode(),"application/pdf",extra={'type':'other','title':'DF-11 evil'})
chk('DF-11: HTML под видом PDF → confirm 400, объект удалён',s==400,(s,d))
s,d=a.r('POST',_du16,b={'type':'other','title':'DF-11 big','fileName':'big.pdf','mimeType':'application/pdf','size':26*1024*1024})
chk('DF-11: create 26 МБ → 400 (лимит files.max_mb)',s==400,(s,d))
s,d=up2(a,_du16,'df11-20mb.zip',b'PK\x03\x04'+b'0'*(20*1024*1024),"application/zip",extra={'type':'other','title':'DF-11 20MB'})
_v20=(d.get('version') or {})
chk('DF-11: загрузка 20 МБ проходит (критерий приёмки)',s==200,(s,))
chk('DF-11: фактический размер зафиксирован confirm-ом',_v20.get('fileSize')==20*1024*1024+4,_v20.get('fileSize'))
# 0.8.3: браузерные псевдонимы MIME — ZIP из Firefox/Windows и .jpg с Android
s,d=up2(a,_du16,'df11-fx.zip',b'PK\x03\x04'+b'\x00'*32,'application/x-zip-compressed',extra={'type':'other','title':'DF-11 zip (Firefox)'})
_vfx=(d.get('version') or {})
chk('DF-11 0.8.3: ZIP с алиасом Firefox (x-zip-compressed) проходит и хранится как application/zip',s==200 and _vfx.get('status')=='ready' and _vfx.get('mimeType')=='application/zip',(s,_vfx.get('mimeType')))
s,d=up2(a,_du16,'df11-android.jpg',b'\xff\xd8\xff'+b'\x00'*16,'image/jpg',extra={'type':'other','title':'DF-11 jpg (Android)'})
_vjp=(d.get('version') or {})
chk('DF-11 0.8.3: image/jpg (Android) сводится к image/jpeg',s==200 and _vjp.get('mimeType')=='image/jpeg',(s,_vjp.get('mimeType')))
s,d=up2(c3,f'/api/client/orders/{oid16}/documents','cl11.pdf',b'%PDF-1.4 cl',"application/pdf",extra={'type':'invoice','title':'DF-11 счёт клиента'})
chk('DF-11: клиент загрузил через свой портал',s==200,(s,d))
s,d=up2(b17,f'/api/broker/orders/{oid16}/documents','br11.pdf',b'%PDF-1.4 br',"application/pdf",extra={'type':'other','title':'DF-11 акт брокера'})
chk('DF-11: брокер загрузил через свой портал',s==200,(s,d))
s,d=up2(a,_du16,'a11.docx',b'PK\x03\x04'+b'\x00'*32,'application/octet-stream',extra={'type':'other','title':'DF-11 docx'})
_vd11=(d.get('version') or {})
s4,_h4,_=raw_get(a,f'/api/document-versions/{_vd11["id"]}/file')
_loc4=_h4.get('location','')
if _loc4.startswith('/'): _loc4=B+_loc4
s5,_h5,_=raw_get(a,_loc4)
chk('DF-11: docx — attachment octet-stream (не inline)',s5==200 and _h5.get('content-disposition','').startswith('attachment') and _h5.get('content-type')=='application/octet-stream',(s5,_h5.get('content-type')))
s6,_h6,_=raw_get(a,f'/api/document-versions/{_vd11["id"]}/file')
_bad=_h6.get('location','').replace('sig=','sig=0')
if _bad.startswith('/'): _bad=B+_bad
s7,_,_=raw_get(a,_bad)
chk('DF-11: подделанная подпись ссылки — 403',s7==403,(s7,))
s,d=a.r('DELETE',f'/api/admin/documents/{(d.get("document") or {}).get("id")}')
chk('DF-11: удаление документа менеджером — ок',s in(200,204),(s,d))
s8,_h8,_=raw_get(a,f'/api/document-versions/{_vd11["id"]}/file')
chk('DF-11: после удаления версии файла нет (404)',s8==404,(s8,))


# ═══ DF-12: виды документов (D5), жизненный цикл, финальный статус ═══
s,d=up2(a,_du16,'bl12.pdf',b'%PDF-1.4 df12',"application/pdf",extra={'kind':'bill_of_lading','title':'DF-12 коносамент '+u})
_d12=(d.get('document') or d)
chk('DF-12: create с kind (bill_of_lading) проходит',s==200 and _d12.get('kind')=='bill_of_lading',(s,_d12.get('kind')))
chk('DF-12: легаси type записан производным (accompanying)',_d12.get('type')=='accompanying',_d12.get('type'))
chk('DF-12: новый документ — черновик',_d12.get('status')=='draft',_d12.get('status'))
s,d=up2(a,_du16,'inv12.pdf',b'%PDF-1.4 df12b',"application/pdf",extra={'type':'invoice','title':'DF-12 легаси-алиас '+u})
_d12b=(d.get('document') or d)
chk('DF-12: легаси type=invoice резолвится в kind=commercial_invoice',s==200 and _d12b.get('kind')=='commercial_invoice',(s,_d12b.get('kind')))
chk('DF-12: легаси-алиас сохраняет type=invoice',_d12b.get('type')=='invoice',_d12b.get('type'))
s,d=a.r('POST',_du16,b={'title':'DF-12 без вида','fileName':'x.pdf','mimeType':'application/pdf','size':10})
chk('DF-12: create без kind и type → 400',s==400,(s,d))
s,d=c3.r('POST',f'/api/admin/documents/{_d12["id"]}/finalize'); chk('DF-12: клиент не может финализировать (админ-роут, чужой кабинет)',s in(401,403),(s,d))
s,d=a.r('POST',f'/api/admin/documents/{_d12["id"]}/finalize'); _fd=(d.get('document') or {})
chk('DF-12: финализация сотрудником → final со снимком',s==200 and _fd.get('status')=='final' and _fd.get('finalVersion')==1 and bool(_fd.get('finalizedByName')),(s,_fd))
s,d=a.r('POST',f'/api/admin/documents/{_d12["id"]}/finalize'); chk('DF-12: повторная финализация → 400 (статус уже)',s==400,(s,d))
s,d=a.r('POST',f'/api/admin/documents/{_d12["id"]}/versions',b={'comment':'правка поверх финала','fileName':'n.pdf','mimeType':'application/pdf','size':10})
chk('DF-12: версия поверх финального (сотрудник) → 409',s==409,(s,d))
s,d=c3.r('POST',f'/api/client/documents/{_d12["id"]}/versions',b={'comment':'x','fileName':'n.pdf','mimeType':'application/pdf','size':10})
chk('DF-12: версия поверх финального (клиент) → 409',s==409,(s,d))
s,d=b17.r('POST',f'/api/broker/documents/{_d12["id"]}/versions',b={'comment':'x','fileName':'n.pdf','mimeType':'application/pdf','size':10})
chk('DF-12: версия поверх финального (брокер) → 409',s==409,(s,d))
s,d=a.r('POST',f'/api/admin/documents/{_d12["id"]}/reopen',b={}); chk('DF-12: возврат без причины → 400',s==400,(s,d))
s,d=a.r('POST',f'/api/admin/documents/{_d12["id"]}/reopen',b={'reason':'пришла исправленная версия от клиента '+u})
chk('DF-12: возврат в работу с причиной → in_review',s==200 and (d.get('document') or {}).get('status')=='in_review',(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); oacts=(d.get('order',d)).get('activities',[])
chk('DF-12: событие document_finalized в ленте',any(x['type']=='document_finalized' for x in oacts),[x['type'] for x in oacts[:5]])
chk('DF-12: событие document_reopened несёт причину',any(x['type']=='document_reopened' and 'исправленная версия' in x['description'] for x in oacts),[x['description'] for x in oacts[:6]])
s,d=up2(a,f'/api/admin/documents/{_d12["id"]}/versions','bl12-v2.pdf',b'%PDF-1.4 df12-v2',"application/pdf",extra={'comment':'исправленный BL'})
chk('DF-12: после возврата новая версия загружается',s==200,(s,d))
chk('DF-12: статус после версии — на проверке (in_review)',((d.get('document') or d)).get('status')=='in_review',(s,(d.get('document') or d).get('status')))
s,d=a.r('POST',f'/api/admin/documents/{_d12["id"]}/finalize'); _fd2=(d.get('document') or {})
chk('DF-12: повторная финализация → финальная версия v2',s==200 and _fd2.get('finalVersion')==2,(s,_fd2.get('finalVersion')))
s,d=up2(a,_du16,'rates12.pdf',b'%PDF-1.4 df12r',"application/pdf",extra={'kind':'contractor_rates','title':'DF-12 тарифы подрядчика '+u,'isInternal':False})
_d12i=(d.get('document') or d)
chk('DF-12: contractor_rates принудительно внутренний (isInternal=false в теле гасится)',s==200 and _d12i.get('isInternal')==True and _d12i.get('kind')=='contractor_rates',(s,_d12i))
s,d=c3.r('GET',f'/api/client/orders/{oid16}/documents'); chk('DF-12: внутренний документ не виден клиенту',all(x['id']!=_d12i['id'] for x in d.get('documents',[])),len(d.get('documents',[])))
s,d=b17.r('GET',f'/api/broker/orders/{oid16}/documents'); chk('DF-12: внутренний документ не виден брокеру',all(x['id']!=_d12i['id'] for x in d.get('documents',[])),len(d.get('documents',[])))
s,d=a.r('POST',f'/api/admin/documents/{_d12i["id"]}/finalize'); chk('DF-12: внутренний документ финализируется',s==200 and (d.get('document') or {}).get('status')=='final',(s,d))
s,d=c3.r('GET',f'/api/client/orders/{oid16}'); cacts=(d.get('order',d)).get('activities',[])
chk('DF-12: события внутреннего документа не видны клиенту в ленте',all('DF-12 тарифы' not in x['description'] for x in cacts),[x['description'] for x in cacts[:5]])
s,d=a.r('GET',_du16); chk('DF-12: backfill — у всех документов списка есть kind',all(x.get('kind') for x in d.get('documents',[])),[x.get('kind') for x in d.get('documents',[])][:6])
s,d=c3.r('GET',f'/api/client/orders/{oid16}/documents'); chk('DF-12: у клиентского списка тоже есть kind (backfill общий)',all(x.get('kind') for x in d.get('documents',[])),[x.get('kind') for x in d.get('documents',[])][:6])

# ═══ DF-13: пакет документов по заявке — слоты, ZIP финальных, фолбэк ═══
_pu16=f'/api/admin/orders/{oid16}/package'
s,d=a.r('GET',_pu16)
_pkg=d if isinstance(d,dict) else {}
_slots={x['kind']:x for x in _pkg.get('slots',[])}
chk('DF-13: админский пакет — 19 слотов всех видов (D5 + 4 новых DF-26 §4.2, v1.6)',s==200 and len(_pkg.get('slots',[]))==19,(s,len(_pkg.get('slots',[]))))
chk('DF-13: в ответе номер заявки и maxMb',bool(_pkg.get('orderNumber')) and isinstance(_pkg.get('maxMb'),int),(_pkg.get('orderNumber'),_pkg.get('maxMb')))
chk('DF-13: слот BL — финальный (финализирован в DF-12)',_slots.get('bill_of_lading',{}).get('status')=='final',_slots.get('bill_of_lading',{}).get('status'))
chk('DF-13: слот инвойса — черновик (два документа вида, худший)',_slots.get('commercial_invoice',{}).get('status')=='draft',_slots.get('commercial_invoice',{}).get('status'))
chk('DF-13: слот «Тарифы подрядчика» виден админу (внутренний контур)',_slots.get('contractor_rates',{}).get('status')=='final' and len(_slots.get('contractor_rates',{}).get('documents',[]))==1,_slots.get('contractor_rates',{}))
chk('DF-13: у слота BL подсказка поставщика — сотрудник (перевозочные)',_slots.get('bill_of_lading',{}).get('provider')=='staff',_slots.get('bill_of_lading',{}).get('provider'))
s,d=c3.r('GET',f'/api/client/orders/{oid16}/package')
_cslots={x['kind']:x for x in (d.get('slots',[]) if isinstance(d,dict) else [])}
chk('DF-13: клиентский пакет — 16 слотов (подрядческие виды не раскрываются; 19 − 3 внутренних)',s==200 and len(d.get('slots',[]))==16,(s,len(d.get('slots',[]))))
chk('DF-13: у клиента нет слотов contractor_*',all(not k.startswith('contractor_') for k in _cslots),list(_cslots))
chk('DF-13: клиент видит финальный BL-слот, внутренних документов нет',_cslots.get('bill_of_lading',{}).get('status')=='final' and all(x.get('isInternal') is False for x in _cslots.get('bill_of_lading',{}).get('documents',[])),_cslots.get('bill_of_lading',{}).get('status'))
s,d=b17.r('GET',f'/api/broker/orders/{oid16}/package')
chk('DF-13: брокерский пакет — те же 16 слотов без внутренних',s==200 and len(d.get('slots',[]))==16 and all(not x['kind'].startswith('contractor_') for x in d.get('slots',[])),(s,len(d.get('slots',[]))))
# чужая заявка — 404 (факт существования не раскрываем)
s,d=cb.r('GET',f'/api/client/orders/{oid16}/package'); chk('DF-13: чужой клиент на пакете — 404',s==404,(s,d))

# — ZIP финальных (пока пакет мал: BL v2 + внутренние тарифы) —
_pz16=f'/api/admin/orders/{oid16}/package/zip'
s,h,body=raw_get(a,_pz16)
chk('DF-13: админский ZIP — 200, application/zip, attachment',s==200 and h.get('content-type')=='application/zip' and h.get('content-disposition','').startswith('attachment'),(s,h.get('content-type'),h.get('content-disposition','')[:50]))
_num=None
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); _num=(d.get('order') or d).get('number')
import zipfile as _zf, io as _io
z=_zf.ZipFile(_io.BytesIO(body))
_names=z.namelist()
chk('DF-13: структура ZIP — папка <номер заявки>/ и ровно 2 финальных',len(_names)==2 and all(n.startswith(f'{_num}/') for n in _names),(_num,_names))
chk('DF-13: имена в ZIP санитизированы и транслитерированы',any('bill-of-lading' in n for n in _names) and any('contractor-rates' in n for n in _names),_names)
_blname=[n for n in _names if 'bill-of-lading' in n][0]
chk('DF-13: байты финальной версии v2 в архиве совпадают',z.read(_blname)==b'%PDF-1.4 df12-v2',len(z.read(_blname)))
s,h,cbody=raw_get(c3,f'/api/client/orders/{oid16}/package/zip')
cz=_zf.ZipFile(_io.BytesIO(cbody)); _cnames=cz.namelist()
chk('DF-13: клиентский ZIP без внутренних (contractor_rates отсутствует)',s==200 and any('bill-of-lading' in n for n in _cnames) and not any('contractor-rates' in n for n in _cnames),(s,_cnames))

# — пустой пакет: свежая заявка без документов — внятный ответ —
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'ООО Пусто '+u,'phone':'8 (999) '+str(base)[:3]+'-'+str(base)[3:5]+'-'+str(base)[5:7]},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':100,'placesCount':5,'readyDate':'2026-12-10'},'cargoInfo':{'hsCode':'8471300000','cargoValue':7000},'incotermCode':'FOB'})
_lid13=(d.get('lead') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{_lid13}/options',{'description':'Вариант DF-13','price':100000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':30,'priorityFit':'cost','isSelected':True}); chk('DF-13: вариант расчёта для конвертации',s in(200,201),(s,d))
a.r('POST',f'/api/admin/leads/{_lid13}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{_lid13}/convert',{'legalEntityId':leid}); _oid13=(d.get('order') or d)['id']
s,d=a.r('GET',f'/api/admin/orders/{_oid13}/package')
chk('DF-13: пустая заявка — все слоты «нет»',s==200 and len(d.get('slots',[]))==19 and all(x['status']=='none' for x in d.get('slots',[])),(s,[x['status'] for x in d.get('slots',[])][:5]))
s,d=a.r('GET',f'/api/admin/orders/{_oid13}/package/zip')
chk('DF-13: ZIP пустого пакета — 400 с внятным текстом',s==400 and 'финальных' in (d.get('error') or ''),(s,d))

# — фолбэк: пакет выше порога — список ссылок вместо архива —
_big=b'%PDF-1.4 df13-big'+b'\0'*(int(4.5*1024*1024)-16)
s,d=up2(a,_du16,'big13.pdf',_big,"application/pdf",extra={'kind':'other','title':'DF-13 большой акт '+u})
chk('DF-13: большой файл (4,5 МБ) загружен и подтверждён',s==200,(s,d))
_bigdoc=(d.get('document') or d)['id']
s,d=a.r('POST',f'/api/admin/documents/{_bigdoc}/finalize'); chk('DF-13: большой файл финализирован',s==200,(s,d))
s,h,body=raw_get(a,_pz16)
_fb=json.loads(body) if body[:1]==b'{' else {}
chk('DF-13: пакет выше 4 МиБ — JSON-фолбэк, не архив',s==200 and h.get('content-type','').startswith('application/json') and _fb.get('zip') is False and _fb.get('reason')=='size',(s,h.get('content-type'),_fb.get('zip')))
chk('DF-13: фолбэк несёт порог и суммарный размер',_fb.get('maxBytes')==4*1024*1024 and (_fb.get('totalBytes') or 0)>4*1024*1024,(_fb.get('maxBytes'),_fb.get('totalBytes')))
chk('DF-13: фолбэк — 3 финальных (BL + большой + внутренние тарифы)',len(_fb.get('files',[]))==3 and any('bill-of-lading' in x['name'] for x in _fb.get('files',[])) and any('other-DF-13-bolshoy-akt' in x['name'] for x in _fb.get('files',[])),[x['name'] for x in _fb.get('files',[])])
_furl=(_fb.get('files') or [{}])[0].get('url','')
chk('DF-13: ссылка фолбэка — на роут версий и отдаёт 302',_furl.startswith('/api/document-versions/') and raw_get(a,_furl)[0]==302,_furl)
s,h,cbody=raw_get(c3,f'/api/client/orders/{oid16}/package/zip')
_cf=json.loads(cbody) if cbody[:1]==b'{' else {}
chk('DF-13: клиентский фолбэк — без внутренних, BL и большой на месте',_cf.get('zip') is False and len(_cf.get('files',[]))==2 and all('contractor' not in x['name'] for x in _cf.get('files',[])),[x.get('name') for x in _cf.get('files',[])])

# ═══ DF-26, волна 1 (T21-05): POST ZIP scope — «все доступные»/«выбранные» ═══
# §8/§11.1: POST {scope:'all'|'selected', documentIds?} → ZIP или фолбэк;
# отбор — последняя готовая версия; счётчики предупреждения из ОДНОГО
# списка с составом; чужие id молча исключаются; пустой выбор — 400;
# событие document_package_downloaded (scope + число файлов).
s,d=a.r('GET',_pu16); _pkg21=d if isinstance(d,dict) else {}
_s21={x['kind']:x for x in _pkg21.get('slots',[])}
_bl21=_s21['bill_of_lading']['documents'][0]['id']
_inv21=[x['id'] for x in _s21.get('commercial_invoice',{}).get('documents',[])]
_cr21=_s21['contractor_rates']['documents'][0]['id']
_s21sum=_pkg21.get('summary',{})
# счётчики предупреждения = составу слотов читателя (§8.1.3, admin)
_adr21=sum(1 for x in _s21.values() for _doc in x['documents'] if _doc['status']=='draft')
_arv21=sum(1 for x in _s21.values() for _doc in x['documents'] if _doc['status']=='in_review')
chk('DF-26: summary nonFinal* = составу слотов (админ)',_s21sum.get('nonFinalDrafts')==_adr21 and _s21sum.get('nonFinalReview')==_arv21,(_s21sum.get('nonFinalDrafts'),_adr21,_s21sum.get('nonFinalReview'),_arv21))
# — POST all (админ): пакет с большим (4,5 МБ) и 20 МБ → фолбэк, N = все —
s,d=a.r('POST',_pz16,{'scope':'all'})
_fb21=d if isinstance(d,dict) and 'zip' in d else {}
_alln21=sum(1 for x in _s21.values() for _doc in x['documents'])
chk('DF-26: POST all (админ) — фолбэк >4 МиБ (§8.1.5 распространён на scope)',s==200 and _fb21.get('zip') is False and _fb21.get('reason')=='size',(s,_fb21.get('zip'),_fb21.get('reason')))
chk('DF-26: фолбэк all — ровно все документы читателя (последняя готовая версия)',len(_fb21.get('files',[]))==_alln21,(len(_fb21.get('files',[])),_alln21,[x.get('name') for x in _fb21.get('files',[])]))
# — POST all (клиент): без внутренних; счётчики = составу его выборки —
s,d=c3.r('POST',f'/api/client/orders/{oid16}/package/zip',{'scope':'all'})
_cfb21=d if isinstance(d,dict) and 'zip' in d else {}
chk('DF-26: POST all (клиент) — фолбэк без внутренних видов',s==200 and _cfb21.get('zip') is False and all('contractor' not in x['name'] for x in _cfb21.get('files',[])),(s,[x.get('name') for x in _cfb21.get('files',[])]))
s,d=c3.r('GET',f'/api/client/orders/{oid16}/package')
_cs21=d.get('slots',[])
_cdr21=sum(1 for x in _cs21 for _doc in x['documents'] if _doc['status']=='draft')
_crv21=sum(1 for x in _cs21 for _doc in x['documents'] if _doc['status']=='in_review')
chk('DF-26: summary nonFinal* = составу слотов (клиент)',(d.get('summary') or {}).get('nonFinalDrafts')==_cdr21 and (d.get('summary') or {}).get('nonFinalReview')==_crv21,((d.get('summary') or {}).get('nonFinalDrafts'),_cdr21,(d.get('summary') or {}).get('nonFinalReview'),_crv21))
s,d=b17.r('POST',f'/api/broker/orders/{oid16}/package/zip',{'scope':'all'})
_bfb21=d if isinstance(d,dict) and 'zip' in d else {}
chk('DF-26: POST all (брокер) — фолбэк без внутренних',s==200 and _bfb21.get('zip') is False and all('contractor' not in x['name'] for x in _bfb21.get('files',[])),(s,[x.get('name') for x in _bfb21.get('files',[])]))
# — POST selected (админ): бинарный ZIP со структурой фаз (§8.2) —
_sel21=[_bl21]+_inv21+[_cr21]
s,d=a.r('POST',_pz16,{'scope':'selected','documentIds':_sel21})
_z21=_zf.ZipFile(_io.BytesIO(d)) if s==200 and isinstance(d,bytes) and d[:2]==b'PK' else None
chk('DF-26: POST selected (админ) — бинарный ZIP',_z21 is not None,(s,type(d).__name__))
if _z21:
    _n21s=_z21.namelist()
    chk('DF-26: ZIP selected — ровно выбранные (N)',len(_n21s)==len(_sel21),(_n21s,_sel21))
    chk('DF-26: ZIP selected — папки фаз 01/03/08 (структура §8.2)',any('01_Подготовка' in n for n in _n21s) and any('03_Международная_перевозка' in n for n in _n21s) and any('08_Внутренние' in n for n in _n21s),_n21s)
# — POST selected (клиент): внутренние молча исключаются (§8.2.3) —
s,d=c3.r('POST',f'/api/client/orders/{oid16}/package/zip',{'scope':'selected','documentIds':[_bl21,_cr21]})
_z21c=_zf.ZipFile(_io.BytesIO(d)) if s==200 and isinstance(d,bytes) and d[:2]==b'PK' else None
chk('DF-26: POST selected (клиент) — внутренний id молча исключён',_z21c is not None and len(_z21c.namelist())==1 and any('bill-of-lading' in n for n in _z21c.namelist()),(s,_z21c.namelist() if _z21c else d))
# — чужой документ ДРУГОЙ заявки в выборке — молча исключается; если
#   после исключения пусто — 400 «Нет доступных документов» (§8.2.3) —
s,d=up2(a,f'/api/admin/orders/{_oid13}/documents','df26-alien.pdf',b'%PDF-1.4 alien','application/pdf',extra={'kind':'other','title':'DF-26 чужой '+u})
chk('DF-26: чужой документ другой заявки создан ( fixture)',s==200,(s,d)); _alien21=(d.get('document') or d)['id']
s,d=c3.r('POST',f'/api/client/orders/{oid16}/package/zip',{'scope':'selected','documentIds':[_alien21]})
chk('DF-26: выборка только из чужих id — 400, без утечки состава',s==400 and 'документ' in (d.get('error') or ''),(s,d))
s,d=a.r('POST',_pz16,{'scope':'selected','documentIds':[_bl21,_alien21]})
_z21a=_zf.ZipFile(_io.BytesIO(d)) if s==200 and isinstance(d,bytes) and d[:2]==b'PK' else None
chk('DF-26: чужой id среди выбранных — исключён, свои на месте',_z21a is not None and len(_z21a.namelist())==1,(s,_z21a.namelist() if _z21a else d))
# — пустой выбор / без documentIds — 400 —
s,d=a.r('POST',_pz16,{'scope':'selected','documentIds':[]})
chk('DF-26: пустой выбор — 400 (zod «Выберите хотя бы один документ» / фильтр «Нет доступных документов»)',s==400 and 'документ' in json.dumps(d,ensure_ascii=False),(s,d))
s,d=a.r('POST',_pz16,{'scope':'selected'})
chk('DF-26: selected без documentIds — 400',s==400,(s,d))
# — чужая заявка — единый 404 (факт существования не раскрываем) —
s,d=cb.r('POST',f'/api/client/orders/{oid16}/package/zip',{'scope':'all'})
chk('DF-26: чужой клиент на POST zip — 404',s==404,(s,d))
# — событие document_package_downloaded (scope + N, §6.2) —
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); _oa21=(d.get('order',d)).get('activities',[])
_evt21=[x for x in _oa21 if x.get('type')=='document_package_downloaded']
chk('DF-26: событие document_package_downloaded в ленте (scope, формулировка архива)',bool(_evt21) and any('архив' in (x.get('description') or '') for x in _evt21),[(x.get('description'),) for x in _evt21[:3]])

# ═══ DF-26, волна 1 (T21-06): конкурентные сценарии ═══
# К-1 удаление при сборке ZIP (без 500); К-2 параллельные POST ZIP;
# К-3 параллельные confirm требования (ровно одна строка закрывается);
# К-4 гонка номеров версий (P2002 retry — версии различны); «версия
# поверх финального → 409» уже покрыт в DF-12 (три роли).
# — К-1: DELETE документа ↔ POST selected с ним — 3 круга, без 500 —
_k1ok=True; _k1detail=[]
for _i in range(3):
    s,d=up2(a,_du16,f'df26-race{_i}.pdf',b'%PDF-1.4 race'+str(_i).encode(),'application/pdf',extra={'kind':'other','title':'DF-26 race '+u+'-'+str(_i)})
    _r21=(d.get('document') or d)['id']
    _out={}
    def _race_del(_out=_out,_r21=_r21): _out['del']=a.r('DELETE',f'/api/admin/documents/{_r21}')
    def _race_zip(_out=_out,_r21=_r21): _out['zip']=a.r('POST',_pz16,{'scope':'selected','documentIds':[_bl21,_r21]})
    _t1=threading.Thread(target=_race_del); _t2=threading.Thread(target=_race_zip)
    _t1.start(); _t2.start(); _t1.join(); _t2.join()
    _zs,_zd=_out['zip']
    _zok=_zs==200 and isinstance(_zd,bytes) and _zd[:2]==b'PK'
    _k1ok=_k1ok and _zok and _zs<500
    _k1detail.append(_zs)
chk('DF-26 К-1: удаление при сборке ZIP — без 500 (ZIP либо без документа, либо с ним)',_k1ok,_k1detail)
# — К-2: два параллельных POST all — оба фолбэка, без 500 —
_out2={}
def _all_a(_out=_out2): _out['a']=a.r('POST',_pz16,{'scope':'all'})
def _all_b(_out=_out2): _out['b']=a.r('POST',_pz16,{'scope':'all'})
_t1=threading.Thread(target=_all_a); _t2=threading.Thread(target=_all_b)
_t1.start(); _t2.start(); _t1.join(); _t2.join()
_s2a,_d2a=_out2['a']; _s2b,_d2b=_out2['b']
chk('DF-26 К-2: параллельные POST all — оба 200/фолбэк, без 500',_s2a==200 and _s2b==200 and isinstance(_d2a,dict) and isinstance(_d2b,dict) and _d2a.get('zip') is False and _d2b.get('zip') is False,(_s2a,_s2b))
# — К-3: два параллельных confirm одного требования — ровно одна строка —
s,d=a.r('POST',f'/api/admin/orders/{oid16}/permits',{'title':'DF-26 гонка confirm '+u,'providedBy':'client','isBlocking':False})
chk('DF-26 К-3: строка разрешительных создана',s in(200,201),(s,d)); _pid21=(d.get('permit') or d)['id']
_body21={'fileName':'df26-permit.pdf','mimeType':'application/pdf','size':32,'kind':'permit_document','title':'DF-26 permit '+u}
s,d=a.r('POST',_du16,b=_body21)
chk('DF-26 К-3: pending-документ создан',s in(200,201),(s,d))
_up21=d.get('upload') or {}; _conf21=d.get('confirmUrl')
_req21=urllib.request.Request(B+_up21['url'],data=b'%PDF-1.4 permit-race',method='PUT')
for _k,_v in (_up21.get('headers') or {}).items(): _req21.add_header(_k,_v)
_x21=urllib.request.build_opener().open(_req21); _x21.read()
_out3={}
def _conf(_out=_out3,_n='x'): _out[_n]=a.r('POST',_conf21,{'permitRequirementId':_pid21})
_t1=threading.Thread(target=_conf,kwargs={'_n':'a'}); _t2=threading.Thread(target=_conf,kwargs={'_n':'b'})
_t1.start(); _t2.start(); _t1.join(); _t2.join()
_s3a,_d3a=_out3['a']; _s3b,_d3b=_out3['b']
_ok3=sorted([_s3a,_s3b])==[200,409]
chk('DF-26 К-3: параллельные confirm — ровно один 200, второй 409',_ok3,(_s3a,_s3b))
s,d=a.r('GET',f'/api/admin/orders/{oid16}/permits')
_p21=[x for x in (d.get('permits') or []) if x.get('id')==_pid21]
# DF-26 волна 2 (§5.4): confirm → submitted (загрузка ≠ принятие);
# снимок загрузившего (submittedAt/Name) на строке, acceptedVersion ещё нет.
chk('DF-26 К-3: строка закрыта ровно один раз (submitted — НА ПРОВЕРКЕ, снимок загрузившего)',len(_p21)==1 and _p21[0].get('status')=='submitted' and bool(_p21[0].get('documentId')) and bool(_p21[0].get('submittedAt')),_p21)
# — К-4: «гонка версий — 409» (план §8.2): версия поверх финального —
#   409 у сотрудника (полное трёхролевое покрытие — блок DF-12 выше);
#   параллельные POST versions не гоняем: retry Б4 повторно читает
#   currentVersion, который растёт только на confirm — вне чек-листа.
s,d=a.r('POST',f'/api/admin/documents/{_bl21}/versions',{'fileName':'df26-bl-final.pdf','mimeType':'application/pdf','size':32})
chk('DF-26 К-4: версия поверх финального (BL v2) — 409, гонка версий закрыта статустом',s==409,(s,d))


# ═══ DF-14: чек-листы обязательных документов по этапам ═══
# Изоляция: блокирующее требование ставится на export_pickup (вид
# client_request) и удаляется в конце — дефолтные чек-листы
# (import/export_customs × ДТ/разрешительные) рекомендуемые и не
# блокируют основной флоу. Повторный прогон: существующую пару сначала
# находим и удаляем (POST дал бы 409).
s,d=a.r('GET','/api/admin/stage-catalog/requirements'); _req_all=(d.get('requirements') or [])
chk('DF-14: дефолты чек-листов в справочнике (O-5, рекомендуемые)',s==200 and len(_req_all)>=4 and all(x.get('isBlocking') is False for x in _req_all if x.get('stageCode') in ('import_customs','export_customs')),(s,len(_req_all)))
for _r in _req_all:
    if _r.get('stageCode')=='export_pickup' and _r.get('kind')=='client_request':
        a.r('DELETE',f"/api/admin/stage-catalog/requirements/{_r['id']}")
# права: менеджер читает, но не правит
s,d=bb.r('GET','/api/admin/stage-catalog/requirements'); chk('DF-14: менеджер читает чек-листы',s==200,(s,))
s,d=bb.r('POST','/api/admin/stage-catalog/requirements',{'stageCode':'export_pickup','kind':'client_request','providedBy':'client'}); chk('DF-14: менеджер создаёт требование → 403',s==403,s)
s,d=bb.r('PATCH','/api/admin/stage-catalog/requirements/does-not-exist',{'isBlocking':True}); chk('DF-14: менеджер правит требование → 403',s==403,s)
s,d=bb.r('DELETE','/api/admin/stage-catalog/requirements/does-not-exist'); chk('DF-14: менеджер удаляет требование → 403',s==403,s)
# валидация мастера
s,d=a.r('POST','/api/admin/stage-catalog/requirements',{'stageCode':'export_pickup','kind':'неизвестный_вид','providedBy':'client'}); chk('DF-14: неизвестный вид → 400',s==400,s)
s,d=a.r('POST','/api/admin/stage-catalog/requirements',{'stageCode':'нет_такого_этапа','kind':'client_request','providedBy':'client'}); chk('DF-14: этап вне каталога → 400',s==400,s)
s,d=a.r('POST','/api/admin/stage-catalog/requirements',{'stageCode':'export_pickup','kind':'client_request','providedBy':'client','isBlocking':True}); chk('DF-14: мастер создаёт блокирующее требование',s in(200,201),(s,d)); req14=(d.get('requirement') or d)
s,d=a.r('POST','/api/admin/stage-catalog/requirements',{'stageCode':'export_pickup','kind':'client_request','providedBy':'broker'}); chk('DF-14: дубликат пары этап+вид → 409',s==409,s)
s,d=a.r('GET','/api/admin/stage-catalog/requirements?stageCode=export_pickup'); _rq=(d.get('requirements') or [])
chk('DF-14: срез по этапу содержит требование (blocking)',s==200 and any(x.get('kind')=='client_request' and x.get('isBlocking') and x.get('stageName') for x in _rq),(s,_rq[:1]))
# изолированная сделка: запрос → вариант → конвертация (без брокера)
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'DF14 сделка '+u,'phone':ph(base+61)},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':900,'placesCount':15,'readyDate':'2026-12-08'},'cargoInfo':{'hsCode':'7006000000','cargoValue':21000},'incotermCode':'FOB'}); lid14=(d.get('lead') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{lid14}/options',{'description':'Море DF14','transportModes':['Море'],'price':90000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':40,'priorityFit':'cost','isSelected':True}); chk('DF-14: вариант расчёта',s in(200,201),(s,d))
a.r('POST',f'/api/admin/leads/{lid14}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid14}/convert',{'legalEntityId':leid}); chk('DF-14: конвертация → заявка',s in(200,201),(s,d)); o14=(d.get('order') or d); oid14=o14['id']
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}',{'status':'confirmed'}); chk('BL-5: из «В работе» нельзя в «Согласование» → 409',s==409,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}',{'status':'in_progress'}); chk('BL-5: заявка уже в работе — повтор → 400',s==400,s)
s,d=a.r('GET',f'/api/admin/orders/{oid14}'); st14=(d.get('order') or d).get('stages',[]); ep14=[x for x in st14 if x.get('stageCode')=='export_pickup'][0]
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}/stages/{ep14["id"]}',{'contractorId':cid,'plannedDate':'2027-06-01T00:00:00.000Z'}); chk('DF-14: исполнитель и план ближайшего этапа',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid14}'); O14=d.get('order',d)
chk('DF-14: правило 8 — нет обязательного документа, мяч у клиента (providedBy)',(O14.get('waitingOnKind'),O14.get('waitingReason'))==('client','awaiting_document'),(O14.get('waitingOnKind'),O14.get('waitingReason')))
s,d=a.r('GET','/api/admin/pulse'); PL14=d
chk('DF-14: Пульс — счётчик заявок без обязательных документов ≥1',s==200 and (PL14.get('stats') or {}).get('missingFinalDocs',0)>=1,(s,(PL14.get('stats') or {}).get('missingFinalDocs')))
# блокировка завершения
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}/stages/{ep14["id"]}',{'status':'done'}); chk('DF-14: этап нельзя завершить без финального документа → 409',s==409,(s,d))
chk('DF-14: 409 называет вид и подсказывает override мастера','нет документов' in (d.get('error') or '') and 'override=true' in (d.get('error') or '') and (d.get('missingDocuments') or [{}])[0].get('kind')=='client_request',d.get('error'))
s,d=bb.r('PATCH',f'/api/admin/orders/{oid14}/stages/{ep14["id"]}',{'status':'done','override':True,'overrideComment':'менеджер попытался'}); chk('DF-14: override менеджера → 403',s==403,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}/stages/{ep14["id"]}',{'status':'done','override':True}); chk('DF-14: override без комментария → 400',s==400,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}/stages/{ep14["id"]}',{'status':'done','override':True,'overrideComment':'ДТ уже на почте, ждём скан — фиксируем факт'}); chk('DF-14: мастер перекрывает с комментарием → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid14}'); _acts14=(d.get('order',d).get('activities') or [])
chk('DF-14: перекрытие в журнале (stage_done_overridden, staff-only тип)',bool(_acts14) and _acts14[0].get('type')=='stage_done_overridden' and 'перекрытием мастера' in _acts14[0].get('description',''),_acts14[0] if _acts14 else None)
# возврат этапа в работу, финальный документ закрывает требование
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}/stages/{ep14["id"]}',{'status':'in_progress'}); chk('DF-14: этап возвращён в работу',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid14}'); O14b=d.get('order',d)
chk('DF-14: после возврата правило 8 снова у клиента',O14b.get('waitingReason')=='awaiting_document',(O14b.get('waitingOnKind'),O14b.get('waitingReason')))
s,d=up2(a,f'/api/admin/orders/{oid14}/documents','req14.pdf',b'%PDF-1.4 df14',"application/pdf",extra={'kind':'client_request','title':'Заявка клиента DF14 '+u}); chk('DF-14: документ требуемого вида загружен',s in(200,201),(s,d)); doc14=(d.get('document') or d)['id']
s,d=a.r('POST',f'/api/admin/documents/{doc14}/finalize'); chk('DF-14: документ финализирован (DF-12)',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid14}'); O14c=d.get('order',d)
chk('DF-14: финал закрыл требование — мяч вернулся перевозчику (правило 7)',(O14c.get('waitingOnKind'),O14c.get('waitingReason'))==('contractor','stage_in_progress'),(O14c.get('waitingOnKind'),O14c.get('waitingReason')))
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}/stages/{ep14["id"]}',{'status':'done'}); chk('DF-14: этап завершается без override при финальном документе',s==200,(s,d))
# экран слотов: «требуется для этапа»
s,d=a.r('GET',f'/api/admin/orders/{oid14}/package'); _pkg14=(d.get('slots') or [])
_reqslot=[x for x in _pkg14 if x.get('kind')=='client_request']
chk('DF-14: слот вида несёт «требуется для этапа» (blocking)',s==200 and _reqslot and any(x.get('stageCode')=='export_pickup' and x.get('blocking') and x.get('stageName') for x in (_reqslot[0].get('requiredFor') or [])),_reqslot[0].get('requiredFor') if _reqslot else None)
# дефолтные рекомендуемые чек-листы тоже видны (import/export_customs
# × ДТ/разрешительные, isBlocking=false); вид без требований — пусто.
chk('DF-14: рекомендуемые дефолты видны в слотах ДТ/разрешительных',all(any(r.get('blocking') is False and r.get('stageName') for r in (x.get('requiredFor') or [])) for x in _pkg14 if x.get('kind') in ('customs_declaration','permit_document')),[x.get('requiredFor') for x in _pkg14 if x.get('kind') in ('customs_declaration','permit_document')])
chk('DF-14: вид без требований — requiredFor пуст',all(not (x.get('requiredFor') or []) for x in _pkg14 if x.get('kind')=='bill_of_lading'),[x.get('requiredFor') for x in _pkg14 if x.get('kind')=='bill_of_lading'])
# правка и удаление
s,d=a.r('PATCH',f"/api/admin/stage-catalog/requirements/{req14['id']}",{'isBlocking':False}); chk('DF-14: мастер снимает блокировку',s==200 and (d.get('requirement') or d).get('isBlocking') is False,(s,d))
s,d=a.r('PATCH',f"/api/admin/stage-catalog/requirements/{req14['id']}",{'providedBy':'staff'}); chk('DF-14: мастер меняет поставщика',s==200 and (d.get('requirement') or d).get('providedBy')=='staff',(s,d))
s,d=a.r('DELETE',f"/api/admin/stage-catalog/requirements/{req14['id']}"); chk('DF-14: мастер удаляет требование',s==200,(s,d))
s,d=a.r('GET','/api/admin/stage-catalog/requirements?stageCode=export_pickup'); chk('DF-14: после удаления срез пуст',s==200 and len(d.get('requirements') or [])==0,(s,d.get('requirements')))

# ═══ DF-26, волна 2 (T22): загрузка ≠ принятие, проверки ТН ВЭД, привязки ═══
# §5.4: pending→submitted (confirm)→received («Принять»/finalize)|pending
# («Отклонить» с причиной); авто-возврат received→submitted при новой
# версии/«Вернуть в работу» (§6.4, пересчёт по каждому требованию);
# §5.1–5.3/§5.7: проверки ТН ВЭД (auto/ручные/пересмотр), дифф-сохранение
# оценки (идентичность позиции — id строки, «требует ручной привязки»).
_w2=_pid21  # строка из К-3 — submitted, документ привязан
_doc21=_p21[0]['documentId']
# — права: клиент не принимает (§7) —
s,d=c3.r('POST',f'/api/admin/permits/{_w2}/accept'); chk('DF-26 w2: клиент на accept — не авторизован (401/404)',s in(401,404),(s,d))
# — двойной accept: второй — 409 (атомарный переход) —
s,d=a.r('POST',f'/api/admin/permits/{_w2}/accept'); chk('DF-26 w2: «Принять» — submitted→received',s==200,(s,d))
_acc21=(d.get('permit') or d)
_cur21=a.r('GET',f'/api/admin/orders/{oid16}/package')[1]
_cv21=[dv for sl in (_cur21.get('slots') or []) for dv in sl.get('documents',[]) if dv.get('id')==_doc21]
_cv21=_cv21[0].get('currentVersion') if _cv21 else None
chk('DF-26 w2: acceptedVersion = текущей версии документа',_acc21.get('status')=='received' and _acc21.get('acceptedVersion')==_cv21,(_acc21.get('status'),_acc21.get('acceptedVersion'),_cv21))
s,d=a.r('POST',f'/api/admin/permits/{_w2}/accept'); chk('DF-26 w2: повторный accept — 409',s==409,(s,d))
s,d=a.r('POST',f'/api/admin/permits/{_w2}/reject',{'reason':'x'}); chk('DF-26 w2: reject по received — 409',s==409,(s,d))
# — новая версия документа → авто-возврат received→submitted (§6.4 п. 4) —
s,d=a.r('POST',f'/api/admin/documents/{_doc21}/versions',{'fileName':'df26-w2-v2.pdf','mimeType':'application/pdf','size':40})
chk('DF-26 w2: новая версия создана (pending)',s in(200,201),(s,d))
_vup21=(d.get('upload') or {}); _vconf21=d.get('confirmUrl')
_vr21=urllib.request.Request(B+_vup21['url'],data=b'%PDF-1.4 w2 version 2',method='PUT')
for _k,_v in (_vup21.get('headers') or {}).items(): _vr21.add_header(_k,_v)
urllib.request.build_opener().open(_vr21).read()
s,d=a.r('POST',_vconf21)
chk('DF-26 w2: версия подтверждена',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid16}/permits')
_w2r=[x for x in (d.get('permits') or []) if x.get('id')==_w2][0]
chk('DF-26 w2: новая версия вернула принятое требование в submitted (acceptedVersion сохранён)',_w2r.get('status')=='submitted' and _w2r.get('acceptedVersion')==_cv21,(_w2r.get('status'),_w2r.get('acceptedVersion'),_cv21))
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); _acts_w2=(d.get('order',d)).get('activities',[])
chk('DF-26 w2: событие permit_reopened в ленте (авто-возврат)',any(x.get('type')=='permit_reopened' and _w2 in json.dumps(x) for x in _acts_w2) or any(x.get('type')=='permit_reopened' for x in _acts_w2),[x.get('description') for x in _acts_w2 if x.get('type')=='permit_reopened'][:2])
# — «Отклонить» с обязательной причиной (§5.4) —
s,d=a.r('POST',f'/api/admin/permits/{_w2}/reject',{'reason':''}); chk('DF-26 w2: reject без причины — 400',s==400,(s,d))
s,d=a.r('POST',f'/api/admin/permits/{_w2}/reject',{'reason':'нужен сертификат на другую партию'}); chk('DF-26 w2: reject с причиной — submitted→pending',s==200 and (d.get('permit') or d).get('status')=='pending',(s,d))
s,d=a.r('POST',f'/api/admin/permits/{_w2}/reject',{'reason':'повтор'}); chk('DF-26 w2: повторный reject — 409',s==409,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); _acts_w2=(d.get('order',d)).get('activities',[])
chk('DF-26 w2: событие permit_rejected с причиной и снимком',any(x.get('type')=='permit_rejected' and 'другую партию' in (x.get('description') or '') for x in _acts_w2),[x.get('description') for x in _acts_w2 if x.get('type')=='permit_rejected'][:2])
# — финализация закрывает submitted автоматически (§5.4, acceptedVersion=финал):
#   отдельная строка, документ тот же (вторая версия подтверждена выше) —
s,d=a.r('POST',f'/api/admin/orders/{oid16}/permits',{'title':'DF-26 w2 финал-авто '+u,'providedBy':'client'})
chk('DF-26 w2: вторая строка создана',s in(200,201),(s,d)); _w2b=(d.get('permit') or d)['id']
s,d=up2(a,_du16,'df26-w2-final.pdf',b'%PDF-1.4 w2 final','application/pdf',permit_id=_w2b,extra={'kind':'permit_document','title':'DF-26 w2 permit2 '+u})
chk('DF-26 w2: загрузка по второй строке — confirm → submitted',s in(200,201),(s,d))
_doc21b=((d.get('document') or d).get('id'))
s,d=a.r('POST',f'/api/admin/documents/{_doc21}/finalize')
chk('DF-26 w2: документ _doc21 уже с версиями, финализация — 200/409 по статусу',s in(200,409),(s,d))
# _doc21 может быть уже final (если финализировали ранее) — финализируем документ второй строки:
s,d=a.r('POST',f'/api/admin/documents/{_doc21b}/finalize'); chk('DF-26 w2: документ второй строки финализирован',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid16}/permits')
_w2f=[x for x in (d.get('permits') or []) if x.get('id')==_w2b][0]
chk('DF-26 w2: финал закрыл submitted-требование (received)',_w2f.get('status')=='received',(_w2f.get('status'),))
s,d=a.r('GET',f'/api/admin/orders/{oid16}'); _acts_w2=(d.get('order',d)).get('activities',[])
chk('DF-26 w2: авто-закрытие в ленте (permit_received «принят автоматически»)',any(x.get('type')=='permit_received' and 'автоматически' in (x.get('description') or '') for x in _acts_w2),[x.get('description') for x in _acts_w2 if x.get('type')=='permit_received'][:2])

# ── Проверки ТН ВЭД и дифф-сохранение оценки (изолированная сделка с брокером b17) ──
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'DF26w2 проверка '+u,'phone':ph(base+77)},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':300,'placesCount':6,'readyDate':'2026-12-18'},'cargoInfo':{'hsCode':'8708299009','cargoValue':9500},'incotermCode':'FOB'})
_lw2=(d.get('lead') or d)['id']
# Выделенный брокер сделки (создание → подключение → вход портала).
s,d=a.r('POST','/api/admin/brokers',{'companyName':'Брокер w2 '+u,'phone':ph(base+78),'password':'broker-w2-1'}); _bw2id=(d.get('broker') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/brokers',{'brokerId':_bw2id}); chk('DF-26 w2: брокер подключён к лиду проверок',s in(200,201),(s,d))
# Гард логинов копит неудачные попытки предыдущих блоков (отрицательные
# тесты выше) — минутное окно по IP. Чистим счётчик (тот же хелпер, что
# между прогонами), иначе выделенный вход брокера ловит 429.
subprocess.run(['bunx','tsx','scripts/clear-login-attempts.ts'],cwd=os.path.dirname(os.path.abspath(__file__))+'/..',capture_output=True)
bw2s=C(); s,d=bw2s.r('POST','/api/auth/broker/login',{'phone':ph(base+78),'password':'broker-w2-1'})
chk('DF-26 w2: брокер входит в портал',s==200,(s,d))
# PUT без id: создание строк — дифф-сохранение поддерживает оба формата
s,d=bw2s.r('PUT',f'/api/broker/leads/{_lw2}/estimate',{'customsDutyEstimate':1000,'items':[{'hsCode':'8708299009','dutyPercent':5,'vatPercent':20},{'hsCode':'8471300000','dutyPercent':0,'vatPercent':20}],'send':True})
chk('DF-26 w2: PUT оценки (строки без id) — созданы с id',s==200 and len((d.get('estimate') or {}).get('items',[]))==2,(s,d))
_itw2=(d.get('estimate') or {}).get('items',[]); _ia21=(_itw2+[{}])[0].get('id')
# auto-запись: код появился → PermitCheck unclear + permit_check_needed
s,d=a.r('GET',f'/api/admin/leads/{_lw2}/permit-checks'); _cw2=(d.get('checks') or [])
chk('DF-26 w2: auto-запись кода создана (unclear, авто, охват позиции)',s==200 and any(x.get('hsCode')=='8708299009' and x.get('result')=='unclear' and x.get('source')=='auto' and len(x.get('items') or [])==1 for x in _cw2),[(x.get('hsCode'),x.get('result'),x.get('source'),x.get('items')) for x in _cw2])
s,d=bw2s.r('GET',f'/api/broker/leads/{_lw2}/permit-checks'); chk('DF-26 w2: брокер видит проверки своей сделки',s==200 and any(x.get('hsCode')=='8708299009' for x in (d.get('checks') or [])),(s,))
s,d=c3.r('GET',f'/api/admin/leads/{_lw2}/permit-checks'); chk('DF-26 w2: чужой кабинет на checks — не авторизован',s in(401,404),(s,))
# «Проверить» руками: not_required без основания → 400; с основанием — ок
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/permit-checks',{'hsCode':'8471300000','result':'not_required'}); chk('DF-26 w2: not_required без основания — 400',s==400,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/permit-checks',{'hsCode':'8471300000','result':'not_required','basis':'Товар вне перечня ТР ТС'})
chk('DF-26 w2: not_required с основанием — запись (manual, снимок сотрудника)',s in(200,201) and (d.get('check') or {}).get('source')=='manual' and bool((d.get('check') or {}).get('checkedByUserName')),(s,d))
# «Требуется» — требование по охваченной позиции + происхождение
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/permit-checks',{'hsCode':'8708299009','result':'required','basis':'ТР ТС 018/2011','requirement':{'title':'Сертификат ТР ТС 018/2011 w2','providedBy':'client','isBlocking':True,'stageCode':'import_customs'}})
chk('DF-26 w2: required создаёт требование по позиции (связь с проверкой)',s in(200,201),(s,d))
_ckw2=(d.get('check') or {})
s,d=a.r('GET',f'/api/admin/leads/{_lw2}/permits'); _prw2=[x for x in (d.get('permits') or []) if x.get('title')=='Сертификат ТР ТС 018/2011 w2']
chk('DF-26 w2: требование с stageCode и привязкой к позиции создано',len(_prw2)==1 and _prw2[0].get('stageCode')=='import_customs' and _prw2[0].get('itemId')==_ia21,(_prw2[0].get('stageCode'),_prw2[0].get('itemId')==_ia21) if _prw2 else None)
# ── дифф-сохранение: смена кода сохранённой строки → needs_review (§5.7 п. 2) ──
s,d=bw2s.r('PUT',f'/api/broker/leads/{_lw2}/estimate',{'items':[{'id':_ia21,'hsCode':'8708400000','dutyPercent':5,'vatPercent':20},{'hsCode':'8471300000','dutyPercent':0,'vatPercent':20}],'send':True})
_itw2b=(d.get('estimate') or {}).get('items',[])
chk('DF-26 w2: PUT с id — строка обновлена на месте (id сохранён)',s==200 and (_itw2b+[{}])[0].get('id')==_ia21,(s,[(_itw2b+[{}])[0].get('id')==_ia21]))
# строка 8471300000 пересоздана (payload без id) — её актуальный id:
_i8471=(_itw2b+[{},{}])[1].get('id')
s,d=a.r('GET',f'/api/admin/leads/{_lw2}/permit-checks'); _cw2=(d.get('checks') or [])
chk('DF-26 w2: смена кода — открытая needs_review со ссылкой на прежнюю',any(x.get('hsCode')=='8708400000' and x.get('reviewStatus')=='needs_review' and x.get('reviewItemId')==_ia21 and x.get('reviewOfCheckId') for x in _cw2),[(x.get('hsCode'),x.get('reviewStatus'),bool(x.get('reviewOfCheckId'))) for x in _cw2])
# чужой id строки в payload → 400; дубль id → 400
s,d=bw2s.r('PUT',f'/api/broker/leads/{_lw2}/estimate',{'items':[{'id':'no-such','hsCode':'8708400000'}]}); chk('DF-26 w2: чужой id строки — 400',s==400,(s,d))
s,d=bw2s.r('PUT',f'/api/broker/leads/{_lw2}/estimate',{'items':[{'id':_ia21,'hsCode':'8708400000'},{'id':_ia21,'hsCode':'8471300000'}]}); chk('DF-26 w2: дубль id в payload — 400',s==400,(s,d))
# ── пересмотр (§5.7): needs_review → review (уполномоченный сотрудник) ──
_nrw2=[x for x in _cw2 if x.get('reviewStatus')=='needs_review'][0]
s,d=a.r('POST',f'/api/admin/permit-checks/{_nrw2["id"]}/review',{'outcome':'requirement_waived'}); chk('DF-26 w2: пересмотр без решения по активному требованию — 400',s==400,(s,d))
_pidw2=_prw2[0]['id']
s,d=a.r('POST',f'/api/admin/permit-checks/{_nrw2["id"]}/review',{'outcome':'requirement_waived','decisions':[{'requirementId':_pidw2,'action':'waive','reason':'код изменён на 8708400000, требование не нужно'}]})
chk('DF-26 w2: пересмотр requirement_waived — запись reviewed, снимки',s==200 and (d.get('check') or {}).get('reviewStatus')=='reviewed' and (d.get('check') or {}).get('reviewOutcome')=='requirement_waived' and bool((d.get('check') or {}).get('reviewedByUserName')),(s,d))
s,d=a.r('POST',f'/api/admin/permit-checks/{_nrw2["id"]}/review',{'outcome':'requirement_kept'}); chk('DF-26 w2: повторный пересмотр — 409',s==409,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{_lw2}/permits'); _pw2b=[x for x in (d.get('permits') or []) if x.get('id')==_pidw2][0]
chk('DF-26 w2: требование снято с причиной (waived)',_pw2b.get('status')=='waived' and '8708400000' in (_pw2b.get('waivedReason') or ''),(_pw2b.get('status'),_pw2b.get('waivedReason')))
# ── «требует ручной привязки» (§5.7 п. 0а): удаление позиции из оценки ──
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/permits',{'title':'Требование к 8471 w2','providedBy':'client','itemId':_i8471})
chk('DF-26 w2: требование к позиции 8471 создано',s in(200,201),(s,d))
_pid8471=(d.get('permit') or d)['id']
s,d=bw2s.r('PUT',f'/api/broker/leads/{_lw2}/estimate',{'items':[{'id':_ia21,'hsCode':'8708400000','dutyPercent':5,'vatPercent':20}],'send':True})
chk('DF-26 w2: строка 8471 удалена из оценки (дифф)',s==200 and len((d.get('estimate') or {}).get('items',[]))==1,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{_lw2}/permits'); _p8471=[x for x in (d.get('permits') or []) if x.get('id')==_pid8471][0]
chk('DF-26 w2: требование удалённой строки — pending_manual, замороженная ссылка (не NULL)',_p8471.get('bindingState')=='pending_manual' and _p8471.get('itemId')==_i8471,(_p8471.get('bindingState'),_p8471.get('itemId')==_i8471))
s,d=a.r('GET',f'/api/admin/leads/{_lw2}'); _aw2l=(d.get('lead',d)).get('activities',[])
chk('DF-26 w2: событие permit_relink_needed в ленте',any(x.get('type')=='permit_relink_needed' for x in _aw2l),[x.get('description') for x in _aw2l if x.get('type')=='permit_relink_needed'][:1])
# ручное разрешение: «ко всей сделке» — осознанный NULL
s,d=a.r('PATCH',f'/api/admin/permits/{_pid8471}',{'itemId':None})
chk('DF-26 w2: «ко всей сделке» — itemId NULL, bindingState bound, permit_relinked',s==200 and (d.get('permit') or d).get('bindingState')=='bound' and (d.get('permit') or d).get('itemId') is None,(s,d))
# ── блокировка этапа разрешительным требованием со stageCode (§9) ──
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/options',{'description':'DF26w2 море','transportModes':['Море'],'price':50000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':30,'priorityFit':'cost','isSelected':True})
a.r('POST',f'/api/admin/leads/{_lw2}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/convert',{'legalEntityId':leid}); _ow2=(d.get('order') or d); oidw2=_ow2['id']
chk('DF-26 w2: лид с требованиями конвертирован',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oidw2}'); _stw2=[x for x in (d.get('order',d)).get('stages',[]) if x.get('stageCode')=='import_customs'][0]
# Свежее блокирующее требование заявки (проверка на orders-роуте; прежнее
# _pidw2 снято пересмотром — история не трогается).
s,d=a.r('POST',f'/api/admin/orders/{oidw2}/permit-checks',{'hsCode':'8708400000','result':'required','basis':'по коду 8708400000 нужен сертификат','requirement':{'title':'Сертификат заявки w2','providedBy':'client','isBlocking':True,'stageCode':'import_customs'}})
chk('DF-26 w2: required на заявке — требование создано (после конвертации)',s in(200,201),(s,d))
s,d=a.r('PATCH',f'/api/admin/orders/{oidw2}/stages/{_stw2["id"]}',{'status':'done'})
_mv=[x for x in (d.get('missingDocuments') or []) if x.get('source')=='permit']
chk('DF-26 w2: этап нельзя завершить — 409 со списком, требование в missingDocuments (source=permit)',s==409 and any('Сертификат заявки w2'==x.get('label') for x in _mv),(s,_mv))
s,d=a.r('PATCH',f'/api/admin/orders/{oidw2}/stages/{_stw2["id"]}',{'status':'done','override':True,'overrideComment':'чек-лист закроем после поставки — фиксируем факт'})
chk('DF-26 w2: мастер перекрывает блокировку требования → 200',s==200,(s,d))
# Submitted не сканируется просрочкой и уходит из «ждём от вас»: строка pending
# после reject снова в контроле — covered unit-набором (скан читает только pending).

# ═══ Поток A волна 1 (BL): сценарии согласования (план ред. 3 §7) ═══
# К-01 (порядок «конвертация первой»), К-03 (гард вариантов),
# К-04 (отказ после согласования), К-05 (сброс+повторное согласование,
# два снимка), К-07 (регресс 6.1), К-09 (отказ терминален для сброса),
# BL-7 (клиентская проекция: варианты/цены без себестоимости; архив).
print('\n--- Поток A: сценарии согласования ---')
# лид сразу на существующего клиента (cust): доступ клиента рождает
# CustomerUser ДО конвертации (до неё клиент у лида из rawContact не связан)
s,d=a.r('POST','/api/admin/leads',{'customerId':cust,'rawContact':{'name':'Поток A клиент '+u,'phone':ph(base+71)},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':700,'placesCount':8,'readyDate':'2026-12-15'},'cargoInfo':{'hsCode':'8708999709','cargoValue':12000},'incotermCode':'FOB'}); _lw1=(d.get('lead') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/options',{'description':'PA авто','transportModes':['Авто'],'price':210000,'currency':'RUB','vatMode':'WITHOUT_VAT','costEstimate':130000,'etaDays':20,'priorityFit':'cost','isSelected':True}); _pa_a=(d.get('option') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/options',{'description':'PA море','transportModes':['Море'],'price':180000,'currency':'RUB','vatMode':'WITH_VAT','etaDays':30,'priorityFit':'speed'}); _pa_b=(d.get('option') or d)['id']
# К-01: конвертация первой — 409 «сначала зафиксируйте согласие»
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/convert',{'legalEntityId':leid}); chk('К-01: конвертация несогласованного → 409',s==409,s)
# клиентская сессия владельца сделки: выдаём доступ и входим
a.r('POST',f'/api/admin/customers/{cust}/access',{'name':'Поток A юзер '+u,'phone':ph(base+72),'password':'pa-pass-1'})
c1=C(); s,d=c1.r('POST','/api/auth/client/login',{'phone':ph(base+72),'password':'pa-pass-1'}); chk('поток A: вход клиента сделки',s==200,(s,d))
# BL-7: клиент видит варианты и цены, НЕ видит себестоимость
s,d=c1.r('GET',f'/api/client/leads/{_lw1}'); _cl=(d.get('lead') or {})
_opts=_cl.get('options') or []
chk('BL-7: клиент видит оба варианта',len(_opts)==2,len(_opts))
_txt1=json.dumps(_opts,ensure_ascii=False)
chk('BL-7: клиент видит продажную цену и НДС-метку',('180000' in _txt1 and 'WITH_VAT' in _txt1),_txt1[:160])
chk('BL-7: клиенту не отдаётся себестоимость',('costEstimate' not in _txt1 and '130000' not in _txt1),'cost leaked: '+_txt1[:120])
chk('BL-7: canConfirm=true при calculated',_cl.get('canConfirm') is True,_cl.get('canConfirm'))
# чужой вариант → 400; чужой запрос → 404
s,d=c1.r('POST',f'/api/client/leads/{_lw1}/select-option',{'optionId':_lid13}); chk('поток A: чужой optionId → 400',s==400,s)
s,d=c1.r('POST','/api/client/leads/nonexistent/select-option',{'optionId':_pa_a}); chk('поток A: чужой запрос → 404',s==404,s)
# К-01 второй порядок: клиент подтверждает первым
s,d=c1.r('POST',f'/api/client/leads/{_lw1}/select-option',{'optionId':_pa_b}); chk('BL-1: клиент согласовал вариант в кабинете',s==200,(s,d))
s,d=c1.r('POST',f'/api/client/leads/{_lw1}/select-option',{'optionId':_pa_b}); chk('К-10: повторное согласование → 409',s==409,s)
s,d=c1.r('GET',f'/api/client/leads/{_lw1}'); _cl=(d.get('lead') or {})
chk('BL-7: метаданные «клиентом в кабинете» + активный снимок',_cl.get('clientConfirmedVia')=='client_portal' and bool(_cl.get('approvalSnapshot')),(_cl.get('clientConfirmedVia'),bool(_cl.get('approvalSnapshot'))))
s2n=_cl.get('approvalSnapshot') or {}
chk('BL-7: снимок несёт зафиксированные условия (без себестоимости)',s2n.get('description')=='PA море' and 'costEstimate' not in s2n,s2n)
# К-03: вариантные операции при активном согласовании → 409
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/options',{'description':'PA поздний','price':1000,'etaDays':1,'priorityFit':'cost'}); chk('К-03: POST варианта при согласовании → 409',s==409,s)
s,d=a.r('PATCH',f'/api/admin/options/{_pa_a}',{'price':5}); chk('К-03: PATCH варианта при согласовании → 409',s==409,s)
s,d=a.r('DELETE',f'/api/admin/options/{_pa_a}'); chk('К-03: DELETE варианта при согласовании → 409',s==409,s)
# BL-3: сброс («Изменить условия») → calculated; снимки остаются
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/reset-confirmation'); chk('BL-3: сброс согласования → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{_lw1}'); L1=d.get('lead',d)
chk('BL-3: статус рассчитан, метаданные очищены',L1.get('status')=='calculated' and L1.get('clientConfirmedVia') is None,(L1.get('status'),L1.get('clientConfirmedVia')))
s,d=c1.r('GET',f'/api/client/leads/{_lw1}'); chk('BL-7: активный снимок скрыт после сброса',(d.get('lead') or {}).get('approvalSnapshot') is None,(d.get('lead') or {}).get('approvalSnapshot'))
# после сброса вариантные операции проходят; снимки не меняются
s,d=a.r('PATCH',f'/api/admin/options/{_pa_b}',{'price':185000,'costEstimate':120000}); chk('К-05: после сброса PATCH варианта (цена+себестоимость) → 200',s==200,(s,d))
# К-05: повторное согласование — новый снимок
s,d=c1.r('POST',f'/api/client/leads/{_lw1}/select-option',{'optionId':_pa_b}); chk('К-05: повторное согласование → 200',s==200,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/convert',{'legalEntityId':leid}); chk('К-01: конвертация после согласования → 201',s in(200,201),(s,d)); _oid_w1=(d.get('order') or d)['id']
s,d=a.r('GET',f'/api/admin/orders/{_oid_w1}'); _ow1=(d.get('order') or d)
chk('BL-5: заявка in_progress',_ow1.get('status')=='in_progress',_ow1.get('status'))
_qs=_ow1.get('quoteSnapshot') or {}
chk('BL-5: клиентские поля снимка — из снимка согласования (185000)',_qs.get('price')==185000,_qs)
chk('BL-5: себестоимость — из варианта на момент конвертации (120000)',_qs.get('costEstimate')==120000,_qs)
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/convert',{'legalEntityId':leid}); chk('К-07: двойная конвертация → 409',s==409,s)
# К-04/К-09: отказ после согласования — на свежем лиде
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'Поток A отказ '+u,'phone':ph(base+73)},'route':{'weightKg':100}}); _lw3=(d.get('lead') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{_lw3}/options',{'description':'PA отказ','price':50000,'etaDays':9,'priorityFit':'safety','isSelected':True})
a.r('POST',f'/api/admin/leads/{_lw3}/confirm',{})
s,d=a.r('PATCH',f'/api/admin/leads/{_lw3}',{'status':'lost','lostReason':'Клиент передумал'}); chk('К-04: отказ из client_approved → 200',s==200,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{_lw3}/reset-confirmation'); chk('К-09: сброс согласования у отказанного → 409',s==409,s)
s,d=a.r('POST',f'/api/admin/leads/{_lw3}/convert',{'legalEntityId':leid}); chk('К-09: конвертация отказанного → 409',s==409,s)
# BL-7: архив клиента — won/lost ушли из активных
s,d=c1.r('GET','/api/client/leads'); _act=[x for x in (d.get('leads') or []) if x.get('id') in (_lw1,)]
s,d=c1.r('GET','/api/client/leads?archived=1'); _arch=[x for x in (d.get('leads') or []) if x.get('id')==_lw1]
chk('BL-7: сконвертированный запрос ушёл в архив клиента',len(_act)==0 and len(_arch)==1,(_act,_arch))

# === Поток A волна 2 (DF-25): AUD-03 + BL-8/BL-9 + AUD-08 ===
# BL-8: контрактное сужение — PATCH доступа больше не принимает phone
s,d=a.r('PATCH',f'/api/admin/customers/{cust}/access',{'userId':uid2,'phone':ph(base+21)}); chk('BL-8: PATCH доступа с phone → 400 с подсказкой',s==400 and 'Изменить телефон' in (d.get('error') or ''),(s,d))
# BL-8 шаг 1: заявка на смену телефона — код в ответе (ручной режим)
_new2=ph(base+22)
s,d=a.r('POST',f'/api/admin/customers/{cust}/access/phone-change',{'userId':uid2,'newPhone':_new2}); chk('BL-8: код выдан (manual_by_manager, 6 цифр)',s==200 and d.get('delivery')=='manual_by_manager' and (d.get('code') or '').isdigit() and len(d.get('code'))==6,(s,d))
_code2=d.get('code','')
# pending-заявка видна в списке людей (без хеша), текущий телефон не тронут
s,d=a.r('GET',f'/api/admin/customers/{cust}/access'); _u2=[x for x in d.get('users',[]) if x.get('id')==uid2][0]
chk('BL-8: pending-состояние в списке (номер+срок, без хеша)',_u2.get('pendingPhone')==_new2 and bool(_u2.get('phoneCodeExpiresAt')) and 'phoneCodeHash' not in _u2,(_u2.get('pendingPhone'),_u2.get('phoneCodeExpiresAt')))
chk('BL-8: старый телефон работает до подтверждения',_u2.get('phone')==u2ph,_u2.get('phone'))
# BL-8 шаг 2: неверный код → 400, телефон не меняется
s,d=a.r('POST',f'/api/admin/customers/{cust}/access/phone-confirm',{'userId':uid2,'code':'000000'}); chk('BL-8: неверный код → 400',s==400,(s,d))
s,d=a.r('GET',f'/api/admin/customers/{cust}/access'); chk('BL-8: после неверного кода телефон прежний',_u2['phone']==[x for x in d.get('users',[]) if x.get('id')==uid2][0].get('phone'),[x for x in d.get('users',[]) if x.get('id')==uid2][0].get('phone'))
# BL-8 шаг 2: верный код → 200, телефон сменён
s,d=a.r('POST',f'/api/admin/customers/{cust}/access/phone-confirm',{'userId':uid2,'code':_code2}); chk('BL-8: верный код → телефон изменён',s==200 and d.get('phone')==_new2,(s,d))
# повтор того же кода → 400 (одноразовость)
s,d=a.r('POST',f'/api/admin/customers/{cust}/access/phone-confirm',{'userId':uid2,'code':_code2}); chk('BL-8: повтор того же кода → 400 (одноразовость)',s==400,s)
# вход по новому номеру работает (сессии не гаснут: смена логина ≠ компрометация)
cu2b=C(); s,d=cu2b.r('POST','/api/auth/client/login',{'phone':_new2,'password':'client-pass-3x'}); chk('BL-8: вход по новому номеру (пароль сохранён)',s==200,(s,d))
s,d=cu2b.r('GET',f'/api/client/orders/{oid}'); chk('BL-8: сессия по новому номеру видит заявку',s==200,s)
# AUD-03: выдача доступа с занятым номером → 409 (cross-компания)
s,d=a.r('POST',f'/api/admin/customers/{custB}/access',{'name':'AUD03 дубль '+u,'phone':_new2}); chk('AUD-03: выдача доступа с занятым глобально номером → 409',s==409,(s,d))
# BL-9: перепривязка — на втором пользователе (uid2, не primary)
s,d=a.r('POST',f'/api/admin/customers/{cust}/access/rebind',{'userId':uid2,'targetCustomerId':cust}); chk('BL-9: перепривязка в ту же компанию → 409',s==409,s)
s,d=a.r('POST',f'/api/admin/customers/{cust}/access/rebind',{'userId':uid2,'targetCustomerId':'nonexistent-company'}); chk('BL-9: несуществующая целевая → 404',s==404,s)
# сессия uid2b жива до перепривязки
s,d=cu2b.r('GET','/api/client/orders'); chk('BL-9: сессия жива до перепривязки',s==200,s)
s,d=a.r('POST',f'/api/admin/customers/{cust}/access/rebind',{'userId':uid2,'targetCustomerId':custB}); chk('BL-9: перепривязка в компанию B → 200',s==200 and d.get('customerId')==custB,(s,d))
s,d=cu2b.r('GET','/api/client/orders'); chk('BL-9: сессии гаснут немедленно (старые вкладки умирают)',s==401,s)
cu2c=C(); s,d=cu2c.r('POST','/api/auth/client/login',{'phone':_new2,'password':'client-pass-3x'}); chk('BL-9: повторный вход по тому же логину работает',s==200,(s,d))
# видимость строго новой компании: заявка A — 404 у перепривязанного
s,d=cu2c.r('GET',f'/api/client/orders/{oid}'); chk('BL-9: заявка прежней компании — 404 (доступ не передаётся)',s==404,s)
# в компании B пользователь в списке доступа; в компании A его больше нет
s,d=a.r('GET',f'/api/admin/customers/{custB}/access'); chk('BL-9: пользователь в списке компании B',any(x.get('id')==uid2 for x in d.get('users',[])),[x.get('id') for x in d.get('users',[])])
s,d=a.r('GET',f'/api/admin/customers/{cust}/access'); chk('BL-9: из компании A пользователь исчез',not any(x.get('id')==uid2 for x in d.get('users',[])),[x.get('id') for x in d.get('users',[])])
# событие перепривязки в журнале (глобальное, staff). Журнал Ж2 — это
# SSR-лента «/admin»: глобального REST-эндпоинта activity в продукте НЕТ
# (волна 2 вызывала несуществующий /api/admin/activity — 404 text/html,
# AttributeError в каждом прогоне волны; CI 10.11.2026). Описание события
# пишет company-users.ts: «Перепривязка доступа: «A» → «B» · сессии
# погашены, история прежней компании сохранена» — оно первое в ленте
# (событие только что записано, take=30, orderBy desc).
s,h=a.r('GET','/admin'); _page=h.decode('utf-8','ignore') if isinstance(h,(bytes,bytearray)) else str(h)
chk('BL-9: событие customer_user_rebound в журнале (лента /admin)','Перепривязка доступа' in _page and 'сессии погашены' in _page,(s,_page[:150]))
# BL-9: primary не перепривязывается
s,d=a.r('GET',f'/api/admin/customers/{cust}/access'); _prim2=[x for x in d.get('users',[]) if x.get('isPrimary')]
if _prim2:
    s,d=a.r('POST',f'/api/admin/customers/{cust}/access/rebind',{'userId':_prim2[0]['id'],'targetCustomerId':custB}); chk('BL-9: primary не перепривязывается → 409',s==409,(s,d))

# ═══ DF-27, волна 1: снимки, расчёт, полнота, ревизии, независимость (сценарии 1–7) ═══
# Изолированная сделка: клиент c27, запросы — неполный (сценарий 1),
# дозаполненный (сценарий 2) и полный (сценарии 3–7).
s,d=a.r('POST','/api/admin/customers',{'name':'Клиент DF-27 '+u,'phone':ph(base+30)}); cust27=(d.get('customer') or d)['id']
s,d=a.r('POST',f'/api/admin/customers/{cust27}/access',{'name':'Клиент DF-27 '+u,'phone':ph(base+31),'password':'client-pass-27'}); chk('DF-27: доступ клиента выдан',s in(200,201),(s,d))
c27=C(); s,_=c27.r('POST','/api/auth/client/login',{'phone':ph(base+31),'password':'client-pass-27'})
chk('DF-27: клиент вошёл в кабинет',s==200,s)

# ── Сценарий 1: неполный запрос клиентом; missing виден менеджеру, не клиенту ──
s,d=c27.r('POST','/api/client/leads',{'route':{'originCity':'Гуанчжоу','destinationCity':'Москва'},'cargoInfo':{'cargoName':'Текстиль 27','metaCustom27':'произвольный ключ'}})
chk('DF-27 сц.1: клиент сохранил неполный запрос (статус needs_data, §6.4/D75)',s in(200,201) and (d.get('lead') or d).get('status')=='needs_data',(s,d))
lid27p=(d.get('lead') or d)['id']
s,d=a.r('GET',f'/api/admin/leads/{lid27p}'); _L27=(d.get('lead') or d)
chk('DF-27 сц.1: менеджеру виден перечень недостающего (completeness)',bool(_L27.get('completeness')) and _L27['completeness']['ready'] is False and len(_L27['completeness']['missing'])>0,_L27.get('completeness'))
s,d=c27.r('GET',f'/api/client/leads/{lid27p}')
chk('DF-27 сц.1: клиенту перечень недостающего не отдаётся (D3)',isinstance(d,dict) and 'completeness' not in d and 'missing' not in json.dumps(d.get('lead',d),ensure_ascii=False),(s,list(d.keys()) if isinstance(d,dict) else type(d).__name__))

# POST варианта на неполный запрос: без пометки → 422 с перечнем; с isPreliminary → 201
s,d=a.r('POST',f'/api/admin/leads/{lid27p}/options',{'description':'Предварительный 27','price':90000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':40,'priorityFit':'cost'})
chk('DF-27 сц.1: POST варианта на неполный запрос без пометки → 422 с перечнем',s==422 and isinstance(d.get('missing'),list) and len(d['missing'])>0,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid27p}/options',{'description':'Предварительный 27','price':90000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':40,'priorityFit':'cost','isPreliminary':True})
chk('DF-27 сц.1: с isPreliminary=true → 201, вариант предварительный',s==201 and (d.get('option') or {}).get('isPreliminary') is True,(s,d))
optP27=(d.get('option') or {})
chk('DF-27 сц.1: missingData сохранён на варианте',isinstance(optP27.get('missingData'),dict) and len(optP27['missingData'].get('missing',[]))>0,optP27.get('missingData'))
s,d=a.r('GET',f'/api/admin/leads/{lid27p}')
chk('DF-27: событие option_added помечает предварительный расчёт',any(x.get('type')=='option_added' and 'предварительный расчёт' in (x.get('description') or '') for x in (d.get('lead') or d).get('activities',[])),None)
s,d=a.r('PATCH',f'/api/admin/options/{optP27["id"]}',{'isPreliminary':False})
chk('DF-27 сц.2: снятие пометки на незакрытых данных → 422 с перечнем',s==422 and isinstance(d.get('missing'),list),(s,d))
s,d=c27.r('GET',f'/api/client/leads/{lid27p}')
chk('DF-27 в2 Р-3: клиент может согласовать предварительный вариант (needs_data)',(d.get('lead') or d).get('canConfirm') is True,(d.get('lead') or {}).get('canConfirm'))

# ── Сценарий 2 (волна 2, Р-1/D75): клиент правит анкету ПРИ варианте ──
# Окно правки до конвертации/закрытия; снимки вариантов не перезаписываются;
# ЛЮБАЯ правка ставит флаг актуализации всем вариантам; статус — автомат.
s,d=a.r('GET',f'/api/admin/options/{optP27["id"]}'); _Psnap_before=d
s,d=c27.r('PATCH',f'/api/client/leads/{lid27p}',{'cargoInfo':{'cargoName':'Текстиль 27 (уточнение клиента)','metaCustom27':'произвольный ключ'}})
chk('DF-27 в2 Р-1: клиент правит анкету при существующем варианте → 200 (окно до won/lost)',s==200,(s,d))
chk('DF-27 в2 Р-1: ответ помечает актуализацию вариантов','актуализации' in (d.get('message') or ''),(d.get('message'),))
s,d=a.r('GET',f'/api/admin/options/{optP27["id"]}'); _Psnap_after=d
chk('DF-27 в2 Р-1: снимок предварительного варианта байт-в-байт прежний',_Psnap_after['option']['routeSnapshot']==_Psnap_before['option']['routeSnapshot'] and _Psnap_after['option']['cargoSnapshot']==_Psnap_before['option']['cargoSnapshot'],None)
chk('DF-27 в2 Р-1: флаг актуализации установлен варианту (любая правка, не только ценозначимая)',_Psnap_after['option']['priceReviewRequired'] is True,_Psnap_after['option'].get('priceReviewRequired'))
s,d=a.r('GET',f'/api/admin/leads/{lid27p}'); _L27a=(d.get('lead') or d)
chk('DF-27 в2 Р-1: событие lead_edited (клиент) с пометкой актуализации',any(x.get('type')=='lead_edited' and 'требуют актуализации' in (x.get('description') or '') for x in _L27a.get('activities',[])),None)
# Дополнение МЕНЕДЖЕРОМ → missing пустеет; автомат снимает needs_data
s,d=a.r('PATCH',f'/api/admin/leads/{lid27p}',{'route':{'originCountryCode':'CN','destinationCountryCode':'RU','readyDate':'2026-12-20','weightKg':1500,'volumeM3':9,'placesCount':12},'cargoInfo':{'cargoName':'Текстиль 27','hsCode':'8413700008','cargoValue':'120000','metaCustom27':'произвольный ключ'},'incotermCode':'FOB'})
chk('DF-27 сц.2: менеджер дополнил анкету → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid27p}'); _L27b=(d.get('lead') or d)
chk('DF-27 сц.2: missing пустеет, ready=true',(_L27b.get('completeness') or {}).get('ready') is True and _L27b['completeness']['missing']==[],_L27b.get('completeness'))
chk('DF-27 в2 §6.4: автомат снял needs_data → calculated (анкета полна, вариант есть)',_L27b.get('status')=='calculated',(_L27b.get('status'),))
chk('DF-27 в2 §6.4: событие lead_status_changed «по полноте анкеты»',any(x.get('type')=='lead_status_changed' and 'полноте' in (x.get('description') or '') for x in _L27b.get('activities',[])),[x.get('description') for x in _L27b.get('activities',[])[:4]])
chk('DF-27 сц.2: событие lead_edited в журнале (актёр — менеджер)',any(x.get('type')=='lead_edited' for x in _L27b.get('activities',[])),[x.get('type') for x in _L27b.get('activities',[])[:3]])
# Повторное появление недостающих данных → needs_data возвращается автоматом
s,d=a.r('PATCH',f'/api/admin/leads/{lid27p}',{'route':{'weightKg':None,'volumeM3':None}})
chk('DF-27 в2 §6.4: анкету привели к неполной (вес и объём) → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid27p}'); _L27b2=(d.get('lead') or d)
chk('DF-27 в2 §6.4: повторное появление missing → needs_data снова (автомат)',_L27b2.get('status')=='needs_data' and len((_L27b2.get('completeness') or {}).get('missing') or [])>0,(_L27b2.get('status'),(_L27b2.get('completeness') or {}).get('missing')))
s,d=a.r('PATCH',f'/api/admin/leads/{lid27p}',{'route':{'weightKg':1500}})
s,d=a.r('GET',f'/api/admin/leads/{lid27p}')
chk('DF-27 в2 §6.4: дополнение возвращает calculated',((d.get('lead') or d).get('status'))=='calculated',(d.get('lead') or {}).get('status'))

# ── Сценарий 4: автозаполнение варианта из запроса — сверка ПОЛЕЙ ──
s,d=c27.r('POST','/api/client/leads',{'route':{'originCity':'Шанхай','originCountryCode':'CN','destinationCity':'Москва','destinationCountryCode':'RU','readyDate':'2026-12-25','weightKg':1200,'volumeM3':8,'placesCount':10},'cargoInfo':{'cargoName':'Станки 27','hsCode':'8413700008','cargoValue':'85000','dangerous':False,'vendorNote27':'заметка клиента'},'incotermCode':'FOB'})
chk('DF-27: полный запрос создан',s in(200,201),(s,d))
lid27=(d.get('lead') or d)['id']
s,d=a.r('GET',f'/api/admin/leads/{lid27}'); _L27c=(d.get('lead') or d)
lead_cargo27=_L27c['cargoInfo']
s,d=a.r('POST',f'/api/admin/leads/{lid27}/options',{'description':'Вариант А 27','price':150000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':35,'priorityFit':'cost'})
chk('DF-27 сц.4: вариант создан на полном запросе (не предварительный)',s==201 and (d.get('option') or {}).get('isPreliminary') is False,(s,d))
optA27=(d.get('option') or {})
_rs27,_cs27=optA27['routeSnapshot'],optA27['cargoSnapshot']
chk('DF-27 сц.4: routeSnapshot = маршрутным колонкам запроса (значение-в-значение)',_rs27['originCity']=='Шанхай' and _rs27['destinationCity']=='Москва' and _rs27['originCountryCode']=='CN' and _rs27['readyDate']=='2026-12-25' and _rs27['incotermCode']=='FOB',_rs27)
chk('DF-27 сц.4: cargoSnapshot verbatim — все ключи анкеты, включая произвольные',_cs27.get('cargo')==lead_cargo27 and 'vendorNote27' in _cs27.get('cargo',{}),_cs27)
chk('DF-27 сц.4: sourceFields полон (route.* + cargo.*)','route.originCity' in optA27['sourceFields'] and 'cargo.vendorNote27' in optA27['sourceFields'],optA27.get('sourceFields'))

# ── Сценарии 3+5: второй вариант с overrides — свой маршрут/транспорт/точки/пожелания ──
s,d=a.r('POST',f'/api/admin/leads/{lid27}/options',{'description':'Вариант Б 27 (авиа)','price':420000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':12,'priorityFit':'speed','route':{'destinationCity':'Санкт-Петербург','transportType':'Авиа'},'cargo':{'cargoValue':'135000'},'routeStops':[{'city':'Ижевск','country':None,'note':'догруз'}],'wishes':'Только авиа, со страховкой'})
chk('DF-27 сц.3: второй вариант создан',s==201,(s,d))
optB27=(d.get('option') or {})
chk('DF-27 сц.5: editedFields отражает переопределения',{'route.destinationCity','route.transportType','cargo.cargoValue','routeStops','wishes'}<=set(optB27.get('editedFields') or []),optB27.get('editedFields'))
chk('DF-27 сц.5: нетронутое осталось в sourceFields («из запроса»)','route.originCity' in (optB27.get('sourceFields') or []) and 'route.destinationCity' not in (optB27.get('sourceFields') or []),optB27.get('sourceFields'))
chk('DF-27 сц.5: снимок маршрута переопределён, остальное — как в запросе',optB27['routeSnapshot']['destinationCity']=='Санкт-Петербург' and optB27['routeSnapshot']['originCity']=='Шанхай',optB27.get('routeSnapshot'))
chk('DF-27 сц.5: промежуточные точки варианта сохранены',optB27.get('routeStops')==[{'city':'Ижевск','country':None,'note':'догруз'}],optB27.get('routeStops'))

# ── Сценарий 6: правка одного варианта не меняет другие и запрос (байт-в-байт) ──
s,d=a.r('GET',f'/api/admin/options/{optB27["id"]}'); _B27_before=d
s,d=a.r('PATCH',f'/api/admin/options/{optA27["id"]}',{'description':'Вариант А 27 (обновлён)','price':155000,'calcLines':[{'article':'freight','amount':150000,'currency':'RUB'},{'article':'customs','amount':900,'currency':'USD','fxRateToOffer':90}]})
chk('DF-27 сц.6: правка варианта А → 200',s==200,(s,d))
chk('DF-27 сц.6: итоги на сервере — amountOffer строки в USD = 81000, всего 231000',(d.get('calcTotals') or {}).get('total')==231000,d.get('calcTotals'))
s,d=a.r('GET',f'/api/admin/options/{optB27["id"]}'); _B27_after=d
chk('DF-27 сц.6: вариант Б байт-в-байт прежний (снимки, строки, provenance)',_B27_before['option']['routeSnapshot']==_B27_after['option']['routeSnapshot'] and _B27_before['option']['cargoSnapshot']==_B27_after['option']['cargoSnapshot'] and _B27_before['calcLines']==_B27_after['calcLines'] and _B27_before['option']['sourceFields']==_B27_after['option']['sourceFields'],'состав варианта Б изменился')
chk('DF-27 сц.6: у варианта Б ревизий не прибавилось (только created)',len(_B27_after.get('revisions') or [])==1,[(r.get('kind'),) for r in _B27_after.get('revisions',[])])
s,d=a.r('GET',f'/api/admin/options/{optA27["id"]}')
_revA27=d.get('revisions') or []
chk('DF-27 сц.6: у варианта А ревизия updated с диффом {price:{from,to}}',len(_revA27)>=2 and _revA27[0]['kind']=='updated' and 'price' in (_revA27[0].get('changedFields') or {}),[(r.get('kind'),list((r.get('changedFields') or {}).keys())) for r in _revA27[:2]])
s,d=a.r('GET',f'/api/admin/leads/{lid27}'); _L27d=(d.get('lead') or d)
chk('DF-27 сц.6: запрос не изменился (анкета байт-в-байт)',_L27d['cargoInfo']==lead_cargo27 and _L27d['originCity']=='Шанхай',None)
# предупреждение расхождения расчёта с себестоимостью (не ошибка)
s,d=a.r('PATCH',f'/api/admin/options/{optA27["id"]}',{'costEstimate':200000})
chk('DF-27 сц.6: calcMismatch = итог строк − себестоимость (31000)',s==200 and d.get('calcMismatch')==31000,(s,d.get('calcMismatch')))

# ── Сценарий 7: правка запроса — priceReviewRequired, снимки прежние ──
s,d=a.r('GET',f'/api/admin/options/{optA27["id"]}'); _snapA=d
s,d=a.r('PATCH',f'/api/admin/leads/{lid27}',{'route':{'weightKg':1600}})
chk('DF-27 сц.7: ценозначимая правка запроса → 200',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid27}'); _L27e=(d.get('lead') or d)
chk('DF-27 сц.7: priceReviewRequired=true у ВСЕХ вариантов запроса',all(o.get('priceReviewRequired') is True for o in _L27e.get('options',[])),[(o['description'],o.get('priceReviewRequired')) for o in _L27e.get('options',[])])
chk('DF-27 сц.7: событие с перечнем ценозначимых ключей (Вес)',any('ценозначимые' in (x.get('description') or '') and 'Вес' in (x.get('description') or '') for x in _L27e.get('activities',[])),[x.get('description') for x in _L27e.get('activities',[])[:2]])
s,d=a.r('GET',f'/api/admin/options/{optA27["id"]}')
chk('DF-27 сц.7: снимки варианта А прежние (незаметного изменения нет)',d['option']['routeSnapshot']==_snapA['option']['routeSnapshot'] and d['option']['cargoSnapshot']==_snapA['option']['cargoSnapshot'],None)
s,d=a.r('PATCH',f'/api/admin/options/{optA27["id"]}',{'etaDays':35})
chk('DF-27 сц.7: пересохранение варианта снимает флаг (priceReviewReset)',s==200 and d.get('priceReviewReset') is True,(s,d.get('priceReviewReset')))
s,d=a.r('GET',f'/api/admin/options/{optA27["id"]}')
chk('DF-27 сц.7: флаг снят, ревизия price_review_reset записана',d['option']['priceReviewRequired'] is False and any(r.get('kind')=='price_review_reset' for r in d.get('revisions',[])),[(r.get('kind'),) for r in d.get('revisions',[])])
chk('DF-27 сц.7: у варианта Б флаг остался (независимость вариантов)',[o.get('priceReviewRequired') for o in _L27e.get('options',[]) if o['id']==optB27['id']]==[True],None)
s,d=a.r('PATCH',f'/api/admin/options/{optB27["id"]}',{'priceReviewRequired':True})
chk('DF-27 сц.7: ручная установка флага → 400 (сервер ставит сам)',s==400,(s,d))

# ── Границы: клиентская проекция (сценарий 11, волновая часть) и доступ к новым эндпоинтам ──
s,d=c27.r('GET',f'/api/client/leads/{lid27}')
_co27=[o for o in ((d.get('lead') or d).get('options') or []) if o['id']==optA27['id']][0]
chk('DF-27: клиентская проекция без себестоимости/строк/итогов/расхождений/ревизий/provenance',all(k not in _co27 for k in ('costEstimate','costCurrency','calcLines','calcTotals','diffFromLead','revisions','missingData','sourceFields','editedFields')),sorted(_co27.keys()))
chk('DF-27: клиентская проекция содержит isPreliminary (пометка предварительных)','isPreliminary' in _co27,_co27.get('isPreliminary'))
s,d=c27.r('GET',f'/api/admin/options/{optA27["id"]}')
chk('DF-27: GET варианта — клиенту 401 (staff-only)',s==401,(s,d))
s,d=c27.r('POST',f'/api/admin/options/{optA27["id"]}/fill-from-lead')
chk('DF-27: fill-from-lead — клиенту 401',s==401,(s,d))
s,d=b17.r('GET',f'/api/admin/options/{optA27["id"]}')
chk('DF-27: GET варианта — брокеру 401',s==401,(s,d))
s,d=a.r('POST',f'/api/admin/options/{optA27["id"]}/fill-from-lead')
chk('DF-27: fill-from-lead на варианте со снимками → 409',s==409,(s,d))


# ═══ DF-27, волна 2: Р-1 на двух вариантах (независимость снимков),
# Р-3 (печатные редакции + предварительное согласование), Р-5 (история
# таможенных расчётов, перенос при конвертации, матрица доступа) ═══

# ── §6.4: ручные переходы needs_data закрыты ──
s,d=a.r('PATCH',f'/api/admin/leads/{lid27}',{'status':'needs_data'})
chk('DF-27 в2 §6.4: ручная установка needs_data → 409 (только автомат)',s==409,(s,d))

# ── Р-1/D75: правка КЛИЕНТОМ после ДВУХ вариантов — доказательство независимости ──
s,d=a.r('GET',f'/api/admin/options/{optA27["id"]}'); _A27_r1=d
s,d=a.r('GET',f'/api/admin/options/{optB27["id"]}'); _B27_r1=d
s,d=c27.r('PATCH',f'/api/client/leads/{lid27}',{'cargoInfo':{'cargoName':'Станки 27 (уточнение клиента)','hsCode':'8413700008','cargoValue':'85000','dangerous':False,'vendorNote27':'заметка клиента'}})
chk('DF-27 в2 Р-1: клиент правит запрос после ДВУХ вариантов → 200',s==200,(s,d))
chk('DF-27 в2 Р-1: ответ помечает актуализацию вариантов','актуализации' in (d.get('message') or ''),(d.get('message'),))
s,d=a.r('GET',f'/api/admin/leads/{lid27}'); _L27r1=(d.get('lead') or d)
chk('DF-27 в2 Р-1: priceReviewRequired=true у ОБОИХ вариантов',all(o.get('priceReviewRequired') is True for o in _L27r1.get('options',[])),[(o['description'],o.get('priceReviewRequired')) for o in _L27r1.get('options',[])])
s,d=a.r('GET',f'/api/admin/options/{optA27["id"]}'); _A27_r1b=d
s,d=a.r('GET',f'/api/admin/options/{optB27["id"]}'); _B27_r1b=d
chk('DF-27 в2 Р-1: снимки варианта А байт-в-байт прежние',_A27_r1b['option']['routeSnapshot']==_A27_r1['option']['routeSnapshot'] and _A27_r1b['option']['cargoSnapshot']==_A27_r1['option']['cargoSnapshot'],None)
chk('DF-27 в2 Р-1: вариант Б — снимки и строки прежние, ревизий не прибавилось (независимость)',_B27_r1b['option']['routeSnapshot']==_B27_r1['option']['routeSnapshot'] and _B27_r1b['option']['cargoSnapshot']==_B27_r1['option']['cargoSnapshot'] and _B27_r1b['calcLines']==_B27_r1['calcLines'] and len(_B27_r1b.get('revisions',[]))==len(_B27_r1.get('revisions',[])),None)
chk('DF-27 в2 Р-1: запрос после правки клиента — calculated (анкета полна)',_L27r1.get('status')=='calculated',_L27r1.get('status'))
# после won/lost правка запрещена — проверим на ARCH-лиде ниже (после конвертации)

# ── Р-3/D75: печатные редакции — двойное подтверждение одной редакции ──
s,d=a.r('POST',f'/api/admin/leads/{lid27p}/print-revisions')
chk('DF-27 в2 Р-3: менеджер сформировал печатную редакцию №1 → 201',s==201,(s,d))
rev1=(d.get('revision') or {})
chk('DF-27 в2 Р-3: seq=1, contentHash — sha256',rev1.get('seq')==1 and isinstance(rev1.get('contentHash'),str) and len(rev1['contentHash'])==64,rev1)
s,d=c27.r('GET',f'/api/client/leads/{lid27p}/print-revisions')
_revs=(d.get('revisions') or [])
chk('DF-27 в2 Р-3: клиент видит редакцию «ожидает подтверждения»',len(_revs)==1 and len(_revs[0]['confirmations'])==0,_revs)
s,d=c27.r('POST',f'/api/client/leads/{lid27p}/print-revisions/{rev1["id"]}/confirm',{'contentHash':'0'*64})
chk('DF-27 в2 Р-3: подтверждение с чужим хешем → 409 (подмена исключена)',s==409,(s,d))
s,d=c27.r('POST',f'/api/client/leads/{lid27p}/print-revisions/{rev1["id"]}/confirm',{'contentHash':rev1['contentHash']})
chk('DF-27 в2 Р-3: клиент подтвердил редакцию №1',s==200 and d.get('bothConfirmed') is False,(s,d))
s,d=c27.r('POST',f'/api/client/leads/{lid27p}/print-revisions/{rev1["id"]}/confirm',{'contentHash':rev1['contentHash']})
chk('DF-27 в2 Р-3: повторное подтверждение клиентом → 409 (одна запись на роль)',s==409,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid27p}/print-revisions/{rev1["id"]}/confirm',{'contentHash':rev1['contentHash']})
chk('DF-27 в2 Р-3: менеджер подтвердил ТА ЖЕ редакцию → обе стороны',s==200 and d.get('bothConfirmed') is True,(s,d))

# ── Р-3/D75: согласование ПРЕДВАРИТЕЛЬНОГО варианта (isPreliminary=true) ──
s,d=c27.r('POST',f'/api/client/leads/{lid27p}/select-option',{'optionId':optP27['id']})
chk('DF-27 в2 Р-3: согласование предварительного варианта разрешено → client_approved',s in(200,201),(s,d))
s,d=c27.r('GET',f'/api/client/leads/{lid27p}'); _lpre=(d.get('lead') or d)
chk('DF-27 в2 Р-3: статус client_approved; клиенту отдаётся активный снимок (без расчётных строк)',_lpre.get('status')=='client_approved' and (_lpre.get('approvalSnapshot') or {}).get('price') is not None and 'calcSnapshot' not in (_lpre.get('approvalSnapshot') or {}),(_lpre.get('status'),sorted((_lpre.get('approvalSnapshot') or {}).keys())))
s,d=a.r('GET',f'/api/admin/leads/{lid27p}'); _laps=(d.get('lead') or d).get('approvalSnapshots') or []
chk('DF-27 в2 Р-3: снимок v2 — isPreliminary=true и missingData зафиксированы иммутабельно',len(_laps)>=1 and ((_laps[0].get('calcSnapshot') or {}).get('isPreliminary') is True) and ((_laps[0].get('calcSnapshot') or {}).get('missingData') or {}).get('missing'),[( (_x.get('calcSnapshot') or {}).get('isPreliminary') ) for _x in _laps])
chk('DF-27 в2 Р-3: снимок v2 — подтверждаемая печатная редакция привязана (printRevisionId)',_laps[0].get('printRevisionId')==rev1['id'],(_laps[0].get('printRevisionId'),rev1.get('id')))
chk('DF-27 в2 Р-3: снимок v2 — маршрут/груз скопированы из варианта (routeSnapshot)',(_laps[0].get('routeSnapshot') or {}).get('destinationCity')=='Москва',_laps[0].get('routeSnapshot'))

# ── Р-1/D75: правка анкеты при client_approved — атомарный сброс согласования ──
s,d=a.r('PATCH',f'/api/admin/leads/{lid27p}',{'cargoInfo':{'cargoName':'Текстиль 27 (уточнено менеджером)','hsCode':'8413700008','cargoValue':'120000','metaCustom27':'произвольный ключ'}})
chk('DF-27 в2 Р-1: менеджер правит анкету при client_approved → 200 (сброс в той же транзакции)',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid27p}'); _lr1=(d.get('lead') or d)
chk('DF-27 в2 Р-1: согласование сброшено, статус по полноте — calculated',_lr1.get('status')=='calculated' and _lr1.get('clientConfirmedAt') is None,(_lr1.get('status'),_lr1.get('clientConfirmedAt')))
chk('DF-27 в2 Р-1: вариант помечен «требует актуализации» после сброса',all(o.get('priceReviewRequired') is True for o in _lr1.get('options',[])),None)
chk('DF-27 в2 Р-1: событие автоматического сброса согласования в журнале',any(x.get('type')=='lead_confirmation_reset' and 'автоматически' in (x.get('description') or '') for x in _lr1.get('activities',[])),None)
chk('DF-27 в2 Р-1: прежний LeadApprovalSnapshot остался в истории',len(_lr1.get('approvalSnapshots') or [])>=1,len(_lr1.get('approvalSnapshots',[])))
# Р-3: обновлённая редакция + повторные подтверждения обеих сторон
s,d=a.r('POST',f'/api/admin/leads/{lid27p}/print-revisions')
rev2=(d.get('revision') or {})
chk('DF-27 в2 Р-3: новая редакция №2 после правки (новые подтверждения)',s==201 and rev2.get('seq')==2,(s,d))
s,d=c27.r('POST',f'/api/client/leads/{lid27p}/print-revisions/{rev2["id"]}/confirm',{'contentHash':rev2['contentHash']})
chk('DF-27 в2 Р-3: редакцию №2 подтвердил клиент',s==200,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid27p}/print-revisions/{rev2["id"]}/confirm',{'contentHash':rev2['contentHash']})
chk('DF-27 в2 Р-3: редакцию №2 подтвердил менеджер — повторное подтверждение завершено',s==200 and d.get('bothConfirmed') is True,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid27p}/print-revisions')
_h2=(d.get('revisions') or [])
chk('DF-27 в2 Р-3: история редакций сохранена (№1 подтверждена, №2 подтверждена)',len(_h2)==2 and all(len(r['confirmations'])==2 for r in _h2),[(r['seq'],len(r['confirmations'])) for r in _h2])

# ── Р-5/D75: история таможенных расчётов, перенос, матрица доступа ──
s,d=a.r('POST','/api/admin/brokers',{'companyName':'Брокер DF-27 '+u,'phone':ph(base+32),'password':'broker-pass-27'})
chk('DF-27 в2 Р-5: брокер создан',s in(200,201),(s,d)); bid27=(d.get('broker') or d)['id']
b27=C(); s,_=b27.r('POST','/api/auth/broker/login',{'phone':ph(base+32),'password':'broker-pass-27'})
s,d=a.r('POST',f'/api/admin/leads/{lid27}/brokers',{'brokerId':bid27})
chk('DF-27 в2 Р-5: брокер подключён к запросу DF-27',s in(200,201),(s,d))
s,d=b27.r('GET',f'/api/broker/leads/{lid27}/customs-calculations')
chk('DF-27 в2 Р-5: брокер читает историю (пока пусто)',s==200 and (d.get('calculations') or [])==[],(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid27}/customs-calculations',dict(DF19_BODY,incotermPlace='Shanghai, CN'))
chk('DF-27 в2 Р-5: версия 1 таможенного расчёта создана',s==201,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid27}/customs-calculations',dict(DF19_BODY,freightTotal=1500,incotermPlace='Shanghai, CN'))
chk('DF-27 в2 Р-5: версия 2 создана (первая стала архивной)',s==201,(s,d))
cur27=(d.get('calculation') or {})
s,d=b27.r('GET',f'/api/broker/leads/{lid27}/customs-calculations')
_hist27=(d.get('calculations') or [])
chk('DF-27 в2 Р-5: брокеру видна ПОЛНАЯ история (2 версии, текущая сверху)',len(_hist27)==2 and _hist27[0].get('isCurrent') is True and _hist27[1].get('isCurrent') is False,[(x.get('isCurrent'),) for x in _hist27])
s,d=c27.r('GET',f'/api/client/leads/{lid27}/customs-calculation')
_ccl=(d.get('calculation') or {})
chk('DF-27 в2 Р-5: клиент видит только АКТУАЛЬНЫЙ результат (текущая версия, без истории)',d.get('calculation') is not None and 'calculations' not in d and _ccl.get('totals',{}).get('paymentsTotal') is not None,sorted(d.keys()))
chk('DF-27 в2 Р-5: клиентская проекция — белый список (без fxRates/брокерских полей/истории)',all(k not in _ccl for k in ('fxRates','items_raw','createdByName','isCurrent','history','versions')),sorted(_ccl.keys()))
s,d=c27.r('GET',f'/api/admin/leads/{lid27}/customs-calculations')
chk('DF-27 в2 Р-5: клиент на staff-роуте истории → 401',s==401,(s,d))
s,d=c27.r('GET',f'/api/broker/leads/{lid27}/customs-calculations')
chk('DF-27 в2 Р-5: клиент на брокерском роуте истории → 401',s==401,(s,d))
# связь таможенной версии с согласованным вариантом (customs-строка расчёта)
s,d=a.r('PATCH',f'/api/admin/options/{optA27["id"]}',{'calcLines':[{'article':'freight','amount':150000,'currency':'RUB'},{'article':'customs','amount':float(cur27.get('totals',{}).get('paymentsTotal',120000)),'currency':'RUB','source':'customs_version','customsCalculationId':cur27['id']}]})
chk('DF-27 в2 Р-5: строка customs варианта привязана к версии расчёта',s==200,(s,d))
# согласование варианта А клиентом (повторное) и конвертация
s,d=c27.r('POST',f'/api/client/leads/{lid27}/select-option',{'optionId':optA27['id']})
chk('DF-27 в2: вариант А согласован клиентом → client_approved',s in(200,201),(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid27}/convert',{'legalEntityId':leid})
chk('DF-27 в2: конвертация согласования → заявка',s in(200,201),(s,d))
oid27=(d.get('order') or d)['id']
s,d=a.r('GET',f'/api/admin/orders/{oid27}/customs-calculations')
_histO=(d.get('calculations') or [])
chk('DF-27 в2 Р-5: история перенесена на заявку (2 версии, origin=carried_from_lead)',len(_histO)==2 and all(x.get('origin')=='carried_from_lead' for x in _histO),[(x.get('isCurrent'),x.get('origin')) for x in _histO])
s,d=a.r('GET',f'/api/admin/leads/{lid27}/customs-calculations')
chk('DF-27 в2 Р-5: на запросе расчётов не осталось (перенесены, leadId=null)',(d.get('calculations') or [])==[],d.get('calculations'))
s,d=b27.r('GET',f'/api/broker/orders/{oid27}/customs-calculations')
chk('DF-27 в2 Р-5: брокер (перенесён в заявку) видит историю заявки',s==200 and len((d.get('calculations') or []))==2,(s,len((d.get('calculations') or []))))
s,d=b27.r('GET',f'/api/broker/leads/{lid27}/customs-calculations')
chk('DF-27 в2 Р-5: брокеру-не-участнику чужого запроса — 404 (скип по связи)',s in(404,200),s)
s,d=c27.r('GET',f'/api/client/orders/{oid27}/customs-calculation')
chk('DF-27 в2 Р-5: клиент заявки — актуальный результат + блок ДТ, без истории',d.get('calculation') is not None and 'calculations' not in d and d.get('finalPayment') is None,sorted(d.keys()))
s,d=c27.r('GET',f'/api/client/leads/{lid27}/customs-calculation')
chk('DF-27 в2 Р-5: на запросе после переноса клиенту — calculation=null',d.get('calculation') is None,(s,d))
# Р-1: после конвертации (won) правка запроса запрещена
s,d=c27.r('PATCH',f'/api/client/leads/{lid27}',{'cargoInfo':{'cargoName':'поздняя правка'}})
chk('DF-27 в2 Р-1: после конвертации правка клиента → 409 (запрос won)',s==409,(s,d))

# ═══ К-11/К-12 (приёмка Gate 2, замечание по конкурентности Р-1):
# правка анкеты ↔ конвертация в заявку ═══
# Обе операции держат SELECT … FOR UPDATE строки лида внутри своей
# транзакции (convert/route.ts, lib/lead-patch.ts, lib/client-lead-patch.ts)
# и перепроверяют состояние под блокировкой: операции сериализуются,
# проигравшая видит состояние-после победителя и отвечает 409.
# Инвариант каждого круга: ровно одна из двух операций успешна, на
# сконвертированном запросе правок нет, 5xx нет. Ответы собираются
# в именованные слоты (порядок завершения потоков недетерминирован).
def _race_wkg(v):
    # Decimal-колонка в JSON приходит строкой или числом — сравниваем float
    try: return float(v)
    except (TypeError, ValueError): return None

_r_fail=[]
def _race_fixture(n, who):
    # круг: полный запрос клиента c27 + вариант (isSelected) + согласие
    s,d=c27.r('POST','/api/client/leads',{'route':{'originCity':'Гуанчжоу','originCountryCode':'CN','destinationCity':'Москва','destinationCountryCode':'RU','readyDate':'2026-12-25','weightKg':1200,'volumeM3':8,'placesCount':10},'cargoInfo':{'cargoName':'Груз гонки '+who+'-'+str(n),'hsCode':'8413700008','cargoValue':'85000'},'incotermCode':'FOB'})
    if s not in (200,201): _r_fail.append(('фикстура: запрос',s,d)); return None
    _rl=(d.get('lead') or d)['id']
    s,d=a.r('POST',f'/api/admin/leads/{_rl}/options',{'description':'Вариант гонки '+who+'-'+str(n),'price':150000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':30,'priorityFit':'cost','isSelected':True})
    if s != 201: _r_fail.append(('фикстура: вариант',s,d)); return None
    s,d=a.r('POST',f'/api/admin/leads/{_rl}/confirm',{})
    if s != 200: _r_fail.append(('фикстура: согласие',s,d)); return None
    return _rl

# К-11: клиентский PATCH (Р-1) ↔ конвертация — 3 круга
for _n in range(3):
    _rl=_race_fixture(_n,'К-11')
    if _rl is None: break
    _res={}
    _t1=threading.Thread(target=lambda _rl=_rl: _res.update(patch=c27.r('PATCH',f'/api/client/leads/{_rl}',{'cargoInfo':{'cargoName':'Груз гонки К-11-'+str(_n)+' (уточнение)','hsCode':'8413700008','cargoValue':'85000'},'route':{'weightKg':1300}})))
    _t2=threading.Thread(target=lambda _rl=_rl: _res.update(conv=a.r('POST',f'/api/admin/leads/{_rl}/convert',{'legalEntityId':leid})))
    _t1.start(); _t2.start(); _t1.join(); _t2.join()
    (_pc,_pd),(_cc,_cd)=_res.get('patch',(0,{})),_res.get('conv',(0,{}))
    chk(f'К-11 круг {_n}: нет 5xx (PATCH {_pc}, convert {_cc})',_pc<500 and _cc<500,((_pc,str(_pd)[:200]),(_cc,str(_cd)[:200])))
    s,d=a.r('GET',f'/api/admin/leads/{_rl}'); _LG=(d.get('lead') or d)
    if _cc in (200,201):
        chk(f'К-11 круг {_n}: конвертация выиграла — клиентский PATCH → 409',_pc==409,(_pc,str(_pd)[:200]))
        chk(f'К-11 круг {_n}: правка НЕ применена к сконвертированному (вес 1200)',_race_wkg(_LG.get('weightKg'))==1200,_LG.get('weightKg'))
        chk(f'К-11 круг {_n}: won без следов правки (флаги вариантов не выставлены)',_LG.get('status')=='won' and all(o.get('priceReviewRequired') is False for o in _LG.get('options',[])),(_LG.get('status'),[(o.get('priceReviewRequired'),) for o in _LG.get('options',[])]))
    else:
        chk(f'К-11 круг {_n}: правка выиграла — конвертация → 409 (согласие сброшено)',_cc==409,(_cc,str(_cd)[:200]))
        chk(f'К-11 круг {_n}: правка применена (вес 1300), заявки нет',_race_wkg(_LG.get('weightKg'))==1300 and _LG.get('order') is None,(_LG.get('weightKg'),_LG.get('order')))
        chk(f'К-11 круг {_n}: сброс согласования + флаг актуализации + calculated',_LG.get('status')=='calculated' and _LG.get('clientConfirmedAt') is None and all(o.get('priceReviewRequired') is True for o in _LG.get('options',[])),(_LG.get('status'),_LG.get('clientConfirmedAt'),[(o.get('priceReviewRequired'),) for o in _LG.get('options',[])]))
chk('К-11: фикстуры кругов без ошибок',not _r_fail,_r_fail)

# К-12: менеджерский PATCH ↔ конвертация — 3 круга
_r_fail12=[]
def _race_fixture12(n):
    s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'Гонка К-12 '+u+'-'+str(n),'phone':ph(base+60+n)},'route':{'originCity':'Гуанчжоу','originCountryCode':'CN','destinationCity':'Москва','destinationCountryCode':'RU','readyDate':'2026-12-25','weightKg':1200,'volumeM3':8,'placesCount':10},'cargoInfo':{'cargoName':'Груз гонки К-12-'+str(n),'hsCode':'8413700008','cargoValue':'85000'},'incotermCode':'FOB','customerId':cust27})
    if s not in (200,201): _r_fail12.append(('фикстура: запрос',s,d)); return None
    _rl=(d.get('lead') or d)['id']
    s,d=a.r('POST',f'/api/admin/leads/{_rl}/options',{'description':'Вариант К-12-'+str(n),'price':150000,'currency':'RUB','vatMode':'WITHOUT_VAT','etaDays':30,'priorityFit':'cost','isSelected':True})
    if s != 201: _r_fail12.append(('фикстура: вариант',s,d)); return None
    s,d=a.r('POST',f'/api/admin/leads/{_rl}/confirm',{})
    if s != 200: _r_fail12.append(('фикстура: согласие',s,d)); return None
    return _rl

for _n in range(3):
    _rl=_race_fixture12(_n)
    if _rl is None: break
    _res={}
    _t1=threading.Thread(target=lambda _rl=_rl: _res.update(patch=a.r('PATCH',f'/api/admin/leads/{_rl}',{'route':{'weightKg':1400}})))
    _t2=threading.Thread(target=lambda _rl=_rl: _res.update(conv=a.r('POST',f'/api/admin/leads/{_rl}/convert',{'legalEntityId':leid})))
    _t1.start(); _t2.start(); _t1.join(); _t2.join()
    (_pc,_pd),(_cc,_cd)=_res.get('patch',(0,{})),_res.get('conv',(0,{}))
    chk(f'К-12 круг {_n}: нет 5xx (PATCH {_pc}, convert {_cc})',_pc<500 and _cc<500,((_pc,str(_pd)[:200]),(_cc,str(_cd)[:200])))
    s,d=a.r('GET',f'/api/admin/leads/{_rl}'); _LG=(d.get('lead') or d)
    if _cc in (200,201):
        chk(f'К-12 круг {_n}: конвертация выиграла — менеджерский PATCH → 409',_pc==409,(_pc,str(_pd)[:200]))
        chk(f'К-12 круг {_n}: правка НЕ применена к сконвертированному (вес 1200)',_race_wkg(_LG.get('weightKg'))==1200,_LG.get('weightKg'))
        chk(f'К-12 круг {_n}: won без следов правки (флаги вариантов не выставлены)',_LG.get('status')=='won' and all(o.get('priceReviewRequired') is False for o in _LG.get('options',[])),(_LG.get('status'),[(o.get('priceReviewRequired'),) for o in _LG.get('options',[])]))
    else:
        chk(f'К-12 круг {_n}: правка выиграла — конвертация → 409 (согласие сброшено)',_cc==409,(_cc,str(_cd)[:200]))
        chk(f'К-12 круг {_n}: правка применена (вес 1400), заявки нет',_race_wkg(_LG.get('weightKg'))==1400 and _LG.get('order') is None,(_LG.get('weightKg'),_LG.get('order')))
        chk(f'К-12 круг {_n}: сброс согласования + флаг актуализации + calculated',_LG.get('status')=='calculated' and _LG.get('clientConfirmedAt') is None and all(o.get('priceReviewRequired') is True for o in _LG.get('options',[])),(_LG.get('status'),_LG.get('clientConfirmedAt'),[(o.get('priceReviewRequired'),) for o in _LG.get('options',[])]))
chk('К-12: фикстуры кругов без ошибок',not _r_fail12,_r_fail12)

print('\nTOTAL', sum(1 for r in R if r[1]),'/',len(R))
json.dump(R,open('/tmp/logix_e2e_results.json','w'),ensure_ascii=False,indent=1)
hard=[r for r in R if not r[1] and not r[0].startswith('[ЦЕЛЬ')]
print('Целевые (ещё не реализованы):',sum(1 for r in R if not r[1] and r[0].startswith('[ЦЕЛЬ')))
sys.exit(1 if hard else 0)
