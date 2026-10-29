#!/usr/bin/env bash
# Push gitleaks fix onto origin/main (canonical 151978e line).
# Run AFTER the git token in remote URL is refreshed (sandbox push currently 403).
# Idempotent: skips push if fix already on origin.
set -euo pipefail
cd /home/z/my-project

git fetch origin --quiet
if git ls-tree --name-only origin/main .gitleaks.toml | grep -q .; then
  echo "OK: .gitleaks.toml already on origin/main — nothing to do"
  exit 0
fi

git checkout -B pushfix origin/main
# 1) allowlist from the verified local fix commit 99de11a
git checkout 99de11a -- .gitleaks.toml
# 2) redact third-party key on line 49 of the saved tws.by page (as on origin)
python3 - <<'PYEOF'
import re
p = 'scripts/hs-source/ett-page.html'
s = open(p, encoding='utf-8', errors='surrogateescape').read()
lines = s.split('\n')
old = lines[48]
new = re.sub(r"('key'\s*:\s*')([^']*)(')", lambda m: m.group(1)+'[REDACTED]'+m.group(3), old)
if new == old:
    raise SystemExit('WARN: line 49 pattern not matched — aborting, do not commit blind')
lines[48] = new
open(p, 'w', encoding='utf-8', errors='surrogateescape').write('\n'.join(lines))
print('L49 redacted OK')
PYEOF
git add .gitleaks.toml scripts/hs-source/ett-page.html
git commit -m "ci(security): gitleaks allowlist для scripts/hs-source (evidence tws.by) + редакция стороннего ключа в ett-page.html"
git push origin pushfix:main
echo "=== pushed; origin/main tip: ==="
git fetch origin --quiet && git log --oneline -2 origin/main
