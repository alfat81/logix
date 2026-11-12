#!/usr/bin/env bash
# Эмуляция джобы checks из .github/workflows/ci.yml на свежем клоне
# (по умолчанию HEAD ветки tu01/design-system; SHA передаётся аргументом).
# Среда = env джобы дословно, БЕЗ .env песочницы — как на раннере CI.
set -uo pipefail
SHA=${1:-HEAD}
rm -rf /tmp/ci-emul && git clone -q "${LOGIX_SRC:-/home/z/my-project}" /tmp/ci-emul && cd /tmp/ci-emul && git checkout -q $SHA && git rev-parse --short HEAD

export DATABASE_URL='postgresql://logix:logix@127.0.0.1:5432/logix?schema=public'
export MASTER_PHONE='+79000000000'
export MASTER_PASSWORD='ci-e2e-master-password'
# ВАЖНО: никаких других переменных (.env в клоне нет — git не трекает)
# — как на раннере CI.

echo "== bun $(bun --version) | node $(node --version) =="
bun install 2>&1 | tail -1 || exit 1

echo "== prisma validate ==";   bunx prisma validate 2>&1 | tail -1 || exit 1
echo "== prisma generate ==";   bunx prisma generate 2>&1 | tail -1 || exit 1
echo "== prisma migrate deploy =="; bunx prisma migrate deploy 2>&1 | tail -2 || exit 1
echo "== seed ==";              bun run seed 2>&1 | tail -2 || exit 1
echo "== tsc ==";               bunx tsc --noEmit 2>&1 | head -5; echo "tsc exit=$?"
echo "== lint ==";              bun run lint 2>&1 | tail -2; echo "lint exit=$?"
echo "== vitest ==";            bun run test 2>&1 | grep -E "Test Files|Tests |FAIL" | head -12
echo "== build ==";             bun run build 2>&1 | grep -E "Compiled|Error|error" | head -4; echo "build exit=$?"
