#!/usr/bin/env bash
# Генератор инструкции CI-фикса v0.8.6 (удаление 42 пропущенных файлов).
set -euo pipefail
SRC=/home/z/my-project/download/logix-v0.8.6-CI-FIX/delete-list-v0.8.6.txt
OUT=/home/z/my-project/download/logix-v0.8.6-CI-FIX/CI-FIX-INSTRUCTIONS-v1.0.md

# массив PowerShell: 'путь',
ARR=$(awk '{printf "  \x27%s\x27,\n", $1}' "$SRC" | sed '$ s/,$//')

cat > "$OUT" <<HEADER
# LOGIX — CI-фикс v0.8.6 (добавление 1 к RELEASE-INSTRUCTIONS v0.8.6)

**Дата:** 2026-11-07 · **Основание:** CI run 42273621357 (push 32b7fac, main) · **Версия:** 1.0

---

## 1. Диагноз

| Параметр | Значение |
|---|---|
| Упавший прогон | CI, push \`release v0.8.6\`, коммит \`32b7fac\` в \`main\` (06.11 18:45 UTC) |
| Упавшая job | \`validate · tsc · lint · build\`, шаг **10. TypeScript (tsc)** — exit code 2 |
| Ошибки tsc | 5 штук, все в одном файле \`src/components/documents/DocumentsPackageSection.tsx\` (строки 15, 29, 94, 193, 234) |
| Остальные jobs | \`gitleaks\` — успех; \`e2e API\` и \`integrity (IC/knip)\` — пропущены (зависят от validate) |

**Характер ошибок:** строка 15 — \`DOCUMENT_KIND_GROUPS\` не экспортируется из \`@/lib/document-constants\`; строка 29 — \`PackageSlotUi\` не экспортируется из \`./parts/types\`; строки 94/193/234 — каскадные implicit-any (следствие первых двух).

**Причина (корень):** при вставке пакета v0.8.6 в репозиторий был пропущен шаг удаления из RELEASE-INSTRUCTIONS (дельта **D 42**). В пуше \`32b7fac\` осталось **ровно 42 устаревших файла** финального состояния; один из них — осиротевший \`DocumentsPackageSection.tsx\` (никем не используется, ссылается на символы, удалённые при чистке экспортов knip) — он один и валит tsc.

**Проверено сверкой деревьев** (пуш \`32b7fac\` vs эталон финала \`5b9ecca\`):

- контентных расхождений в \`src/\`, \`prisma/\`, конфигах — **0** (код пакета вставлен корректно);
- все прочие ~750 различий — **только права файлов** (mode 100755→100644), артефакт распаковки zip на Windows, на сборку не влияет;
- \`tsc --noEmit\` на эталонном дереве (тождественно дереву после удаления этих 42 файлов) — **0 ошибок**.

## 2. SQL на NEON — НЕ требуется

Правки только файловые: схема БД не меняется, миграции и сид в CI уже прошли (шаги 6–9 — success). Никаких действий в SQL Editor не нужно.

## 3. Исправление — вставить в PowerShell ЦЕЛИКОМ

Выполнять в репозитории, откуда делался пуш (там, где сейчас коммит \`32b7fa\`).

\`\`\`powershell
# ── LOGIX v0.8.6 CI-фикс: применить пропущенный шаг D 42 ──────────────
cd <ПУТЬ-К-РЕПО-LOGIX>            # папка, откуда пушили 32b7fac

git rev-parse --short HEAD         # должно быть: 32b7fa
git status --short                 # должно быть ПУСТО; если нет — остановитесь

# отключить шум по правам файлов (артефакт распаковки zip на Windows)
git config core.fileMode false

\$files = @(
HEADER
cat "$SRC" | awk '{printf "%s\n", $0}' | awk '{printf "  \x27%s\x27%s\n", $1, (NR==42?"":",")}' >> "$OUT"
cat >> "$OUT" <<FOOTER
)
git rm -q -- \$files                # удалить все 42 разом

git status --short | Measure-Object -Line   # ожидается: 42 строк "D"

git commit -m "v0.8.6 hotfix: применён пропущенный шаг D 42 из RELEASE-INSTRUCTIONS - удалены 42 устаревших файла (среди них осиротевший DocumentsPackageSection.tsx, валивший CI tsc); fileMode off - шум прав файлов от распаковки zip"

git push origin main               # CI перезапустится автоматически
# ─────────────────────────────────────────────────────────────────────
FOOTER

echo "OK: $OUT"
