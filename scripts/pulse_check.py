#!/usr/bin/env python3
"""
Сверка «Пульса» (DF-07): числа GET /api/admin/pulse против прямого SQL.
Запускается на ТЕСТОВОЙ базе при поднятом сервере:

  BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://postgres@localhost:5433/logix \
  ADMIN_PHONE=+79000000000 ADMIN_PASSWORD=... python3 scripts/pulse_check.py

  + --seed N  — засеять N заявок-маркеров (PULSECHK-*), замерить время
                ответа на наборе (критерий: ≤ 1 с), убрать за собой.

Код выхода 1 при любом расхождении или превышении времени ответа.
"""
import argparse
import json
import os
import sys
import time
import urllib.request
from http.cookiejar import CookieJar, DefaultCookiePolicy

B = os.environ.get('BASE_URL', 'http://localhost:3000')
ACTIVE = "('calculating','confirmed','in_progress')"
MARK = 'PULSECHK-'
FAILS = []


def chk(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else ' :: ' + str(detail)[:200]))
    if not ok:
        FAILS.append(name)


# Прод-сервер ставит Secure-cookie — на http localhost голый CookieJar
# их отбрасывает (тот же приём, что в e2e_api_test.py: класс с
# return_ok_secure=True).
class Policy(DefaultCookiePolicy):
    def return_ok_secure(self, cookie, request):
        return True


def api(path, body=None, method='GET'):
    req = urllib.request.Request(
        B + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
    )
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    with opener.open(req) as r:
        return json.loads(r.read() or b'null')


opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(CookieJar(Policy()))
)


def sql(conn, query, args=()):
    with conn.cursor() as cur:
        cur.execute(query, args)
        return cur.fetchall()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=0, help='засеять N заявок для замера времени')
    args = ap.parse_args()

    dsn = os.environ.get('DATABASE_URL', '')
    if not dsn:
        print('Нет DATABASE_URL'); return 1
    phone = os.environ.get('ADMIN_PHONE', '')
    password = os.environ.get('ADMIN_PASSWORD', '')
    if not phone or not password:
        print('Нет ADMIN_PHONE/ADMIN_PASSWORD'); return 1

    import psycopg2
    conn = psycopg2.connect(dsn)

    # ── вход мастером через API ──
    me = api('/api/auth/employee/login', {'phone': phone, 'password': password}, 'POST')
    chk('вход мастером', me.get('authenticated') is True and 'master' in (me.get('employee', {}).get('roles') or []), me)

    # ── Пульс мастером + замер времени ──
    # (проверка «менеджер → 403» живёт в e2e_api_test.py — здесь вход
    # не-мастера потребовал бы ещё одного пароля в env без пользы)
    t0 = time.perf_counter()
    pulse = api('/api/admin/pulse')
    dt = time.perf_counter() - t0
    print(f'время ответа API: {dt*1000:.0f} мс')

    st = pulse.get('stats') or {}
    if args.seed > 0:
        seed_orders(conn, args.seed)
        t1 = time.perf_counter()
        pulse = api('/api/admin/pulse')
        dt = time.perf_counter() - t1
        st = pulse.get('stats') or {}
        print(f'время ответа на наборе +{args.seed} заявок: {dt*1000:.0f} мс')
        chk('ответ ≤ 1 с на наборе 200 заявок', dt < 1.0, f'{dt*1000:.0f} мс')

    # ── сверка с прямым SQL ──
    (db_active,) = sql(conn, f'SELECT COUNT(*) FROM "Order" WHERE status IN {ACTIVE}')[0]
    (db_prog,) = sql(conn, f'SELECT COUNT(*) FROM "Order" WHERE status = \'in_progress\'')[0]
    (db_leads,) = sql(conn, 'SELECT COUNT(*) FROM "Lead" WHERE "createdAt" >= now() - interval \'24 hours\'')[0]
    # Порог: строка в Setting появляется только после правки мастером;
    # до той — дефолт реестра lib/settings.ts (waiting.attention_hours = 24).
    rows = sql(conn, "SELECT (value::text)::int FROM \"Setting\" WHERE key = 'waiting.attention_hours'")
    hours = rows[0][0] if rows else 24
    (db_wait,) = sql(conn, f"""SELECT COUNT(*) FROM "Order"
        WHERE status IN {ACTIVE} AND "waitingOnKind" IS NOT NULL AND "waitingOnKind" <> 'none'
          AND "waitingSince" IS NOT NULL AND "waitingSince" < now() - make_interval(hours => %s)""", (hours,))[0]
    (db_prob,) = sql(conn, f"""SELECT COUNT(*) FROM "OrderStageInstance" s
        JOIN "Order" o ON o.id = s."orderId"
        WHERE s.status = 'problem' AND o.status IN {ACTIVE}""")[0]

    chk('активные заявки', st.get('activeOrders') == db_active, (st.get('activeOrders'), db_active))
    chk('в пути', st.get('inProgress') == db_prog, (st.get('inProgress'), db_prog))
    chk('новые запросы 24ч', st.get('newLeads24h') == db_leads, (st.get('newLeads24h'), db_leads))
    chk('ждут дольше порога', st.get('waitingOverThreshold') == db_wait, (st.get('waitingOverThreshold'), db_wait))
    chk('этапы с проблемой', st.get('problemStages') == db_prob, (st.get('problemStages'), db_prob))
    chk('порог в ответе', st.get('attentionHours') == hours, (st.get('attentionHours'), hours))

    groups = sql(conn, f"""SELECT "waitingOnKind", COUNT(*), MIN("waitingSince") FROM "Order"
        WHERE status IN {ACTIVE} AND "waitingOnKind" IS NOT NULL AND "waitingOnKind" <> 'none'
          AND "waitingSince" IS NOT NULL GROUP BY 1""")
    api_by_kind = {g.get('kind'): g for g in (pulse.get('slowing') or [])}
    chk('число групп тормозящих', len(api_by_kind) == len(groups), (len(api_by_kind), len(groups)))
    for kind, cnt, oldest in groups:
        g = api_by_kind.get(kind)
        # datetime из БД печатается с пробелом вместо 'T' (и микросекунды
        # точнее миллисекунд ISO) — сравниваем посекундно, в UTC.
        oldest_iso = oldest.replace(tzinfo=None).isoformat(sep='T', timespec='seconds')
        chk(f'группа {kind}: счётчик', g is not None and g['count'] == cnt, (None if g is None else g['count'], cnt))
        chk(f'группа {kind}: самое старое', g is not None and g['oldestSince'][:19] == oldest_iso, (None if g is None else g['oldestSince'], oldest_iso))

    (db_cargo,) = sql(conn, f'SELECT COUNT(*) FROM "Order" WHERE status IN {ACTIVE}')[0]
    chk('cargoTotal = активным', pulse.get('cargoTotal') == db_cargo, (pulse.get('cargoTotal'), db_cargo))
    chk('события ≤ 20', len(pulse.get('events') or []) <= 20, len(pulse.get('events') or []))

    if args.seed > 0:
        cleanup(conn, args.seed)
    conn.close()
    print(f'\nИтог: {len(FAILS)} расхождений' + ('' if not FAILS else ': ' + ', '.join(FAILS)))
    return 1 if FAILS else 0


def seed_orders(conn, n):
    """N заявок-маркеров с одним этапом (план вчера) и мячом у клиента."""
    (contract,) = sql(conn, 'SELECT id FROM "Contract" ORDER BY "createdAt" LIMIT 1')[0]
    (le,) = sql(conn, 'SELECT id FROM "LegalEntity" ORDER BY "createdAt" LIMIT 1')[0]
    (cust,) = sql(conn, 'SELECT id FROM "Customer" ORDER BY "createdAt" LIMIT 1')[0]
    (stage,) = sql(conn, 'SELECT code FROM "OrderStageCatalog" ORDER BY "order" LIMIT 1')[0]
    (base_seq,) = sql(conn, 'SELECT COALESCE(MAX("numberInContract"), 0) FROM "Order" WHERE "contractId" = %s', (contract,))[0]
    with conn.cursor() as cur:
        for i in range(n):
            oid = f'pulsechk{i:08d}'
            cur.execute(
                """INSERT INTO "Order" (id, number, "numberInContract", "contractId", "legalEntityId",
                                        "customerId", status, "waitingOnKind", "waitingReason", "waitingSince")
                   VALUES (%s, %s, %s, %s, %s, %s, 'in_progress', 'client', 'awaiting_client_approval', now() - interval '2 days')
                   ON CONFLICT (id) DO NOTHING""",
                (oid, f'{MARK}{i}', base_seq + 1 + i, contract, le, cust),
            )
            cur.execute(
                """INSERT INTO "OrderStageInstance" (id, "orderId", "stageCode", "sequence", status, "plannedDate")
                   VALUES (%s, %s, %s, 1, 'in_progress', date_trunc('day', now()) - interval '1 day')
                   ON CONFLICT (id) DO NOTHING""",
                (oid + '_s1', oid, stage),
            )
    conn.commit()
    print(f'засеяно {n} заявок-маркеров ({MARK}*)')


def cleanup(conn, n):
    with conn.cursor() as cur:
        cur.execute('DELETE FROM "Order" WHERE number LIKE %s', (MARK + '%',))
        deleted = cur.rowcount
    conn.commit()
    print(f'убрано маркеров: {deleted} (ожидалось {n})')


if __name__ == '__main__':
    sys.exit(main())
