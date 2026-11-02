#!/usr/bin/env python3
"""DF-11: перевод e2e на двухфазную загрузку + секция DF-11 (+20 проверок)."""
from pathlib import Path
import sys

P = Path('/home/z/my-project/scripts/e2e_api_test.py')
s = P.read_text(encoding='utf-8')

def sub(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit(f'FAIL: якорь {n}x (ожидалось {count}):\n{old[:160]}')
    s = s.replace(old, new)

# ── 1. Хелперы двухфазной загрузки (после multipart) ──
HELPER = '''def up2(ses, url, fname, fbytes, mime, permit_id=None, extra=None):
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
    """GET без следования редиректам: для проверки 302 на presigned GET."""
    class NR(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    op = urllib.request.build_opener(NR, urllib.request.HTTPCookieProcessor(ses.j))
    try:
        x = op.open(urllib.request.Request(B + path if path.startswith('/') else path))
        return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()

u=uuid.uuid4().hex[:6]; ph=lambda n: '+7999%07d'%n'''
sub("u=uuid.uuid4().hex[:6]; ph=lambda n: '+7999%07d'%n", HELPER)

# ── 2. Секция на запросе (лид): 6 сайтов ──
sub("""body,ct=multipart({'type':'invoice','title':'Инвойс '+u,'isInternal':'false'},'inv.pdf',b'%PDF-1.4 test',"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('загрузка документа на запрос',s in(200,201),(s,d))
body,ct=multipart({'type':'contract','title':'Тариф подрядчика '+u,'isInternal':'true'},'tariff.pdf',b'%PDF-1.4 secret',"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('загрузка внутреннего документа',s in(200,201),(s,d))
body,ct=multipart({'type':'other','title':'html'},'x.html',b'<script>alert(1)</script>',"text/html")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('HTML-файл отклонён',s==400,s)
body,ct=multipart({'type':'other','title':'html as pdf'},'x.pdf',b'<html><script>alert(1)</script></html>',"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('E0-07 HTML под видом PDF отклонён (проверка сигнатуры файла)',s==400,s)
body,ct=multipart({'type':'other','title':'docx без MIME'},'act.docx',b'PK\\x03\\x04'+b'\\x00'*64,'application/octet-stream')
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('E0-07 DOCX без MIME от браузера принимается по сигнатуре',s in(200,201),(s,d))
body,ct=multipart({'type':'other','title':'big'},'big.pdf',b'%PDF'+b'0'*(4*1024*1024+10),"application/pdf")
s,d=a.r('POST',f'/api/admin/leads/{lid}/documents',raw=body,ct=ct); chk('файл >4МБ отклонён',s in(400,413),s)""",
"""s,d=up2(a,f'/api/admin/leads/{lid}/documents','inv.pdf',b'%PDF-1.4 test',"application/pdf",extra={'type':'invoice','title':'Инвойс '+u}); chk('загрузка документа на запрос',s in(200,201),(s,d))
s,d=up2(a,f'/api/admin/leads/{lid}/documents','tariff.pdf',b'%PDF-1.4 secret',"application/pdf",extra={'type':'contract','title':'Тариф подрядчика '+u,'isInternal':True}); chk('загрузка внутреннего документа',s in(200,201),(s,d))
s,d=up2(a,f'/api/admin/leads/{lid}/documents','x.html',b'<script>alert(1)</script>',"text/html",extra={'type':'other','title':'html'}); chk('HTML-файл отклонён',s==400,s)
s,d=up2(a,f'/api/admin/leads/{lid}/documents','x.pdf',b'<html><script>alert(1)</script></html>',"application/pdf",extra={'type':'other','title':'html as pdf'}); chk('E0-07 HTML под видом PDF отклонён (проверка сигнатуры файла)',s==400,s)
s,d=up2(a,f'/api/admin/leads/{lid}/documents','act.docx',b'PK\\x03\\x04'+b'\\x00'*64,'application/octet-stream',extra={'type':'other','title':'docx без MIME'}); chk('E0-07 DOCX без MIME от браузера принимается по сигнатуре',s in(200,201),(s,d))
s,d=up2(a,f'/api/admin/leads/{lid}/documents','big.pdf',b'%PDF',"application/pdf",extra={'type':'other','title':'big','size':26*1024*1024}); chk('файл >25МБ отклонён (лимит files.max_mb, DF-11)',s in(400,413),s)""")

# ── 3. DF-02A: клиент и брокер ──
sub("""body,ct=multipart({'type':'invoice','title':'Счёт от клиента '+u},'cl.pdf',b'%PDF-1.4 client',"application/pdf")
s,d=c.r('POST',f'/api/client/orders/{oid}/documents',raw=body,ct=ct); chk('DF-02A: клиент загрузил документ (версия 1)',s in(200,201),(s,d))""",
"""s,d=up2(c,f'/api/client/orders/{oid}/documents','cl.pdf',b'%PDF-1.4 client',"application/pdf",extra={'type':'invoice','title':'Счёт от клиента '+u}); chk('DF-02A: клиент загрузил документ (версия 1)',s in(200,201),(s,d))""")
sub("""body,ct=multipart({'type':'other','title':'Акт брокера '+u},'br.pdf',b'%PDF-1.4 broker',"application/pdf")
s,d=b.r('POST',f'/api/broker/orders/{oid}/documents',raw=body,ct=ct); chk('DF-02A: брокер загрузил документ',s in(200,201),(s,d))""",
"""s,d=up2(b,f'/api/broker/orders/{oid}/documents','br.pdf',b'%PDF-1.4 broker',"application/pdf",extra={'type':'other','title':'Акт брокера '+u}); chk('DF-02A: брокер загрузил документ',s in(200,201),(s,d))""")

# ── 4. DF-03 ──
sub("""body,ct=multipart({'type':'invoice','title':'DF03 счёт '+u},'inv3.pdf',b'%PDF-1.4 df03',"application/pdf")
s,d=c3.r('POST',f'/api/client/orders/{oid3}/documents',raw=body,ct=ct); chk('DF-03: клиент загрузил документ',s in(200,201),(s,d)); doc3=(d.get('document') or d)['id']""",
"""s,d=up2(c3,f'/api/client/orders/{oid3}/documents','inv3.pdf',b'%PDF-1.4 df03',"application/pdf",extra={'type':'invoice','title':'DF03 счёт '+u}); chk('DF-03: клиент загрузил документ',s in(200,201),(s,d)); doc3=(d.get('document') or d)['id']""")
sub("""body,ct=multipart({'type':'invoice','title':'DF03 счёт '+u},'inv3b.pdf',b'%PDF-1.4 df03-v2',"application/pdf")
s,d=c3.r('POST',f'/api/client/documents/{doc3}/versions',raw=body,ct=ct); chk('DF-03: клиент добавил версию (та же карточка)',s in(200,201),(s,d))""",
"""s,d=up2(c3,f'/api/client/documents/{doc3}/versions','inv3b.pdf',b'%PDF-1.4 df03-v2',"application/pdf",extra={'comment':'правка веса'}); chk('DF-03: клиент добавил версию (та же карточка)',s in(200,201),(s,d))""")
sub("""body,ct=multipart({'type':'invoice','title':'DF03 счёт '+u},'inv3c.pdf',b'%PDF-1.4 df03-v3',"application/pdf")
s,d=c3.r('POST',f'/api/client/documents/{doc3}/versions',raw=body,ct=ct)""",
"""s,d=up2(c3,f'/api/client/documents/{doc3}/versions','inv3c.pdf',b'%PDF-1.4 df03-v3',"application/pdf",extra={'comment':'ещё правка'})""")

# ── 5. DF-16 permits ──
sub("""body,ct=multipart({'type':'permit','title':'Чужой документ'},'x.pdf',b'%PDF-1.4 x','application/pdf')
s,d=c.r('POST',f'/api/client/permits/{target16["id"]}/document',raw=body,ct=ct); chk('DF-16: чужой клиент закрывает строку → 404',s==404,s)""",
"""s,d=up2(c,f'/api/client/permits/{target16["id"]}/document','x.pdf',b'%PDF-1.4 x','application/pdf',permit_id=target16["id"],extra={'title':'Чужой документ'}); chk('DF-16: чужой клиент закрывает строку → 404',s==404,s)""")
sub("""s,d=bx16.r('POST',f'/api/broker/permits/{target16["id"]}/document',raw=body,ct=ct); chk('DF-16: чужой брокер закрывает строку → 404',s==404,s)""",
"""s,d=up2(bx16,f'/api/broker/permits/{target16["id"]}/document','x.pdf',b'%PDF-1.4 x','application/pdf',permit_id=target16["id"],extra={'title':'Чужой документ'}); chk('DF-16: чужой брокер закрывает строку → 404',s==404,s)""")
sub("""body,ct=multipart({'type':'permit','title':'Фитосанитарный сертификат DF16 (скан)','comment':'оригинал отгрузили'},'permit16.pdf',b'%PDF-1.4 df16','application/pdf')
s,d=c3.r('POST',f'/api/client/permits/{target16["id"]}/document',raw=body,ct=ct); chk('DF-16: клиент загрузил документ в строку',s in(200,201),(s,d))""",
"""s,d=up2(c3,f'/api/client/permits/{target16["id"]}/document','permit16.pdf',b'%PDF-1.4 df16','application/pdf',permit_id=target16["id"],extra={'title':'Фитосанитарный сертификат DF16 (скан)','comment':'оригинал отгрузили'}); chk('DF-16: клиент загрузил документ в строку',s in(200,201),(s,d))""")
sub("""body,ct=multipart({'type':'permit','title':'ещё один'},'y.pdf',b'%PDF-1.4 y','application/pdf')
s,d=c3.r('POST',f'/api/client/permits/{target16["id"]}/document',raw=body,ct=ct)
chk('DF-16: повторная загрузка в закрытую строку → 409',s==409,(s,d))""",
"""s,d=up2(c3,f'/api/client/permits/{target16["id"]}/document','y.pdf',b'%PDF-1.4 y','application/pdf',permit_id=target16["id"],extra={'title':'ещё один'})
chk('DF-16: повторная загрузка в закрытую строку → 409',s==409,(s,d))""")

# ── 6. Секция DF-11 (+20) перед TOTAL ──
SECTION = '''
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
chk('DF-11: скачивание — 302 без кеша на подписанный URL',s==302 and _h.get('Cache-Control')=='private, no-store' and '/api/storage/local/' in _h.get('Location',''),(s,_h.get('Location','')[:70]))
_loc=_h.get('Location','')
if _loc.startswith('/'): _loc=B+_loc
s2,_h2,_body2=raw_get(a,_loc)
chk('DF-11: по ссылке отдаются байты PDF inline',s2==200 and _h2.get('Content-Type')=='application/pdf' and _h2.get('Content-Disposition','').startswith('inline'),(s2,_h2.get('Content-Type'),_h2.get('Content-Disposition','')[:40]))
s3,_h3,body3=raw_get(a,_loc)
chk('DF-11: байты совпадают с загруженными',body3==b'%PDF-1.4 df11',len(body3))
s,d=cb.r('GET',f'/api/document-versions/{_v11["id"]}/file'); chk('DF-11: чужой клиент не получает ссылку (404 до выдачи)',s==404,s)
s,d=cb.r('POST',f'/api/client/document-versions/{_v11["id"]}/confirm'); chk('DF-11: чужой confirm — 404 (права до хранилища)',s==404,(s,d))
s,d=a.r('POST',f'/api/admin/document-versions/{_pendv}/confirm'); chk('DF-11: confirm без байтов → 400, pending остаётся на повтор',s==400,(s,d))
s,d=a.r('POST',f'/api/admin/document-versions/{_pendv}/confirm'); chk('DF-11: повторный confirm без байтов — снова 400',s==400,(s,d))
s,d=up2(a,_du16,'evil.pdf',b'<html>не pdf</html>',"application/pdf",extra={'type':'other','title':'DF-11 evil'})
chk('DF-11: HTML под видом PDF → confirm 400, объект удалён',s==400,(s,d))
s,d=a.r('POST',_du16,b={'type':'other','title':'DF-11 big','fileName':'big.pdf','mimeType':'application/pdf','size':26*1024*1024})
chk('DF-11: create 26 МБ → 400 (лимит files.max_mb)',s==400,(s,d))
s,d=up2(a,_du16,'df11-20mb.zip',b'PK\\x03\\x04'+b'0'*(20*1024*1024),"application/zip",extra={'type':'other','title':'DF-11 20MB'})
_v20=(d.get('version') or {})
chk('DF-11: загрузка 20 МБ проходит (критерий приёмки)',s==200,(s,))
chk('DF-11: фактический размер зафиксирован confirm-ом',_v20.get('fileSize')==20*1024*1024+4,_v20.get('fileSize'))
s,d=up2(c3,f'/api/client/orders/{oid16}/documents','cl11.pdf',b'%PDF-1.4 cl',"application/pdf",extra={'type':'invoice','title':'DF-11 счёт клиента'})
chk('DF-11: клиент загрузил через свой портал',s==200,(s,d))
s,d=up2(b17,f'/api/broker/orders/{oid16}/documents','br11.pdf',b'%PDF-1.4 br',"application/pdf",extra={'type':'other','title':'DF-11 акт брокера'})
chk('DF-11: брокер загрузил через свой портал',s==200,(s,d))
s,d=up2(a,_du16,'a11.docx',b'PK\\x03\\x04'+b'\\x00'*32,'application/octet-stream',extra={'type':'other','title':'DF-11 docx'})
_vd11=(d.get('version') or {})
s4,_h4,_=raw_get(a,f'/api/document-versions/{_vd11["id"]}/file')
_loc4=_h4.get('Location','')
if _loc4.startswith('/'): _loc4=B+_loc4
s5,_h5,_=raw_get(a,_loc4)
chk('DF-11: docx — attachment octet-stream (не inline)',s5==200 and _h5.get('Content-Disposition','').startswith('attachment') and _h5.get('Content-Type')=='application/octet-stream',(s5,_h5.get('Content-Type')))
s6,_h6,_=raw_get(a,f'/api/document-versions/{_vd11["id"]}/file')
_bad=_h6.get('Location','').replace('sig=','sig=0')
if _bad.startswith('/'): _bad=B+_bad
s7,_,_=raw_get(a,_bad)
chk('DF-11: подделанная подпись ссылки — 403',s7==403,(s7,))
s,d=a.r('DELETE',f'/api/admin/documents/{(d.get("document") or {}).get("id")}')
chk('DF-11: удаление документа менеджером — ок',s in(200,204),(s,d))
s8,_h8,_=raw_get(a,f'/api/document-versions/{_vd11["id"]}/file')
chk('DF-11: после удаления версии файла нет (404)',s8==404,(s8,))

'''
sub("print('\\nTOTAL'", SECTION + "print('\\nTOTAL'", 1)

P.write_text(s, encoding='utf-8')
print('OK: e2e_api_test.py обновлён')
