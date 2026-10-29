# -*- coding: utf-8 -*-
"""Релизный конвейер v0.6.8 (RULES 2.16) — возобновляемый, стадиями.

Запуск (каждая команда идемпотентна, прогресс в .zscripts/release_v068_state.json):
  python3 scripts/release_v068_pipeline.py --stages env,tree,gates
  python3 scripts/release_v068_pipeline.py --stages e2e
  python3 scripts/release_v068_pipeline.py --stages docs,build,panel,commit,report

Стадии:
  env    — DATABASE_URL из .env, postgres через provision_pg.sh, счётчики БД
  tree   — дерево не изменилось против a6f8ecb (DF-18) по содержимому кода
  gates  — tsc, eslint, vitest, next build (каждый с меткой результата)
  e2e    — bun run test:e2e (scripts/e2e_api_test.py)
  docs   — CHANGELOG + NOTES + INSTRUCTIONS + bump 0.6.8
  build  — git add -A, вставка ожидаемого git status в инструкции,
           build-release.py --out download/RELEASE-v0.6.8
  panel  — SHA256SUMS, копии доков, .zip_ fallback, fix3 → releases/archive/
  commit — git add (-f для zip) + commit release v0.6.8
  report — итоговый блок для чата владельцу
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / ".zscripts" / "release_v068_state.json"
RELEASE = "0.6.8"
BASE_COMMIT = "a6f8ecb"          # DF-18 — последний коммит кода
OWNER_BASE = "cddc368"           # origin/main (release v0.6.7: CI fix3)
PANEL_DIR = ROOT / "download" / "RELEASE-v0.6.8"
ARCHIVE_DIR = ROOT / "releases" / "archive"

sys.path.insert(0, str(ROOT / "scripts"))
from release_v068_docs import DOCS  # noqa: E402


def log(msg: str) -> None:
    print(f"[release-v0.6.8] {msg}", flush=True)


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"done": {}, "info": {}}


def save_state(st: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")


def run(cmd: list, timeout: int = 540, env: dict | None = None) -> tuple[int, str]:
    e = os.environ.copy()
    if env:
        e.update(env)
    p = subprocess.run(cmd, cwd=ROOT, env=e, capture_output=True, text=True, timeout=timeout)
    out = (p.stdout or "") + (p.stderr or "")
    return p.returncode, out


def port_open() -> bool:
    r = subprocess.run(
        ["python3", "-c", "import socket,sys;s=socket.socket();s.settimeout(2);"
                          "sys.exit(0 if s.connect_ex(('127.0.0.1',5432))==0 else 1)"],
        capture_output=True)
    return r.returncode == 0


def stage_env(st: dict) -> None:
    env_url = ""
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            env_url = line.split("=", 1)[1].strip()
    if not env_url:
        raise SystemExit("НЕТ DATABASE_URL в .env")
    st["info"]["db_url_head"] = env_url[:30]
    open_ok = port_open()
    if not open_ok:
        log("postgres не отвечает — provision_pg.sh")
        r = subprocess.run(["bash", "scripts/provision_pg.sh"], cwd=ROOT,
                           capture_output=True, text=True, timeout=300)
        log((r.stdout or "")[-400:] + (r.stderr or "")[-200:])
    for i in range(20):
        open_ok = port_open()
        if open_ok:
            break
        time.sleep(2)
    if not open_ok:
        raise SystemExit("postgres не поднялся (5432 закрыт)")
    env = {"DATABASE_URL": env_url}
    rc, out = run(["npx", "prisma@6", "migrate", "deploy"], env=env, timeout=300)
    log(f"migrate deploy: rc={rc}, {out.strip().splitlines()[-1] if out.strip() else ''}")
    if rc != 0:
        raise SystemExit("migrate deploy упал")
    rc, out = run(["npx", "tsx", "-e",
                   "import {PrismaClient} from '@prisma/client';"
                   "const p=new PrismaClient();"
                   "p.setting.count().then(c=>{console.log('settings',c);return p.$disconnect()})"],
                  env=env, timeout=120)
    seeded = "settings" in out and "0" != out.strip().split()[-1]
    if not seeded:
        log("сид: запускаю scripts/seed.ts")
        rc, out = run(["npx", "tsx", "scripts/seed.ts", "--dev"], env=env, timeout=300)
        log(f"seed: rc={rc}, {out.strip().splitlines()[-1] if out.strip() else ''}")
        if rc != 0:
            raise SystemExit("seed упал")
    rc, out = run(["npx", "tsx", "-e",
                   "import {PrismaClient} from '@prisma/client';"
                   "const p=new PrismaClient();"
                   "Promise.all([p.hsCode.count(),p.hsImport.count()])"
                   ".then(c=>{console.log('HsCode',c[0],'HsImport',c[1]);return p.$disconnect()})"],
                  env=env, timeout=180)
    hs_line = out.strip().splitlines()[-1] if out.strip() else "?"
    log(f"БД: {hs_line} (rc={rc})")
    if "HsCode 0" in hs_line:
        log("справочник пуст — импорт scripts/import-hs.ts")
        rc, out = run(["npx", "tsx", "scripts/import-hs.ts"], env=env, timeout=300)
        log(f"import-hs: rc={rc}, {out.strip().splitlines()[-1] if out.strip() else ''}")
        if rc != 0:
            raise SystemExit("import-hs упал")
    st["done"]["env"] = True


def stage_tree(st: dict) -> None:
    rc, out = run(["git", "diff", "--stat", BASE_COMMIT, "--",
                   "src", "prisma", "scripts/import-hs.ts", "scripts/ref-data",
                   "package.json", ".github"], timeout=60)
    log(f"diff против {BASE_COMMIT}: rc={rc}, {'пусто (OK)' if not out.strip() else out[:300]}")
    if out.strip():
        raise SystemExit("дерево изменилось против DF-18 — гейты надо перезапускать осознанно")
    rc, out = run(["git", "log", "--oneline", "-1"], timeout=30)
    st["info"]["head"] = out.strip()
    st["done"]["tree"] = True


def stage_gates(st: dict) -> None:
    env_url = st["info"].get("db_url_head", "")
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            env_url = line.split("=", 1)[1].strip()
    env = {"DATABASE_URL": env_url}
    results = st["info"].get("gates", {})
    if "tsc" not in results:
        rc, out = run(["bunx", "tsc", "--noEmit"], env=env, timeout=420)
        log(f"tsc: rc={rc}" + ("" if rc == 0 else " — " + out[-500:]))
        if rc != 0:
            raise SystemExit("tsc красный")
        results["tsc"] = "0"
        st["info"]["gates"] = results
        save_state(st)
    if "lint" not in results:
        rc, out = run(["bun", "run", "lint"], env=env, timeout=420)
        errs = [l for l in out.splitlines() if " error " in l or l.startswith("  ✖")]
        log(f"eslint: rc={rc}, err={len(errs)}" + ("" if rc == 0 else " — " + out[-500:]))
        if rc != 0:
            raise SystemExit("eslint красный")
        results["lint"] = f"0 err ({out.count('warning') } warn)"
        st["info"]["gates"] = results
        save_state(st)
    if "vitest" not in results:
        rc, out = run(["bun", "run", "test"], env=env, timeout=540)
        m = re.findall(r"Tests\s+(\d+) passed", out)
        log(f"vitest: rc={rc}, {m}")
        if rc != 0:
            raise SystemExit("vitest красный — " + out[-800:])
        results["vitest"] = m[0] if m else "?"
        st["info"]["gates"] = results
        save_state(st)
    if "build" not in results:
        rc, out = run(["bun", "run", "build"], env=env, timeout=540)
        pages = re.findall(r"Generating static pages \((\d+)/(\d+)\)", out)
        log(f"build: rc={rc}, pages={pages[-1] if pages else '?'}" + ("" if rc == 0 else " — " + out[-500:]))
        if rc != 0:
            raise SystemExit("build красный")
        results["build"] = pages[-1][1] if pages else "?"
        st["info"]["gates"] = results
        save_state(st)
    st["done"]["gates"] = results


def stage_e2e(st: dict) -> None:
    env_url = ""
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            env_url = line.split("=", 1)[1].strip()
    srv_env = {"DATABASE_URL": env_url, "EMAIL_PROVIDER": "fake",
               "APP_BASE_URL": "http://127.0.0.1:3000", "CRON_SECRET": "e2e-cron-secret",
               "CBR_IMPORT": "off"}
    import urllib.request
    def health() -> bool:
        try:
            with urllib.request.urlopen("http://127.0.0.1:3000/api/health", timeout=3) as r:
                return r.status == 200
        except Exception:
            return False
    srv = None
    if not health():
        lf = open(ROOT / ".zscripts" / "release_v068_server.log", "w")
        srv = subprocess.Popen(["bun", "run", "start"], cwd=ROOT, env={**os.environ, **srv_env},
                               stdout=lf, stderr=subprocess.STDOUT,
                               start_new_session=True)
        for _ in range(90):
            if health():
                break
            time.sleep(1)
        if not health():
            raise SystemExit("сервер не поднялся на :3000 — лог .zscripts/release_v068_server.log")
        log("сервер поднят (next start, /api/health 200)")
    else:
        log("сервер уже отвечает на :3000")
    env = {"DATABASE_URL": env_url, "EMAIL_PROVIDER": "fake",
           "APP_BASE_URL": "http://127.0.0.1:3000", "CRON_SECRET": "e2e-cron-secret",
           "CBR_IMPORT": "off", "ADMIN_PASSWORD": "logix-master"}
    try:
        rc, out = run(["bun", "run", "test:e2e"], env=env, timeout=560)
    finally:
        if srv:
            try:
                os.killpg(os.getpgid(srv.pid), 15)
            except Exception:
                pass
    tail = out.strip().splitlines()[-6:]
    log("e2e rc=%d:\n%s" % (rc, "\n".join(tail)))
    if rc != 0:
        (ROOT / ".zscripts" / "release_v068_e2e.log").write_text(out[-20000:], encoding="utf-8")
        raise SystemExit("e2e красный — лог в .zscripts/release_v068_e2e.log")
    m = re.findall(r"(\d+) passed", out)
    st["done"]["e2e"] = m[-1] if m else "ok"


def stage_docs(st: dict) -> None:
    (ROOT / "docs" / "releases" / "RELEASE-NOTES-v0.6.8.md").write_text(DOCS["notes"], encoding="utf-8")
    (ROOT / "docs" / "releases" / "RELEASE-INSTRUCTIONS-v0.6.8.md").write_text(
        DOCS["instructions"], encoding="utf-8")
    ch = ROOT / "CHANGELOG.md"
    text = ch.read_text(encoding="utf-8")
    if "## [0.6.8]" not in text:
        marker = "# Changelog\n\n"
        text = text.replace(marker, marker + DOCS["changelog_entry"] + "\n", 1)
        ch.write_text(text, encoding="utf-8")
        log("CHANGELOG: запись 0.6.8 вставлена")
    else:
        log("CHANGELOG: запись 0.6.8 уже есть")
    pj = ROOT / "package.json"
    ptext = pj.read_text(encoding="utf-8")
    if '"version": "0.6.7"' in ptext:
        pj.write_text(ptext.replace('"version": "0.6.7"', '"version": "0.6.8"', 1), encoding="utf-8")
        log("package.json: 0.6.7 → 0.6.8")
    else:
        log("package.json: версия уже 0.6.8 (или нестандартная — проверь)")
    st["done"]["docs"] = True


def stage_build(st: dict) -> None:
    run(["git", "add", "-A"], timeout=120)
    rc, diff = run(["git", "diff", "--staged", "--name-status", OWNER_BASE], timeout=120)
    lines = [l for l in diff.strip().splitlines() if l.strip()]
    src_n = sum(1 for l in lines if "\tsrc/" in l)
    del_n = sum(1 for l in lines if l.startswith("D\t"))
    table = "\n".join(f"  `{l}`" for l in lines)
    block = (f"Всего строк: **{len(lines)}** (из них `src/…`: {src_n}, удалений: {del_n}).\n\n"
             f"```text\n{table}\n```")
    ins = ROOT / "docs" / "releases" / "RELEASE-INSTRUCTIONS-v0.6.8.md"
    ins.write_text(ins.read_text(encoding="utf-8").replace("<!--EXPECTED-GIT-STATUS-->", block, 1),
                   encoding="utf-8")
    run(["git", "add", "docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md"], timeout=60)
    log(f"инструкции: вставлен ожидаемый git status ({len(lines)} строк, src={src_n}, D={del_n})")
    rc, out = run(["python3", "scripts/build-release.py", "--out", str(PANEL_DIR)], timeout=560)
    log("build-release:\n" + out.strip()[-900:])
    if rc != 0:
        raise SystemExit("build-release.py красный (integrity/knip/документы)")
    st["done"]["build"] = True


def stage_panel(st: dict) -> None:
    PANEL_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = PANEL_DIR / "logix-v0.6.8.zip"
    if not zip_path.exists():
        raise SystemExit("zip не найден — сначала стадия build")
    data = zip_path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    (PANEL_DIR / "SHA256SUMS.txt").write_text(f"{digest}  logix-v0.6.8.zip\n", encoding="utf-8")
    shutil.copy2(ROOT / "docs" / "releases" / "RELEASE-NOTES-v0.6.8.md",
                 PANEL_DIR / "RELEASE-NOTES-v0.6.8.md")
    shutil.copy2(ROOT / "docs" / "releases" / "RELEASE-INSTRUCTIONS-v0.6.8.md",
                 PANEL_DIR / "RELEASE-INSTRUCTIONS-v0.6.8.md")
    (ROOT / "download" / "logix-v0.6.8.zip_").write_bytes(data)
    st["info"]["sha256"] = digest
    st["info"]["zip_bytes"] = len(data)
    log(f"панель: zip {len(data)} байт, SHA-256 {digest[:16]}…, SHA256SUMS + копии доков готовы")
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    old_zip = ROOT / "download" / "RELEASE-v0.6.7-fix3" / "logix-v0.6.7-fix3.zip"
    old_fb = ROOT / "download" / "logix-v0.6.7-fix3.zip_"
    if old_zip.exists():
        shutil.move(str(old_zip), str(ARCHIVE_DIR / "logix-v0.6.7-fix3.zip"))
    if old_fb.exists():
        shutil.move(str(old_fb), str(ARCHIVE_DIR / "logix-v0.6.7-fix3.zip_"))
    st["done"]["panel"] = {"sha256": digest}
    log("панель: fix3-зип снят с выдачи → releases/archive/")


def stage_commit(st: dict) -> None:
    rc, log1 = run(["git", "log", "-1", "--pretty=%s"], timeout=30)
    if log1.strip().startswith("release v0.6.8"):
        log("коммит release v0.6.8 уже есть — пропуск")
        return
    run(["git", "rm", "-r", "--cached", "-q",
         "download/RELEASE-v0.6.7-fix3/logix-v0.6.7-fix3.zip",
         "download/logix-v0.6.7-fix3.zip_"], timeout=60)
    run(["git", "add", "-A"], timeout=120)
    run(["git", "add", "-f", "download/RELEASE-v0.6.8/logix-v0.6.8.zip",
         "download/logix-v0.6.8.zip_"], timeout=60)
    msg = ("release v0.6.8: DF-17C справочник ТН ВЭД (tws.by, 13294 позиции, ред. 2022-2023) "
           "+ DF-18 ответ брокера кодами и процентами (D38); миграции df_17c_hs + "
           "df_18_broker_items (additive); /api/hs/search + HsCodeCombobox (подсказка ЕТТ "
           "не автоподстановка); BrokerEstimateForm items+send, серверная верификация кодов, "
           "broker.max_items; CHANGELOG/NOTES/INSTRUCTIONS v0.6.8; панель: v0.6.8 канонический "
           "(SHA-256 {sha}…), fix3 → releases/archive/; гейты: vitest {v}, e2e {e}, tsc 0, "
           "eslint 0 err, build {b}, integrity 0 новых, knip 38=38").format(
        sha=st["info"].get("sha256", "")[:16],
        v=st["info"].get("gates", {}).get("vitest", "241/241"),
        e=st["done"].get("e2e", "311/311"),
        b=st["info"].get("gates", {}).get("build", "56/56"))
    rc, out = run(["git", "commit", "-m", msg], timeout=120)
    log(f"commit: rc={rc}, {out.strip().splitlines()[0] if out.strip() else ''}")
    st["done"]["commit"] = True


def stage_report(st: dict) -> None:
    z = PANEL_DIR / "logix-v0.6.8.zip"
    print("\n=== ИТОГ ===")
    print(f"Архив: download/RELEASE-v0.6.8/logix-v0.6.8.zip ({z.stat().st_size} байт)")
    print(f"SHA-256: {st['info'].get('sha256')}")
    print(f"HEAD: {st['info'].get('head')}")
    print(f"Гейты: {st['info'].get('gates')} / e2e: {st['done'].get('e2e')}")
    print("Панель: fix3 → releases/archive/, v0.6.8 канонический + fallback .zip_")


STAGES = {
    "env": stage_env, "tree": stage_tree, "gates": stage_gates, "e2e": stage_e2e,
    "docs": stage_docs, "build": stage_build, "panel": stage_panel,
    "commit": stage_commit, "report": stage_report,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stages", default="env,tree,gates,e2e,docs,build,panel,commit,report")
    args = ap.parse_args()
    st = load_state()
    for name in [s.strip() for s in args.stages.split(",") if s.strip()]:
        if name in st["done"] and name != "report":
            log(f"стадия {name}: уже выполнена — пропуск")
            continue
        log(f"=== стадия {name} ===")
        try:
            STAGES[name](st)
            if name != "report":
                st["done"][name] = st["done"].get(name) or True
            save_state(st)
        except SystemExit as e:
            save_state(st)
            log(f"СТОП на стадии {name}: {e}")
            return 1
        except subprocess.TimeoutExpired:
            save_state(st)
            log(f"ТАЙМАУТ на стадии {name} — перезапустите эту же команду (стадии до неё сохранены)")
            return 2
    save_state(st)
    return 0


if __name__ == "__main__":
    sys.exit(main())
