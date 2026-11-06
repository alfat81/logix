#!/usr/bin/env bash
# Чистка песочницы 04.11.2026 (после чекпоинта 7a8352d).
# Удаляем: старые релизные архивы, старые версии спецификаций/макетов/ERD,
# разовые скрипты завершённых задач, дубли и мусор.
# ВСЁ удаляемое из репозитория остаётся в git-истории (чекпоинт 7a8352d).
# Сохраняется: актуальный релиз v0.8.5, SPEC/MOCKUPS v1.6, ERD v15,
# скрипты тулчейна v1.6, scripts/ref-data (живые данные), ops-скрипты.
set -euo pipefail
cd /home/z/my-project

echo "== 1. Старые релизные архивы (актуальный logix-v0.8.5 остаётся)"
rm -fv download/logix-v0.8.0.zip_ download/logix-v0.8.3.zip_ download/logix-v0.8.4.zip_
rm -fv download/logix-v0.8.0.sha256 download/logix-v0.8.1.sha256 download/logix-v0.8.2.sha256 \
       download/logix-v0.8.3.sha256 download/logix-v0.8.4.sha256

echo "== 2. Старые версии спецификаций и макетов (актуальные v1.6 остаются)"
rm -fv download/DOC-CENTER-SPEC-v1.md download/DOC-CENTER-SPEC-v1.1.md \
       download/DOC-CENTER-SPEC-v1.2.md download/DOC-CENTER-SPEC-v1.3.md \
       download/DOC-CENTER-SPEC-v1.4.md download/DOC-CENTER-SPEC-v1.5.md
rm -fv download/DOC-CENTER-MOCKUPS-v1.2.md download/DOC-CENTER-MOCKUPS-v1.3.md \
       download/DOC-CENTER-MOCKUPS-v1.5.md

echo "== 3. Старые ERD (актуальная v15 остаётся)"
rm -fv download/mockups/erd-docs-center-v11.html download/mockups/erd-docs-center-v11.png \
       download/mockups/erd-docs-center-v12.html download/mockups/erd-docs-center-v12.png \
       download/mockups/erd-docs-center-v13.html download/mockups/erd-docs-center-v13.png \
       download/mockups/erd-docs-center-v14.html download/mockups/erd-docs-center-v14.png

echo "== 4. Дубли и разовые артефакты"
rm -fv download/sync-1d1e36a.diff
rm -fv download/AUDIT-REPORT-v0.8.5.md download/AUDIT-FIX-PLAN-v0.8.5.md
rm -fv public/assets/aistudio/ROADMAP-DEALFLOW_50c77392.md
rmdir public/assets/aistudio 2>/dev/null || true
rm -rf test-results

echo "== 5. Рудименты scripts/: разовые скрипты завершённых задач"
rm -fv scripts/make_fix1_zip_v068.py scripts/make_fix2_zip.py scripts/make_fix2_zip_v068.py \
       scripts/make_fix3_zip.py scripts/make_fix3_zip_v068.py
rm -fv scripts/verify_v027_commit.py scripts/repair_instructions_v068.py \
       scripts/fix_expected_status_v068.py
rm -fv scripts/release_v068_all.py scripts/release_v068_pipeline.py scripts/release_v068_docs.py
rm -fv scripts/run-gates-080.sh scripts/run-gates-083.sh scripts/verify_release_diff.sh \
       scripts/screenshots_v0_7_11.sh scripts/push_gitleaks_fix.sh
rm -fv scripts/df00c_browser.sh scripts/df02a_smoke5.py scripts/df11_rewrite_routes.py \
       scripts/df11_rewrite_e2e.py scripts/df11_confirm_urls.py
rm -fv scripts/verify_df19_examples.py scripts/d27_terminology.py
rm -fv scripts/p1_22_browser.sh scripts/p1_22_emp_search.sh scripts/p1_23_roadmap.py
rm -fv scripts/measure_erd_v13.py scripts/measure_erd_v14.py scripts/render_erd_v14.py
rm -fv scripts/render_mockups.py scripts/render_mockups_v15.py scripts/verify_mockups_v13.py
rm -fv scripts/prune_baseline_df00d.py scripts/ic14_probe.py scripts/pulse_check.py
rm -fv scripts/slim_leadcard.py scripts/fix_leadcard_aside.py scripts/scope_rebaseline.py \
       scripts/scope_baseline_augment.py scripts/scope_baseline_from_zip.py scripts/test_integrity.py

echo "== 6. Однократные импорт-исходники и аудит-скрипты (данные уже в scripts/ref-data, аудит завершён)"
rm -rf scripts/hs-source scripts/audit

echo "== 7. Старые pasted-скриншоты из upload (материалы владельца по роадмапу остаются)"
rm -fv upload/pasted_image_*.png

echo "== Готово. Текущий git-статус:"
git status --porcelain | head -60
