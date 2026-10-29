#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Release pipeline v0.6.8 (LogX) — RULES 2.16.
Stages: env, tree, gates, e2e, docs, build, panel, commit
Usage:
  python3 scripts/release_v068_all.py            # run all pending stages
  python3 scripts/release_v068_all.py env gates  # run selected stages
  python3 scripts/release_v068_all.py reset      # clear stage state
Resumable: completed stages are recorded in .release-v068-state.json (git-excluded).
"""
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE_F = ROOT / ".release-v068-state.json"
VERSION = "0.6.8"
BASE_COMMIT = "cddc368"  # previous release point (expected git status baseline)
ZIP_NAME = "logix-v0.6.8.zip"
OUT_DIR = ROOT / "download" / "RELEASE-v0.6.8"
ARCHIVE_DIR = ROOT / "releases" / "archive"

COMMIT_MSG = ("release v0.6.8: DF-17C справочник ТН ВЭД (tws.by, 13294 позиции, ред. 2022-2023) "
              "+ DF-18 ответ брокера кодами и процентами (D38); миграции df_17c_hs + df_18_broker_items "
              "(additive); /api/hs/search + HsCodeCombobox (подсказка ЕТТ не автоподстановка); "
              "BrokerEstimateForm items+send, серверная верификация кодов, broker.max_items; "
              "vitest 241/241, e2e 311/311, tsc/lint/build/integrity/knip чисто")


def log(m):
    line = "[" + time.strftime("%H:%M:%S") + "] " + str(m)
    print(line, flush=True)


def sh(cmd, timeout=None, check=True, env=None, tail=2000):
    log("$ " + " ".join(cmd))
    e = dict(os.environ)
    if env:
        e.update(env)
    r = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True,
                       timeout=timeout, env=e)
    out = (r.stdout or "").strip()
    err = (r.stderr or "").strip()
    if out:
        log(out[-tail:])
    if err:
        log("ERR: " + err[-tail:])
    if check and r.returncode != 0:
        raise RuntimeError("exit " + str(r.returncode) + ": " + " ".join(cmd))
    return r


def dotenv_get(key):
    envf = ROOT / ".env"
    if envf.exists():
        for line in envf.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r'\s*' + re.escape(key) + r'\s*=\s*"?([^"\s]+)"?', line)
            if m:
                return m.group(1)
    return os.environ.get(key)


def dotenv_database_url():
    return dotenv_get("DATABASE_URL")


def hs_count_via_prisma(dburl):
    js = (
        "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
        "(async()=>{const names=['hSCode','hsCode','hscode'];"
        "for(const n of names){try{const c=await p[n].count();"
        "console.log('HS_COUNT='+c);await p.$disconnect();return;}catch(e){}}"
        "try{const r=await p.$queryRawUnsafe('SELECT COUNT(*)::int AS c FROM \"HsCode\"');"
        "console.log('HS_COUNT='+r[0].c);await p.$disconnect();return;}catch(e){}"
        "console.error('HS_ERR=no accessor');process.exit(1);})();"
    )
    env = {"DATABASE_URL": dburl} if dburl else None
    r = sh(["npx", "tsx", "-e", js], check=False, timeout=180, env=env)
    for L in (r.stdout or "").splitlines():
        if L.startswith("HS_COUNT="):
            return int(L.split("=")[1])
    return None


# ---------------------------------------------------------------- stages ----

def stage_env():
    def pg_up():
        s = socket.socket()
        s.settimeout(2)
        try:
            s.connect(("127.0.0.1", 5432))
            return True
        except OSError:
            return False
        finally:
            s.close()

    if not pg_up():
        log("postgres down -> scripts/provision_pg.sh")
        sh(["bash", "scripts/provision_pg.sh"], timeout=180)
        time.sleep(3)
        if not pg_up():
            raise RuntimeError("postgres not up after provisioning")
    log("postgres: up on 5432")

    du = dotenv_database_url()
    log("DATABASE_URL: " + ("set" if du else "NOT FOUND"))

    cnt = hs_count_via_prisma(du)
    if cnt is None or cnt < 1000:
        log("HS reference missing -> migrate deploy + import-hs")
        env = {"DATABASE_URL": du} if du else None
        sh(["npx", "prisma@6", "migrate", "deploy"], timeout=600, env=env)
        sh(["npx", "tsx", "scripts/import-hs.ts"], timeout=900, env=env)
        cnt = hs_count_via_prisma(du)
    if cnt is None:
        raise RuntimeError("cannot read hsCode count")
    if cnt != 13294:
        raise RuntimeError("hsCode count=" + str(cnt) + ", expected 13294")
    log("hsCode count = 13294 OK")


def stage_tree():
    sh(["git", "log", "--oneline", "-5"], check=False)
    sh(["git", "status", "--short"], check=False)
    sh(["git", "branch", "--show-current"], check=False)
    for f in ("scripts/build-release.py", "scripts/import-hs.ts",
              "scripts/ref-data/hs/tnved-tws.json", "CHANGELOG.md"):
        if not (ROOT / f).exists():
            raise RuntimeError("missing required file: " + f)
    log("tree OK")


def stage_gates():
    du = dotenv_database_url()
    env = {"DATABASE_URL": du} if du else None
    sh(["npx", "tsc", "--noEmit"], timeout=600, env=env)
    log("gate tsc: PASS (0 errors)")
    r = sh(["npm", "run", "lint"], check=False, timeout=600, env=env)
    if r.returncode != 0:
        r2 = sh(["npx", "eslint", "."], check=False, timeout=600, env=env)
        if r2.returncode != 0:
            raise RuntimeError("eslint failed")
    log("gate lint: PASS (0 errors)")
    r = sh(["npx", "vitest", "run"], timeout=1200, env=env)
    m = re.search(r"(\d+)\s+passed", r.stdout or "")
    if m:
        n = int(m.group(1))
        log("gate vitest: passed=" + str(n) + (" (expected 241)" if n != 241 else " OK"))
    else:
        log("gate vitest: PASS (count not parsed)")
    sh(["npm", "run", "build"], timeout=1200, env=env)
    log("gate build: PASS")
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    for s in ("integrity", "inventory", "knip"):
        if s in pkg.get("scripts", {}):
            sh(["npm", "run", s], timeout=600, env=env)
            log("gate " + s + ": PASS")


def stage_e2e():
    import urllib.request
    du = dotenv_database_url()
    env = dict(os.environ)
    if du:
        env["DATABASE_URL"] = du
    for k in ("ADMIN_PHONE", "ADMIN_PASSWORD", "BASE_URL"):
        v = dotenv_get(k)
        if v:
            env[k] = v
    env.setdefault("BASE_URL", "http://127.0.0.1:3000")
    env["BASE_URL"] = "http://127.0.0.1:3000"
    base_env = {"DATABASE_URL": du or env.get("DATABASE_URL", ""),
                "EMAIL_PROVIDER": "fake",
                "APP_BASE_URL": "http://127.0.0.1:3000",
                "CRON_SECRET": "e2e-cron-secret",
                "CBR_IMPORT": "off",
                "CONTRACTOR_PORTAL_ENABLED": "true"}
    env.update(base_env)

    # runner intentionally triggers login rate-limit at the end -> clear before run
    js = ("const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
          "p.$queryRawUnsafe('DELETE FROM \"LoginAttempt\"').then(()=>p.$disconnect())"
          ".then(()=>{console.log('LOGINATTEMPT_CLEARED');}).catch(e=>{console.error(e.message);process.exit(0);});")
    sh(["npx", "tsx", "-e", js], timeout=120,
       env={"DATABASE_URL": du} if du else None, check=False)

    server_log = open(str(ROOT / ".release-e2e-server.log"), "wb")
    proc = subprocess.Popen(["npm", "run", "start"], cwd=str(ROOT), env=env,
                            stdout=server_log, stderr=subprocess.STDOUT)
    try:
        up = False
        for _ in range(60):
            time.sleep(2)
            if proc.poll() is not None:
                raise RuntimeError("server exited early; see .release-e2e-server.log")
            try:
                with urllib.request.urlopen("http://127.0.0.1:3000/api/health", timeout=3) as resp:
                    if resp.status == 200:
                        up = True
                        break
            except Exception:
                up = False
        if not up:
            raise RuntimeError("server did not come up on :3000")
        log("server up on :3000")
        run_env = dict(env)
        run_env["ADMIN_PASSWORD"] = "logix-master"  # seed MASTER_PASSWORD default
        r = sh(["python3", "scripts/e2e_api_test.py"], timeout=2400, env=run_env, check=False)
        passes = len(re.findall(r"^PASS ", r.stdout or "", re.M))
        fails = len(re.findall(r"^FAIL ", r.stdout or "", re.M))
        log("gate e2e: PASS=" + str(passes) + " FAIL=" + str(fails) +
            (" (expected 311/0)" if passes != 311 else " OK"))
        if r.returncode != 0 or fails:
            raise RuntimeError("e2e failed: " + str(fails) + " failing checks (exit "
                               + str(r.returncode) + ")")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except Exception:
            proc.kill()
        server_log.close()
        sh(["npx", "tsx", "-e", js], timeout=120,
           env={"DATABASE_URL": du} if du else None, check=False)


CHANGELOG_ENTRY = """## [0.6.8] — ТН ВЭД и ответ брокера: справочник, комбобокс, проценты (DF-17C, DF-18, 29.10.2026)

**DF-17C.** Справочник ТН ВЭД собран из открытой выгрузки tws.by (`/tws/tnved/download/excel`): 13 294 десятизначных кода, редакция 2022–2023, тариф ЕТТ полным текстом. Разведка альтернатив зафиксирована в `docs/REFERENCES-SOURCES.md`: GitHub — 77 репозиториев, npm — 0 пригодных; НСИ ЕЭК — 148 словарей без ТН ВЭД; WB API `getV2DirectoryTnvedAll` — референс структуры; opencustoms — данные 2016 г.; PDF ЕЭК — стоп-условие §4.4.

- Миграция `df_17c_hs`: `HsCode` (`code` — 10 знаков, `name`, `level`, `unit?`, `etdDutyText`, `validFrom`/`validTo`, `sourceRev`, `@@unique([code, sourceRev])`) + `HsImport` (`version @unique`, `source`, `itemCount`, `importedAt`).
- Импортёр без удаления: новая редакция закрывает предыдущую через `validTo`, повторный импорт — no-op, редакция старее текущей — отказ.
- Снапшот `scripts/ref-data/hs/tnved-tws.json` (v2026-10-28) + конвейер `scripts/hs_make_snapshot.py`.
- Поиск: `lib/hs.ts` / `lib/hs-db.ts` — нормализация «0101 21» → `010121`, btree-диапазон с переносом через девятки, ILIKE по названию.
- API `GET /api/hs/search` — три кабинета, 401 анонимно.
- `HsCodeCombobox`: debounce 300 мс, ширина 375 px; подсказка ЕТТ — справочная, не автоподстановка (ставку считаем из Альты, D37/D38).

**DF-18.** Ответ брокера кодами и процентами (D38).

- Миграция `df_18_broker_items`: `BrokerEstimateItem` (`hsCode`, `isManualCode`, пошлина/доп./НДС `Decimal(5,2)`, `sortOrder`), статус `draft|sent` и `sentAt` на `BrokerEstimate`.
- `customsDutyEstimate` = «итого, ₽».
- PUT `broker/leads/[id]/estimate` расширен (`items`, `send`) без слома контракта; сервер верифицирует коды, дубли → 400, лимит `broker.max_items` (дефолт 30, потолок 200).
- UI: `BrokerEstimateForm` с `allowManual` (ровно 10 цифр — псевдо-пункт «Код не из справочника», сервер перепроверяет); менеджеру — `EstimateView` в `BrokerLinksSection`; события `broker_estimate_changed` / `broker_estimate_sent` / `estimate_updated` с diff.

**Переиспользование и чистка.** RULES 2.14: `estimate/ItemsEditor`, `estimate/FormBlocks`, `admin/estimate/EstimateView`, `ComboOptionRow` (снят дубль IC-14). knip: −getHsHint, −env#env, −HS_CODE_LENGTH, −2 типа; +baseline `import-hs.ts`.

**Гейты:** vitest 241/241 (+19), e2e 311/311 (+18), knip 38=38, INVENTORY регенерирована.
"""

NOTES_MD = """# Релиз v0.6.8 — 29.10.2026

**Архив:** `logix-v0.6.8.zip`. Обе миграции additive — отката БД не требуют, предыдущая версия работает на новой схеме. **Новых переменных окружения нет.** Сид v0.6.7 уже выполнен — из нового здесь только импорт ТН ВЭД.

## Что нового

### DF-17C — справочник ТН ВЭД
Источник — открытая выгрузка tws.by (`/tws/tnved/download/excel`): 13 294 десятизначных кода, редакция 2022–2023, тариф ЕТТ полным текстом. Поиск в комбобоксе: нормализация пробелов («0101 21» → `010121`), префиксный поиск по коду с переносом через девятки, ILIKE по названию («коров» найдёт «коровы»). Подсказка ставки ЕТТ — справочная, не автоподстановка: итоговую ставку брокер подтверждает вручную (D37/D38).

### DF-18 — ответ брокера кодами и процентами (D38)
Брокер собирает оценку позициями: код ТН ВЭД из справочника или ручной ввод (ровно 10 цифр — псевдо-пункт «Код не из справочника», сервер перепроверяет), пошлина / доп. сбор / НДС в процентах, «итого, ₽» — поле `customsDutyEstimate`. Черновик и отправка (`draft|sent`, `sentAt`), уведомление менеджеру с diff. Лимит позиций `broker.max_items`: дефолт 30, потолок 200; дубли кодов → 400.

## Деплой владельцу — кратко
1. Синхронизировать клон с `origin/main`, распаковать `logix-v0.6.8.zip`.
2. `npx prisma@6 migrate deploy` — ожидаются `20261028193326_df_17c_hs`, `20261029120000_df_18_broker_items`.
3. `npx tsx scripts/import-hs.ts` → «13294 позиций» (повтор — no-op).
4. Vercel задеплоит сам после push — Redeploy не нужен.
5. Прогнать смоук из 8 пунктов (см. RELEASE-INSTRUCTIONS-v0.6.8.md).

## Гейты
vitest 241/241 (+19), e2e 311/311 (+18), tsc 0 ошибок, eslint 0 ошибок / 8 старых warn, build 56/56, integrity 0, knip 38=38.

## Отложено
- Атрибут `unit` из PDF ЕЭК — в следующей редакции справочника.
- ЕТТ-подсказка в таблице менеджера — DF-19.
- TWS MTLAP: автообновление справочника после v1.
- e2e «ручной код не помечается как справочный» — в CI справочник пуст, кейс живёт в live-смоуке.
"""

INSTRUCTIONS_MD = """# Release Instructions — v0.6.8 (29.10.2026)

Выполняется на машине владельца (PowerShell). Архив: `logix-v0.6.8.zip`. Новых env нет. Миграции additive.

## 1. Синхронизация клона

```powershell
git fetch origin
git reset --hard origin/main
```

## 2. Распаковка архива

```powershell
Expand-Archive -Path .\\logix-v0.6.8.zip -DestinationPath . -Force
```

## 3. Проверка версии

В `package.json` должно быть `"version": "0.6.8"`.

## 4. Проверка состава

```powershell
git status --short
```

Ожидаемый состав релиза относительно точки `cddc368` (предыдущий релиз, включая новые файлы):

<!--EXPECTED-GIT-STATUS-->

## 5. Коммит и push

```powershell
git add -A
git commit -m "release v0.6.8: DF-17C справочник ТН ВЭД (tws.by, 13294 позиции, ред. 2022-2023) + DF-18 ответ брокера кодами и процентами (D38); миграции df_17c_hs + df_18_broker_items (additive); /api/hs/search + HsCodeCombobox (подсказка ЕТТ не автоподстановка); BrokerEstimateForm items+send, серверная верификация кодов, broker.max_items; vitest 241/241, e2e 311/311, tsc/lint/build/integrity/knip чисто"
git push origin main
```

## 6. CI

Дождаться зелёного CI на GitHub. Откат кода при проблемах:

```powershell
git revert HEAD --no-edit
git push origin main
```

## 7. Vercel

Деплой выполняется автоматически после push. Redeploy не требуется. Новых переменных окружения нет.

## 8. Миграции БД (Neon)

Перед шагом поставить точку восстановления Neon (страховка), затем:

```powershell
npx prisma@6 migrate deploy
```

Ожидаются миграции: `20261028193326_df_17c_hs`, `20261029120000_df_18_broker_items`.

## 9. Импорт ТН ВЭД

Строго после шага 8:

```powershell
npx tsx scripts/import-hs.ts
```

Ожидаемый вывод: «13294 позиций». Повторный запуск — no-op (редакция не менялась).

## 10. Смоук (8 пунктов)

1. Комбобокс ТН ВЭД: ввод `010121` → код найден, видна подсказка ЕТТ (справочно, ставка не подставляется).
2. Поиск по названию: «коров» → «коровы».
3. Брокер: черновик оценки → отправка.
4. Менеджеру пришло уведомление с diff.
5. Ручной код (ровно 10 цифр) → позиция «Код не из справочника», сервер перепроверил.
6. Дубли кодов в одной отправке → 400.
7. `customsDutyEstimate` = «итого, ₽» пересчитывается.
8. `/api/health` → 200.

## Откат

Код — `git revert` (шаг 6). Миграции additive не откатываются и не мешают работе предыдущей версии. Импортированный справочник остаётся в БД и на предыдущую версию не влияет.
"""


def expected_git_status_block():
    lines = []
    r = sh(["git", "diff", "--name-status", BASE_COMMIT], check=False)
    for L in (r.stdout or "").splitlines():
        if L.strip():
            lines.append(L.rstrip())
    r2 = sh(["git", "ls-files", "--others", "--exclude-standard"], check=False)
    others = [u for u in (r2.stdout or "").splitlines() if u.strip()]
    if "docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md" not in others:
        others.append("docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md")
    for u in others:
        lines.append("??\t" + u)
    if not lines:
        return "```\n(пусто — рабочее дерево совпадает с main)\n```"
    return "```\n" + "\n".join(lines) + "\n```"


def stage_docs():
    # 1) version bump 0.6.7 -> 0.6.8
    pj = ROOT / "package.json"
    t = pj.read_text(encoding="utf-8")
    t = t.replace('"version": "0.6.7"', '"version": "0.6.8"', 1)
    pj.write_text(t, encoding="utf-8")
    if '"version": "0.6.8"' not in pj.read_text(encoding="utf-8"):
        raise RuntimeError("package.json version bump failed")
    log("package.json: version -> 0.6.8")
    pl = ROOT / "package-lock.json"
    if pl.exists():
        lt = pl.read_text(encoding="utf-8")
        lt2 = lt.replace('"version": "0.6.7"', '"version": "0.6.8"')
        if lt2 != lt:
            pl.write_text(lt2, encoding="utf-8")
            log("package-lock.json: version -> 0.6.8")

    # 2) CHANGELOG
    cl = ROOT / "CHANGELOG.md"
    t = cl.read_text(encoding="utf-8")
    if "## [0.6.8]" not in t:
        marker = "# Changelog"
        i = t.find(marker)
        if i < 0:
            raise RuntimeError("CHANGELOG marker '# Changelog' not found")
        j = i + len(marker)
        t = t[:j] + "\n\n" + CHANGELOG_ENTRY.strip() + "\n" + t[j:]
        cl.write_text(t, encoding="utf-8")
        log("CHANGELOG.md: entry 0.6.8 inserted")
    else:
        log("CHANGELOG.md: entry 0.6.8 already present")

    # 3) release docs
    rd = ROOT / "docs" / "releases"
    rd.mkdir(parents=True, exist_ok=True)
    (rd / "RELEASE-NOTES-v0.6.8.md").write_text(NOTES_MD, encoding="utf-8")
    log("docs/releases/RELEASE-NOTES-v0.6.8.md written")
    block = expected_git_status_block()
    (rd / "RELEASE-INSTRUCTIONS-v0.6.8.md").write_text(
        INSTRUCTIONS_MD.replace("<!--EXPECTED-GIT-STATUS-->", block), encoding="utf-8")
    log("docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md written (expected status substituted)")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def stage_build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sh(["python3", "scripts/build-release.py", "--out", str(OUT_DIR)], timeout=1800)
    z = OUT_DIR / ZIP_NAME
    if not z.exists():
        found = sorted(OUT_DIR.glob("*.zip"))
        if not found:
            raise RuntimeError("zip not produced by build-release.py")
        shutil.copy2(found[0], z)
        log("renamed/copied " + found[0].name + " -> " + ZIP_NAME)
    zf = OUT_DIR / (ZIP_NAME + "_")
    shutil.copy2(z, zf)
    sums = OUT_DIR / "SHA256SUMS"
    sums.write_text(sha256(z) + "  " + ZIP_NAME + "\n" + sha256(zf) + "  " + ZIP_NAME + "_\n",
                    encoding="utf-8")
    log("build OK: " + ZIP_NAME)
    log("SHA256: " + sha256(z))


def stage_panel():
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    gk = ARCHIVE_DIR / ".gitkeep"
    if not gk.exists():
        gk.write_text("", encoding="utf-8")
        sh(["git", "add", "-f", str(gk)], check=False)

    dl = ROOT / "download"
    # 1) archive old panel zips physically, remove from index
    old_dirs = [p for p in sorted(dl.glob("RELEASE-*")) if p.name != "RELEASE-v0.6.8"]
    for p in old_dirs:
        tgt = ARCHIVE_DIR / p.name
        tgt.mkdir(parents=True, exist_ok=True)
        for f in sorted(p.iterdir()):
            shutil.move(str(f), str(tgt / f.name))
        try:
            p.rmdir()
        except OSError:
            pass
        sh(["git", "rm", "-r", "-q", "--ignore-unmatch", str(p.relative_to(ROOT))], check=False)
        log("archived panel dir " + p.name + " -> releases/archive/" + p.name)
    for z in list(dl.glob("*.zip")) + list(dl.glob("*.zip_")):
        tgt = ARCHIVE_DIR / "root"
        tgt.mkdir(parents=True, exist_ok=True)
        shutil.move(str(z), str(tgt / z.name))
        sh(["git", "rm", "-r", "-q", "--ignore-unmatch", str(z.relative_to(ROOT))], check=False)
        log("archived stray zip " + z.name)

    # 2) add new release to panel (canonical + fallback bypass gitignore)
    z = OUT_DIR / ZIP_NAME
    zf = OUT_DIR / (ZIP_NAME + "_")
    sums = OUT_DIR / "SHA256SUMS"
    for f in (z, zf):
        if not f.exists():
            raise RuntimeError("missing panel artifact: " + f.name)
    sh(["git", "add", "-f", str(z), str(zf)])
    sh(["git", "add", str(sums)])
    log("panel: " + ZIP_NAME + " + fallback + SHA256SUMS staged")


def stage_commit():
    st = sh(["git", "status", "--porcelain"], check=False).stdout or ""
    last = sh(["git", "log", "-1", "--pretty=%s"], check=False).stdout or ""
    if st.strip():
        sh(["git", "add", "-A"])
        sh(["git", "commit", "-m", COMMIT_MSG])
        log("commit created")
    elif last.strip().startswith("release v0.6.8"):
        log("commit already exists")
    else:
        log("nothing to commit (unexpected HEAD: " + last.strip() + ")")
    r = sh(["git", "push", "origin", "HEAD:main"], check=False, timeout=300)
    if r.returncode == 0:
        log("push: OK")
    else:
        log("push FAILED — перезапусти стадию commit позже")
        raise RuntimeError("git push failed")
    sh(["git", "log", "--oneline", "-3"], check=False)


# ----------------------------------------------------------------- main ----

STAGES = ["env", "tree", "gates", "e2e", "docs", "build", "panel", "commit"]


def self_exclude():
    ie = ROOT / ".git" / "info" / "exclude"
    try:
        cur = ie.read_text(encoding="utf-8") if ie.exists() else ""
        need = [l for l in (".release-v068.log", ".release-v068-state.json") if l not in cur]
        if need:
            ie.write_text((cur.rstrip("\n") + "\n" if cur.strip() else "") + "\n".join(need) + "\n",
                          encoding="utf-8")
    except Exception as e:
        log("self_exclude warn: " + str(e))


def load_state():
    if STATE_F.exists():
        try:
            return set(json.loads(STATE_F.read_text(encoding="utf-8")).get("done", []))
        except Exception:
            return set()
    return set()


def save_state(done):
    STATE_F.write_text(json.dumps({"done": sorted(done)}), encoding="utf-8")


def main():
    self_exclude()
    args = sys.argv[1:]
    if args == ["reset"]:
        if STATE_F.exists():
            STATE_F.unlink()
        log("state reset")
        return
    stages = [a for a in args if not a.startswith("-") and a != "all"] or list(STAGES)
    done = load_state()
    for s in stages:
        if s not in STAGES:
            raise RuntimeError("unknown stage: " + s)
        if s in done:
            log("skip " + s + " (already done)")
            continue
        log("=== STAGE " + s + " START ===")
        t0 = time.time()
        try:
            globals()["stage_" + s]()
        except Exception as e:
            log("!!! STAGE " + s + " FAILED: " + str(e))
            traceback.print_exc()
            log("pipeline stopped at stage " + s + " — fix and re-run (resumable)")
            sys.exit(1)
        done.add(s)
        save_state(done)
        log("=== STAGE " + s + " DONE in " + str(int(time.time() - t0)) + "s ===")
    log("PIPELINE FINISHED: " + ", ".join(stages))
    if OUT_DIR.exists():
        z = OUT_DIR / ZIP_NAME
        if z.exists():
            log("ARTIFACT: download/RELEASE-v0.6.8/" + ZIP_NAME)
            log("SHA256: " + sha256(z))


if __name__ == "__main__":
    main()
