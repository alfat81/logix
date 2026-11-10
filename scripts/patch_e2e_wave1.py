#!/usr/bin/env python3
# patch_e2e_wave1.py — поток A волна 1: правки scripts/e2e_api_test.py
# (BL-4: конвертация только после согласования; BL-5: заявка сразу
# in_progress; новый блок сценариев согласования К-01…К-11 —
# позитивные пути каждого эндпоинта, план ред. 3 §4.1 «Тесты»).
import io, sys

PATH = 'scripts/e2e_api_test.py'
src = io.open(PATH, encoding='utf-8').read()
orig = src

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        print(f'FAIL: {n} вхождений (ожидалось {count}): {old[:90]!r}')
        sys.exit(1)
    src = src.replace(old, new)

# 1. Главное полотно: согласование перед параллельной конвертацией
rep("""# parallel convert
res=[]
def cv():""",
"""# поток A (BL-4): конвертация — только после согласования (confirm-API,
# фиксация менеджером от имени клиента — без optionId берёт isSelected)
s,d=a.r('POST',f'/api/admin/leads/{lid}/confirm',{}); chk('поток A: согласие зафиксировано (manager_on_behalf)',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/leads/{lid}'); LA=d.get('lead',d)
chk('поток A: статус client_approved, метаданные кто/как',LA.get('status')=='client_approved' and LA.get('clientConfirmedVia')=='manager_on_behalf',(LA.get('status'),LA.get('clientConfirmedVia')))
s,d=a.r('POST',f'/api/admin/leads/{lid}/confirm',{}); chk('поток A: повторное подтверждение → 409 (К-02/К-10)',s==409,s)
# parallel convert
res=[]
def cv():""")

# 2. Статус/мяч заявки после конвертации: in_progress + stage_unassigned
rep("""chk('DF-05: заявка в расчёте — мяч у менеджера (calculating)',(O.get('waitingOnKind'),O.get('waitingReason'))==('manager','calculating'),(O.get('waitingOnKind'),O.get('waitingReason')))
chk('снимок цены перенесён',""",
"""chk('BL-5: заявка из конвертации сразу «В работе»',O.get('status')=='in_progress',O.get('status'))
chk('DF-05: заявка в работе, этап без исполнителя — мяч у менеджера (stage_unassigned)',(O.get('waitingOnKind'),O.get('waitingReason'))==('manager','stage_unassigned'),(O.get('waitingOnKind'),O.get('waitingReason')))
chk('снимок цены перенесён',""")

# 3. Повтор PATCH in_progress на уже-в-работе заявке → 400
rep("""s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'status':'in_progress'}); chk('возврат из completed в in_progress',s==200,(s,d))""",
"""s,d=a.r('PATCH',f'/api/admin/orders/{oid}',{'status':'in_progress'}); chk('BL-5: заявка из конвертации уже в работе — повтор → 400',s==400,s)""")

# 4. DF-05 flow: confirm перед конвертацией lid5
rep("""s,d=a.r('POST',f'/api/admin/leads/{lid5}/convert',{'legalEntityId':leid}); chk('DF-05: конвертация → заявка',s in(200,201),(s,d)); oid5=(d.get('order') or d)['id']
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('DF-05: заявка в расчёте — мяч у менеджера',(O5.get('waitingOnKind'),O5.get('waitingReason'))==('manager','calculating'),(O5.get('waitingOnKind'),O5.get('waitingReason')))
since1=O5.get('waitingSince')
s,d=a.r('PATCH',f'/api/admin/orders/{oid5}',{'status':'confirmed'}); chk('DF-05: статус → Согласование',s==200,(s,d))
s,d=a.r('GET',f'/api/admin/orders/{oid5}'); O5=d.get('order',d)
chk('DF-05: согласование — мяч у клиента',(O5.get('waitingOnKind'),O5.get('waitingReason'))==('client','awaiting_client_approval'),(O5.get('waitingOnKind'),O5.get('waitingReason')))
chk('DF-05: waitingSince сдвинулся при смене kind',bool(O5.get('waitingSince')) and O5.get('waitingSince')!=since1,(since1,O5.get('waitingSince')))
s,d=c.r('GET',f'/api/client/orders/{oid5}'); C5=(d.get('order') or {})
chk('DF-05: клиент видит нейтральное ожидание своего мяча',(C5.get('waiting') or {}).get('reason')=='awaiting_client_approval' and bool((C5.get('waiting') or {}).get('since')),C5.get('waiting'))""",
"""# поток A (BL-4): lid5 конвертируется после согласования (confirm-API)
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
chk('DF-05: клиент видит нейтральное ожидание своего мяча',(C5.get('waiting') or {}).get('reason')=='awaiting_client_approval' and bool((C5.get('waiting') or {}).get('since')),C5.get('waiting'))""")

# 5. Ручная заявка → В работе (возврат перехода calculating→in_progress)
rep("""s,d=a.r('PATCH',f'/api/admin/orders/{oid5}',{'status':'in_progress'}); chk('DF-05: статус → В работе',s==200,(s,d))""",
"""s,d=a.r('PATCH',f'/api/admin/orders/{oid5m}',{'status':'in_progress'}); chk('DF-05: ручная заявка — статус → В работе',s==200,(s,d))""")

# 6..10. Confirm перед остальными конвертациями
rep("""s,d=a.r('POST',f'/api/admin/leads/{lid3}/convert',{'legalEntityId':leid,'incoterm':'FOB'}); o3=(d.get('order') or d); oid3=o3['id']""",
"""a.r('POST',f'/api/admin/leads/{lid3}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid3}/convert',{'legalEntityId':leid,'incoterm':'FOB'}); o3=(d.get('order') or d); oid3=o3['id']""")

rep("""s,d=a.r('POST',f'/api/admin/leads/{lid16}/convert',{'legalEntityId':leid}); chk('DF-16: запрос конвертирован в заявку',s in(200,201),(s,d)); oid16=(d.get('order') or d)['id']""",
"""a.r('POST',f'/api/admin/leads/{lid16}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid16}/convert',{'legalEntityId':leid}); chk('DF-16: запрос конвертирован в заявку',s in(200,201),(s,d)); oid16=(d.get('order') or d)['id']""")

rep("""s,d=a.r('POST',f'/api/admin/leads/{lid23}/convert',{'legalEntityId':leid}); chk('DF-23: запрос конвертирован (в теле нет incotermCode)',s in(200,201),(s,d)); oid23=(d.get('order') or d)['id']""",
"""a.r('POST',f'/api/admin/leads/{lid23}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid23}/convert',{'legalEntityId':leid}); chk('DF-23: запрос конвертирован (в теле нет incotermCode)',s in(200,201),(s,d)); oid23=(d.get('order') or d)['id']""")

rep("""s,d=a.r('POST',f'/api/admin/leads/{_lid13}/convert',{'legalEntityId':leid}); _oid13=(d.get('order') or d)['id']""",
"""a.r('POST',f'/api/admin/leads/{_lid13}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{_lid13}/convert',{'legalEntityId':leid}); _oid13=(d.get('order') or d)['id']""")

rep("""s,d=a.r('POST',f'/api/admin/leads/{lid14}/convert',{'legalEntityId':leid}); chk('DF-14: конвертация → заявка',s in(200,201),(s,d)); o14=(d.get('order') or d); oid14=o14['id']
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}',{'status':'confirmed'}); chk('DF-14: статус → согласование',s==200,(s,d))
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}',{'status':'in_progress'}); chk('DF-14: статус → в работе',s==200,(s,d))""",
"""a.r('POST',f'/api/admin/leads/{lid14}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{lid14}/convert',{'legalEntityId':leid}); chk('DF-14: конвертация → заявка',s in(200,201),(s,d)); o14=(d.get('order') or d); oid14=o14['id']
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}',{'status':'confirmed'}); chk('BL-5: из «В работе» нельзя в «Согласование» → 409',s==409,s)
s,d=a.r('PATCH',f'/api/admin/orders/{oid14}',{'status':'in_progress'}); chk('BL-5: заявка уже в работе — повтор → 400',s==400,s)""")

rep("""s,d=a.r('POST',f'/api/admin/leads/{_lw2}/convert',{'legalEntityId':leid}); _ow2=(d.get('order') or d); oidw2=_ow2['id']""",
"""a.r('POST',f'/api/admin/leads/{_lw2}/confirm',{})
s,d=a.r('POST',f'/api/admin/leads/{_lw2}/convert',{'legalEntityId':leid}); _ow2=(d.get('order') or d); oidw2=_ow2['id']""")

# 11. Новый блок сценариев согласования (поток A) — перед финальной сводкой.
# Ищем якорь финального print (summary). Проверим наличие якоря:
anchor = "\nprint('\\nTOTAL'"
if anchor not in src:
    # запасной якорь — строка вывода итога
    for cand in ["print('\\nИТОГ", "print('\\n=== ИТОГ", "=== SUMMARY", "ИТОГ"]:
        if cand in src:
            anchor = src[src.index(cand) - 1]
            break
    else:
        print('FAIL: не найден якорь финального вывода')
        sys.exit(1)

block = r"""
# ═══ Поток A волна 1 (BL): сценарии согласования (план ред. 3 §7) ═══
# К-01 (порядок «конвертация первой»), К-03 (гард вариантов),
# К-04 (отказ после согласования), К-05 (сброс+повторное согласование,
# два снимка), К-07 (регресс 6.1), К-09 (отказ терминален для сброса),
# BL-7 (клиентская проекция: варианты/цены без себестоимости; архив).
print('\n--- Поток A: сценарии согласования ---')
s,d=a.r('POST','/api/admin/leads',{'rawContact':{'name':'Поток A клиент '+u,'phone':ph(base+71)},'route':{'originCity':'Шанхай','destinationCity':'Москва','weightKg':700}}); _lw1=(d.get('lead') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/options',{'description':'PA авто','transportModes':['Авто'],'price':210000,'currency':'RUB','vatMode':'WITHOUT_VAT','costEstimate':130000,'etaDays':20,'priorityFit':'cost','isSelected':True}); _pa_a=(d.get('option') or d)['id']
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/options',{'description':'PA море','transportModes':['Море'],'price':180000,'currency':'RUB','vatMode':'WITH_VAT','etaDays':30,'priorityFit':'speed'}); _pa_b=(d.get('option') or d)['id']
# К-01: конвертация первой — 409 «сначала зафиксируйте согласие»
s,d=a.r('POST',f'/api/admin/leads/{_lw1}/convert',{'legalEntityId':leid}); chk('К-01: конвертация несогласованного → 409',s==409,s)
# клиентская сессия владельца сделки: выдаём доступ и входим
s,d=a.r('GET',f'/api/admin/leads/{_lw1}'); _pac=((d.get('lead') or d).get('customer') or {}).get('id')
s,d=a.r('GET',f'/api/admin/customers/{_pac}'); _pac_ph=(d.get('customer') or d).get('phone')
a.r('POST',f'/api/admin/customers/{_pac}/access',{'name':'Поток A юзер '+u,'phone':ph(base+72),'password':'pa-pass-1'})
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
"""

# Вставляем блок перед финальной сводкой
idx = src.index(anchor)
src = src[:idx] + block + src[idx:]

if src == orig:
    print('FAIL: изменений нет')
    sys.exit(1)
io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK: e2e обновлён')
