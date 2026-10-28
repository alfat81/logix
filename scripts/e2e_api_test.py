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
import json, urllib.request, urllib.error, uuid, threading, sys
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
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'ООО Ромб '+u,'phone':'8 (999) '+str(base)[:3]+'-'+str(base)[3:5]+'-'+str(base)[5:7]},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':1200},'cargoInfo':{'note':'заметка'}}); chk('создание запроса',s in(200,201),(s,d))
lead=(d.get('lead') or d); lid=lead['id']
# --- P1-01: ответственный менеджер ---
s,d=a.r('GET','/api/auth/employee/me'); aid=(d.get('employee') or {}).get('id'); chk('P1-01: id текущего сотрудника (me)',bool(aid),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d)
chk('P1-01: запрос при создании получает ответственного-создателя',(L.get('assignee') or {}).get('id')==aid,L.get('assignee'))
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
body,ct=multipart({'type':'invoice','title':'Инвойс '+u,'isInternal':'false'},'inv.pdf',b'%PDF-1.4 test',"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('загрузка документа на запрос',s in(200,201),(s,d))
body,ct=multipart({'type':'contract','title':'Тариф подрядчика '+u,'isInternal':'true'},'tariff.pdf',b'%PDF-1.4 secret',"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('загрузка внутреннего документа',s in(200,201),(s,d))
body,ct=multipart({'type':'other','title':'html'},'x.html',b'<script>alert(1)</script>',"text/html")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('HTML-файл отклонён',s==400,s)
body,ct=multipart({'type':'other','title':'html as pdf'},'x.pdf',b'<html><script>alert(1)</script></html>',"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('E0-07 HTML под видом PDF отклонён (проверка сигнатуры файла)',s==400,s)
body,ct=multipart({'type':'other','title':'docx без MIME'},'act.docx',b'PK\x03\x04'+b'\x00'*64,'application/octet-stream')
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('E0-07 DOCX без MIME от браузера принимается по сигнатуре',s in(200,201),(s,d))
body,ct=multipart({'type':'other','title':'big'},'big.pdf',b'%PDF'+b'0'*(4*1024*1024+10),"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('файл >4МБ отклонён',s in(400,413),s)
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
chk('P1-03: diff маршрута заявки в журнале',bool(oacts) and oacts[0]['type']=='order_cargo_changed' and 'Мест: — → 4' in oacts[0]['description'] and 'Объём: — → 2,5' in oacts[0]['description'],(oacts[0] if oacts else None))
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
s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'status':'in_progress'}); chk('возврат из completed в in_progress',s==200,(s,d))
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
chk('v0.4.0: counts.all = сумма по статусам',lcounts.get('all')==sum(lcounts.get(k,0) for k in ('new','calculated','won','lost')),lcounts)
uq=u[:8]
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'Грузчик '+uq,'phone':'+86 130 '+str(base)},'route':{'originCity':'Сургут','destinationCity':'Тюмень'},'cargoInfo':{'cargoName':'Стекло закалённое '+uq}})
chk('v0.4.0: запрос для поиска создан',s in(200,201),(s,d)); qlid=(d.get('lead') or d)['id']
s,d=a.r('GET',f"/api/admin/leads?q={urlquote('Грузчик '+uq)}"); qids=[x['id'] for x in d.get('leads',[])]
chk('v0.4.0: поиск ?q= по rawContact.name (Json) находит запрос',s==200 and qlid in qids,(s,len(qids)))
s,d=a.r('GET',f"/api/admin/leads?q={urlquote('Стекло закалённое '+uq)}"); qids2=[x['id'] for x in d.get('leads',[])]
chk('v0.4.0: поиск ?q= по cargoInfo.cargoName (Json) находит запрос',s==200 and qlid in qids2,(s,len(qids2)))
s,d=a.r('GET',f"/api/admin/leads?q={urlquote('такого-нет-никогда')}"); chk('v0.4.0: поиск без результатов — пустой список и нули',s==200 and d.get('leads')==[] and (d.get('counts') or {}).get('all')==0,(s,d.get('counts')))
# contractor
s,d=a.r('POST','/api/admin/contractor-leads',{'companyName':'Перевозчик '+u}); chk('кандидат-подрядчик',s in(200,201),(s,d)); clid=(d.get('contractorLead') or d.get('lead') or d)['id']
cph=ph(base+2); s,d=a.r('PATCH',f'/api/admin/contractor-leads/{clid}',{'status':'contracted','phone':cph,'password':'contr-pass-1'}); chk('подрядчик рождён',s in(200,201),(s,d))
s,d=a.r('GET','/api/admin/contractors'); cs=d.get('contractors',d); cid=[c for c in cs if c['phone']==cph][0]['id']
st2=st[1]; s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{st2["id"]}',{'contractorId':cid}); chk('подрядчик назначен на этап',s==200,(s,d))
# --- DF-01: события как ось — заметка staff-only, аудитория событий ---
note='Внутренняя заметка DF-01 '+u
s,d=a.r('POST',f'/api/admin/orders/{oid}/notes',{'text':note}); chk('DF-01: внутренняя заметка создана',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid}'); Oa=d.get('order',d); oacts=Oa.get('activities',[])
chk('DF-01: заметка в ленте сотрудника (staff видит всё)',any(x['type']=='note_added' and x['isInternal'] and x['description']==note for x in oacts),[x['type'] for x in oacts[:6]])
chk('DF-01: статус-событие заявки не внутреннее (адресовано клиенту)',any(x['type']=='order_status_changed' and not x['isInternal'] for x in oacts),[x['type'] for x in oacts[:6]])
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
chk('DF-01: клиент НЕ видит ленту событий (activities)',('activities' not in txt),'activities leaked to client')
chk('DF-01: клиент НЕ видит внутреннюю заметку',(note not in txt),'note leaked to client')
s,d=c.r('GET',f'/api/client/orders/{oid}/documents'); txt=json.dumps(d,ensure_ascii=False)
chk('клиент НЕ видит внутренний документ',('Тариф подрядчика' not in txt),txt[:200])
s,d=c.r('GET','/api/admin/orders'); chk('клиент не попадает в админ-API',s==401,s)
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
body,ct=multipart({'type':'invoice','title':'Счёт от клиента '+u},'cl.pdf',b'%PDF-1.4 client',"application/pdf")
s,d=c.r('POST',f'/api/client/orders/{oid}/documents',raw=body,ct=ct); chk('DF-02A: клиент загрузил документ (версия 1)',s in(200,201),(s,d))
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
body,ct=multipart({'type':'other','title':'Акт брокера '+u},'br.pdf',b'%PDF-1.4 broker',"application/pdf")
s,d=b.r('POST',f'/api/broker/orders/{oid}/documents',raw=body,ct=ct); chk('DF-02A: брокер загрузил документ',s in(200,201),(s,d))
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
chk('[ПРИЁМКА DF-00D] мастер читает реестр: 17 ключей, группы, дефолты',s==200 and len(st)==17 and bool(d.get('groups')) and all('defaultValue' in x for x in st),(s,len(st)))
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
# --- contractor
k=C(); s,d=k.r('POST','/api/auth/contractor/login',{'phone':cph,'password':'contr-pass-1'}); chk('вход подрядчика',s==200,(s,d))
s,d=k.r('GET',f'/api/contractor/orders/{oid}'); txt=json.dumps(d,ensure_ascii=False); chk('подрядчик видит заявку со своим этапом',s==200,(s,txt[:150]))
chk('подрядчик НЕ видит цену клиента',('1200000' not in txt),'price leaked to contractor')
chk('P1-04: подрядчик НЕ видит себестоимость',('costEstimate' not in txt),'cost leaked to contractor')
chk('подрядчик видит только свои этапы',txt.count('"stageCode"')<=1,txt.count('"stageCode"'))
chk('DF-01: подрядчик НЕ видит внутреннюю заметку',(note not in txt),'note leaked to contractor')
s,d=k.r('PATCH',f'/api/contractor/orders/{oid}/stages/{mand["id"]}',{'status':'in_progress'}); chk('подрядчик не правит чужой этап',s in(403,404),s)
s,d=k.r('PATCH',f'/api/contractor/orders/{oid}/stages/{st2["id"]}',{'status':'problem'}); chk('подрядчик ставит problem своему этапу',s==200,(s,d))
# --- IDOR: second client
s,d=a.r('POST','/api/admin/customers',{'name':'Чужой '+u,'phone':ph(base+3)}); c2=(d.get('customer') or d)['id']
a.r(AM,f'/api/admin/customers/{c2}/access',{'name':'Пользователь чужой '+u,'phone':ph(base+3),'password':'client-pass-2'})
c2c=C(); c2c.r('POST','/api/auth/client/login',{'phone':ph(base+3),'password':'client-pass-2'})
s,d=c2c.r('GET',f'/api/client/orders/{oid}'); chk('IDOR: чужой клиент не видит заявку',s in(403,404),s)
# --- P1-02: клиент правит свой запрос до вариантов ---
s,d=c.r('GET','/api/client/leads'); cleads=[x for x in (d.get('leads') or []) if x.get('status')=='new']
chk('P1-02: у клиента есть новые запросы',len(cleads)>0,len(cleads))
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
print('\nTOTAL', sum(1 for r in R if r[1]),'/',len(R))
json.dump(R,open('/tmp/logix_e2e_results.json','w'),ensure_ascii=False,indent=1)
hard=[r for r in R if not r[1] and not r[0].startswith('[ЦЕЛЬ')]
print('Целевые (ещё не реализованы):',sum(1 for r in R if not r[1] and r[0].startswith('[ЦЕЛЬ')))
sys.exit(1 if hard else 0)
