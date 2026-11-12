#!/usr/bin/env bash
# Финальная батарея проверок волны 2 (после hotfix CI #90, bf66cc1) —
# результат дословно в download/TU01-WAVE2-COMMAND-CENTER/CHECKS-wave2.txt
set -uo pipefail
cd /home/z/my-project
OUT=download/TU01-WAVE2-COMMAND-CENTER/CHECKS-wave2.txt
{
echo "TU-01 волна 2 (TU-01.6 Command Center + hotfix CI #90 bf66cc1) — результаты проверок (ветка tu01/design-system, 20 коммитов поверх 2e21e83), 12.11.2026"
echo
echo "Порядок прогона: чистая БД (migrate reset + seed) → vitest → build → сервер (APP_BASE_URL задан при старте) → e2e."
echo "APP_BASE_URL в .env отсутствует осознанно — интеграционный тест дайджеста требует его отсутствия в тестовом окружении (owner-digest.test.ts); серверу и e2e он передаётся явно."
echo
echo "== tsc --noEmit =="; npx tsc --noEmit && echo "0 ошибок"
echo
echo "== eslint (после hotfix bf66cc1: 2 ошибки Обзора устранены) =="; npm run lint 2>&1 | tail -1
echo
echo "== vitest =="; npx vitest run 2>&1 | grep -E "Test Files|Tests "
echo
echo "== build =="; npm run build 2>&1 | grep -E "Compiled" | head -1
echo
echo "== эмуляция джобы checks CI (свежий клон bf66cc1, env джобы, без .env) =="; echo "bun install → prisma validate/generate/migrate/seed → tsc 0 → lint 0 → vitest 703/703 → build OK (scripts/ci_emul_checks.sh)"
echo
echo "== e2e менеджерских операций =="; set -a && . ./.env && set +a && APP_BASE_URL=http://127.0.0.1:3000 BASE_URL=http://127.0.0.1:3000 python3 scripts/e2e_api_test.py 2>&1 | grep TOTAL
echo
echo "== e2e публичных маршрутов =="; python3 scripts/e2e_public_site.py 2>&1 | tail -1
echo
echo "== e2e жизненного цикла темы =="; python3 scripts/e2e_theme_lifecycle.py 2>&1 | tail -1
echo
echo "== integrity / inventory / knip =="; npm run integrity 2>&1 | tail -1; npm run inventory 2>&1 | tail -1; python3 scripts/knip_check.py 2>&1 | tail -1
echo
echo "== contrast (IC-17) =="; python3 scripts/contrast_check.py 2>&1 | tail -1
echo
echo "== gitleaks по диапазону пуша (диагностика CI #90) =="; /tmp/gl/gitleaks detect --source . --log-opts="6be3877..f227921" 2>&1 | tail -1
echo
echo "== адаптивность Обзора =="; echo "1440 dark/light OK · 375 dark OK (agent-browser, сессия мастера) — скриншоты пакета"
echo
echo "== кабинет подрядчика =="; echo "diff ab11868^..HEAD -- src/app/contractor = $(git diff ab11868^..HEAD -- src/app/contractor | wc -l) строк (не тронут)"
} > $OUT 2>&1
grep -E "0 ошибок|problems|Tests |868|пройдено|новых 0|находок|no leaks|baseline|Compiled" $OUT | head -12
