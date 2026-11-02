#!/usr/bin/env bash
# run-gates-080.sh — полный релизный конвейер v0.8.0 (RULES 2.16, D12/D13/D14).
# ШАГ 0–11, каждый — с отдельным логом /tmp/g-<step>.log; мастер-лог /tmp/gates-080.log.
# Любой красный шаг останавливает конвейер (финал: «КОНВЕЙЕР УПАЛ НА ШАГЕ N»).
# Запуск агентом: nohup bash scripts/run-gates-080.sh > /tmp/gates-launch.log 2>&1 &
set -uo pipefail
cd /home/z/my-project

LOG=/tmp/gates-080.log
STEP=0
declare -a NAMES=()
declare -a RESULTS=()

say() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

run_step() {
  local n="$1" name="$2" logfile="$3"; shift 3
  say "─── ШАГ $n: $name ───"
  if "$@" > "$logfile" 2>&1; then
    RESULTS+=("OK"); NAMES+=("$name")
    say "ШАГ $n ($name): OK (лог: $logfile)"
    return 0
  fi
  RESULTS+=("FAIL"); NAMES+=("$name")
  say "ШАГ $n ($name): FAIL — хвост лога:"
  tail -15 "$logfile" | tee -a "$LOG"
  say "КОНВЕЙЕР УПАЛ НА ШАГЕ $n ($name)"
  return 1
}

: > "$LOG"
say "=== КОНВЕЙЕР ГЕЙТОВ v0.8.0 (DF-11) ==="

# ШАГ 0: окружение — PG 16.4 под обёрткой .pg/pg_with.sh
say "─── ШАГ 0: окружение (PG, env) ───"
export LD_LIBRARY_PATH="/home/z/my-project/.pg/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
if ! .pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1; then
  .pg/bin/pg_ctl -D .pg/data -l .pg/postgres.log -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" -t 240 start >> "$LOG" 2>&1
fi
sleep 2
DATABASE_URL='postgresql://logix@127.0.0.1:5432/logix?schema=public' bun -e 'import {SQL} from "bun"; const pg = new SQL("postgresql://logix@127.0.0.1:5432/logix"); await pg.unsafe("SELECT 1"); console.log("pg ok")' > /tmp/g-0-env.log 2>&1
if grep -q "pg ok" /tmp/g-0-env.log; then
  RESULTS+=("OK"); NAMES+=("окружение (PG 16.4)")
  say "ШАГ 0: OK"
else
  RESULTS+=("FAIL"); NAMES+=("окружение (PG 16.4)")
  say "ШАГ 0: FAIL"; tail -5 /tmp/g-0-env.log | tee -a "$LOG"
  say "КОНВЕЙЕР УПАЛ НА ШАГЕ 0"; exit 1
fi
export DATABASE_URL='postgresql://logix@127.0.0.1:5432/logix?schema=public'
export MASTER_PHONE="+79000000000" MASTER_PASSWORD="ci-e2e-master-password"
export ADMIN_PHONE="+79000000000" ADMIN_PASSWORD="ci-e2e-master-password"
export CONTRACTOR_PORTAL_ENABLED=true CRON_SECRET=ci-e2e-cron-secret
export EMAIL_PROVIDER=fake APP_BASE_URL=http://127.0.0.1:3200 CBR_IMPORT=off
export TOTP_ENCRYPTION_KEY=ci-e2e-totp-encryption-key

# ШАГ 1: чистая БД (migrate reset + seed)
bunx prisma@6 migrate reset --force >/tmp/g-1-db.log 2>&1 && bunx tsx scripts/seed.ts >>/tmp/g-1-db.log 2>&1 \
  && { RESULTS+=("OK"); NAMES+=("migrate reset + seed"); say "ШАГ 1: OK"; } \
  || { RESULTS+=("FAIL"); NAMES+=("migrate reset + seed"); say "ШАГ 1: FAIL"; tail -10 /tmp/g-1-db.log | tee -a "$LOG"; say "КОНВЕЙЕР УПАЛ НА ШАГЕ 1"; exit 1; }

run_step 2 "prisma validate" /tmp/g-2-validate.log bunx prisma validate
run_step 3 "tsc --noEmit" /tmp/g-tsc.log bunx tsc --noEmit
run_step 4 "lint" /tmp/g-lint.log bun run lint || exit 1
# vitest — БЕЗ e2e-переменных окружения: тест сводки владельца утверждает
# отсутствие ссылки «Открыть Пульс» (APP_BASE_URL не задан — комментарий
# в owner-digest.test.ts); e2e-шаг задаёт его позже, своим скриптом.
run_step 5 "vitest" /tmp/g-vitest.log env -u APP_BASE_URL -u EMAIL_PROVIDER -u CRON_SECRET \
  -u MASTER_PHONE -u MASTER_PASSWORD -u ADMIN_PHONE -u ADMIN_PASSWORD \
  -u CONTRACTOR_PORTAL_ENABLED -u TOTP_ENCRYPTION_KEY -u CBR_IMPORT \
  bunx vitest run || exit 1
run_step 6 "build" /tmp/g-build.log bun run build || exit 1
run_step 7 "knip (храповик)" /tmp/g-knip.log python3 scripts/knip_check.py || exit 1
run_step 8 "integrity (IC-01..IC-17)" /tmp/g-integrity.log python3 scripts/integrity_check.py || exit 1

# ШАГ 9: e2e на чистой БД (свой reset+seed+сервер внутри run-e2e-fix1.sh)
run_step 9 "e2e (530 проверок)" /tmp/e2e-full.log bash scripts/run-e2e-fix1.sh || exit 1

# ШАГ 10: gitleaks (секреты) — если бинарник доступен; в CI обязателен
if command -v gitleaks >/dev/null 2>&1; then
  run_step 10 "gitleaks" /tmp/g-gitleaks.log gitleaks detect --no-git --redact -c .gitleaks.toml || exit 1
else
  RESULTS+=("SKIP"); NAMES+=("gitleaks (в CI)")
  say "ШАГ 10: SKIP (gitleaks в песочнице нет — обязателен в CI)"
fi

# ШАГ 11: сверка чисел охраны с CHANGELOG [0.8.0]
say "─── ШАГ 11: сверка чисел с CHANGELOG ───"
V=$(grep '"version"' package.json | head -1 | sed 's/[^0-9.]*//g')
VIT=$(rg -o "Tests  (\d+) passed" /tmp/g-vitest.log -r '$1' | head -1 || true)
E2E=$(rg -o "^TOTAL (\d+) /" /tmp/e2e-full.log -r '$1' | head -1 || true)
say "версия=$V vitest=${VIT:-?} e2e=${E2E:-?} (ожидалось 0.8.0 / 449 / 530)"
if [ "$V" = "0.8.0" ] && [ "$VIT" = "449" ] && [ "$E2E" = "530" ]; then
  RESULTS+=("OK"); NAMES+=("сверка чисел 0.8.0/449/530")
  say "ШАГ 11: OK"
else
  RESULTS+=("FAIL"); NAMES+=("сверка чисел 0.8.0/449/530")
  say "ШАГ 11: FAIL — числа не сходятся с CHANGELOG [0.8.0]"
  say "КОНВЕЙЕР УПАЛ НА ШАГЕ 11"; exit 1
fi

say "─── ИТОГ ───"
for i in "${!NAMES[@]}"; do say "  ${RESULTS[$i]}  ${NAMES[$i]}"; done
say "КОНВЕЙЕР ЗАВЕРШЁН"
