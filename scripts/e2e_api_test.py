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
s,d=a.r('GET','/api/admin/legal-entities'); le=(d.get('legalEntities') or d.get('items') or d) if isinstance(d,dict) else d
leid=(le[0]['id'] if isinstance(le,list) else None); chk('юрлицо из сида',leid,d)
# lead with raw contact
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'ООО Ромб '+u,'phone':'8 (999) '+str(base)[:3]+'-'+str(base)[3:5]+'-'+str(base)[5:7]},'cargoInfo':{'origin':'Шанхай','destination':'Москва','weightKg':1200}}); chk('создание лида',s in(200,201),(s,d))
lead=(d.get('lead') or d); lid=lead['id']
s,d=a.r('POST',f'/api/admin/leads/{lid}/convert',{'legalEntityId':leid}); chk('конвертация без варианта → 409',s==409,(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'Море+ЖД','transportModes':['Море','ЖД'],'priceEstimate':450000,'etaDays':45,'priorityFit':'cost'}); chk('вариант расчёта 1',s in(200,201),(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'Авиа','priceEstimate':1200000,'etaDays':7,'priorityFit':'speed','isSelected':True}); chk('вариант 2 isSelected',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); L=d.get('lead',d); sel=[o for o in L.get('options',[]) if o['isSelected']]
chk('ровно один выбранный вариант',len(sel)==1,[o['isSelected'] for o in L.get('options',[])]); chk('статус лида calculated',L.get('status')=='calculated',L.get('status'))
s,d=a.r('POST',f'/api/admin/leads/{lid}/options',{'description':'X','priceEstimate':-5,'etaDays':0,'priorityFit':'cost'}); chk('отрицательная цена → 400',s==400,s)
# broker
bph=ph(base+1); s,d=a.r('POST','/api/admin/brokers',{'companyName':'Брокер '+u,'phone':bph,'password':'broker-pass-1'}); chk('создание брокера',s in(200,201),(s,d)); bid=(d.get('broker') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{lid}/brokers',{'brokerId':bid}); chk('брокер подключён к лиду',s in(200,201),(s,d))
s,d=a.r('POST',f'/api/admin/leads/{lid}/brokers',{'brokerId':bid}); chk('повторное подключение → 409',s==409,s)
# document on lead (internal + public)
body,ct=multipart({'type':'invoice','title':'Инвойс '+u,'isInternal':'false'},'inv.pdf',b'%PDF-1.4 test',"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('загрузка документа на лид',s in(200,201),(s,d))
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
ts=[threading.Thread(target=cv) for _ in range(3)]; [t.start() for t in ts]; [t.join() for t in ts]
codes=sorted(r[0] for r in res); chk('параллельная конвертация: ровно одна 201',codes.count(201)==1,codes)
order=[r[1] for r in res if r[0]==201][0]['order'] if codes.count(201) else None
oid=order['id']; print('ORDER',order)
s,d=a.r('GET',f'/api/admin/orders/{oid}'); O=d.get('order',d)
chk('обязательные этапы подставлены',len(O.get('stages',[]))>=6,len(O.get('stages',[])))
chk('снимок цены перенесён',(O.get('quoteSnapshot') or {}).get('priceEstimate')==1200000,O.get('quoteSnapshot'))
s,d=a.r('GET',f'/api/admin/orders/{oid}/documents'); docs=d.get('documents',d) if isinstance(d,dict) else d
chk('документы перенесены на заявку',isinstance(docs,list) and len(docs)>=2,(s,str(d)[:200]))
st=O['stages']; mand=st[0]
s,d=a.r('DELETE',f'/api/admin/orders/{oid}/stages/{mand["id"]}'); chk('удаление обязательного этапа → отказ',s in(400,403,409),s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{mand["id"]}',{'status':'flying'}); chk('неизвестный статус этапа → 400',s==400,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{mand["id"]}',{'plannedDate':'2026-11-01T00:00:00.000Z','actualDate':'2026-10-01T00:00:00.000Z','status':'done'}); chk('этап: смена статуса и дат',s==200,(s,d))
s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{mand["id"]}',{'actualDate':'2030-01-01T00:00:00.000Z'}); chk('[ЦЕЛЬ P1-06] фактическая дата в будущем отклоняется',s==400,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'status':'completed'}); chk('[ЦЕЛЬ P1-05] «Завершена» при незавершённых этапах отклоняется',s in(400,409),s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'status':'in_progress'}); chk('возврат из completed в in_progress',s==200,(s,d))
# contractor
s,d=a.r('POST','/api/admin/contractor-leads',{'companyName':'Перевозчик '+u}); chk('кандидат-подрядчик',s in(200,201),(s,d)); clid=(d.get('contractorLead') or d.get('lead') or d)['id']
cph=ph(base+2); s,d=a.r('PATCH',f'/api/admin/contractor-leads/{clid}',{'status':'contracted','phone':cph,'password':'contr-pass-1'}); chk('подрядчик рождён',s in(200,201),(s,d))
s,d=a.r('GET','/api/admin/contractors'); cs=d.get('contractors',d); cid=[c for c in cs if c['phone']==cph][0]['id']
st2=st[1]; s,d=a.r('PATCH',f'/api/admin/orders/{oid}/stages/{st2["id"]}',{'contractorId':cid}); chk('подрядчик назначен на этап',s==200,(s,d))
# client access
cust=O['customer']['id'] if O.get('customer') else O['customerId']
s,d=a.r(AM,f'/api/admin/customers/{cust}/access',{'password':'client-pass-1'}); chk('доступ клиенту выдан',s in(200,201),(s,d))
s,d=a.r('GET',f'/api/admin/customers/{cust}'); cphone=(d.get('customer',d)).get('phone'); print('client phone',cphone)
# --- client
c=C(); s,d=c.r('POST','/api/auth/client/login',{'phone':cphone,'password':'client-pass-1'}); chk('вход клиента',s==200,(s,d))
s,d=c.r('GET',f'/api/client/orders/{oid}'); chk('клиент видит свою заявку',s==200,(s,str(d)[:200]))
txt=json.dumps(d,ensure_ascii=False)
chk('клиент НЕ видит цену/снимок',('1200000' not in txt),'price leaked')
chk('клиент НЕ видит подрядчика',('Перевозчик '+u) not in txt,'contractor name leaked')
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
s,d=b.r('PUT',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':85000,'requiredPermits':['Сертификат соответствия']})
if s==405: s,d=b.r('PATCH',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':85000,'requiredPermits':['Сертификат соответствия']})
if s==405: s,d=b.r('POST',f'/api/broker/leads/{lid}/estimate',{'customsDutyEstimate':85000,'requiredPermits':['Сертификат соответствия']})
chk('брокер даёт оценку платежей',s in(200,201),(s,d))
# --- contractor
k=C(); s,d=k.r('POST','/api/auth/contractor/login',{'phone':cph,'password':'contr-pass-1'}); chk('вход подрядчика',s==200,(s,d))
s,d=k.r('GET',f'/api/contractor/orders/{oid}'); txt=json.dumps(d,ensure_ascii=False); chk('подрядчик видит заявку со своим этапом',s==200,(s,txt[:150]))
chk('подрядчик НЕ видит цену клиента',('1200000' not in txt),'price leaked to contractor')
chk('подрядчик видит только свои этапы',txt.count('"stageCode"')<=1,txt.count('"stageCode"'))
s,d=k.r('PATCH',f'/api/contractor/orders/{oid}/stages/{mand["id"]}',{'status':'in_progress'}); chk('подрядчик не правит чужой этап',s in(403,404),s)
s,d=k.r('PATCH',f'/api/contractor/orders/{oid}/stages/{st2["id"]}',{'status':'problem'}); chk('подрядчик ставит problem своему этапу',s==200,(s,d))
# --- IDOR: second client
s,d=a.r('POST','/api/admin/customers',{'name':'Чужой '+u,'phone':ph(base+3)}); c2=(d.get('customer') or d)['id']
a.r(AM,f'/api/admin/customers/{c2}/access',{'password':'client-pass-2'})
c2c=C(); c2c.r('POST','/api/auth/client/login',{'phone':ph(base+3),'password':'client-pass-2'})
s,d=c2c.r('GET',f'/api/client/orders/{oid}'); chk('IDOR: чужой клиент не видит заявку',s in(403,404),s)
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
print('\nTOTAL', sum(1 for r in R if r[1]),'/',len(R))
json.dump(R,open('/tmp/logix_e2e_results.json','w'),ensure_ascii=False,indent=1)
hard=[r for r in R if not r[1] and not r[0].startswith('[ЦЕЛЬ')]
print('Целевые (ещё не реализованы):',sum(1 for r in R if not r[1] and r[0].startswith('[ЦЕЛЬ')))
sys.exit(1 if hard else 0)
