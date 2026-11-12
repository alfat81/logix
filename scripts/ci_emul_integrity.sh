#!/usr/bin/env bash
# Эмуляция джобы integrity из .github/workflows/ci.yml (IC-12/IC-01..14/knip)
# на чистом клоне ветки: среда = env джобы, БЕЗ .env песочницы.
set -uo pipefail
SHA=$1
rm -rf /tmp/ci-int && git clone -q "${LOGIX_SRC:-/home/z/my-project}" /tmp/ci-int && cd /tmp/ci-int && git checkout -q $SHA
echo "клон: $(git rev-parse --short HEAD)"
export DATABASE_URL='postgresql://logix:logix@127.0.0.1:5432/logix?schema=public'
bun install 2>&1 | tail -1
echo "== INVENTORY.md соответствует коду (IC-12) =="
python3 scripts/inventory.py --check && echo "IC-12 OK"
echo "== Целостность IC-01..IC-14 (храповик) =="
python3 scripts/integrity_check.py | tail -1
echo "== knip (храповик G4) =="
python3 scripts/knip_check.py | tail -1
