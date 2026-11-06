# RELEASE-INSTRUCTIONS v0.8.6 — DF-14 «Чек-листы документов по этапам» + DF-26 волна 1 «Реестр документов» (06.11.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.8.5 (на проде). В релизе: **миграция `20261103120000_df_14_stage_doc_requirements` (additive: новая таблица `StageDocumentRequirement` + 4 строки-дефолта, удалений и правок существующих колонок нет)**; env-переменных и новых зависимостей НЕТ (fflate уже в 0.8.5) — Redeploy вручную не нужен. Prisma Client с новой моделью Vercel генерирует при сборке автоматически, на вашей машине ничего ставить не нужно. Порядок: синхронизация клона → sha256 → распаковка + гигиена → КТ1/КТ2 → пуш/CI → Vercel → миграция (протокол А) → контроль в NEON SQL Editor → smoke по ролям.

Статус по лестнице §6.1: пакет передан по запросу владельца (D60); приёмка гейта 1 DF-26 и production deployment — раздельные команды владельца, выполнение инструкции — ваше собственное действие.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` — v0.8.5 (коммит `7232d8c`).

## Шаг 1. Проверка sha256 архива (КТ2a)

Архив приходит с суффиксом `_` (защита от платформенного фильтра zip). Рядом лежит `logix-v0.8.6.sha256` — сверка целостности ДО распаковки:

```powershell
Get-FileHash .\logix-v0.8.6.zip_ -Algorithm SHA256 | Format-List
Get-Content .\logix-v0.8.6.sha256
```

Хеш из первой строки вывода обязан совпасть со значением в файле (формат `sha256: …`). Не совпало — стоп, чат агенту (файл побился при передаче, перезалив).

## Шаг 2. Распаковка

```powershell
Rename-Item .\logix-v0.8.6.zip_ logix-v0.8.6.zip
Expand-Archive -Path .\logix-v0.8.6.zip -DestinationPath . -Force
```

## Шаг 3. Гигиена: удалить 42 файла, исключённых из проекта

`Expand-Archive` не удаляет файлы, которых нет в архиве. Из состава v0.8.6 убраны одноразовые скрипты песочницы (чистка 04.11) и заменённый компонент пакета — без этого шага они останутся в клоне и КТ2 не сойдётся. Скопируйте блок целиком:

```powershell
$stale = @(
  'public/assets/aistudio/ROADMAP-DEALFLOW_50c77392.md',
  'scripts/d27_terminology.py','scripts/df00c_browser.sh','scripts/df02a_smoke5.py',
  'scripts/df11_confirm_urls.py','scripts/df11_rewrite_e2e.py','scripts/df11_rewrite_routes.py',
  'scripts/fix_expected_status_v068.py','scripts/fix_leadcard_aside.py',
  'scripts/hs-source/ett-page.html','scripts/hs-source/group01.pdf','scripts/hs-source/group01.txt',
  'scripts/hs-source/nsi-dictionaries.json','scripts/ic14_probe.py','scripts/make_fix1_zip_v068.py',
  'scripts/make_fix2_zip.py','scripts/make_fix2_zip_v068.py','scripts/make_fix3_zip.py',
  'scripts/make_fix3_zip_v068.py','scripts/p1_22_browser.sh','scripts/p1_22_emp_search.sh',
  'scripts/p1_23_roadmap.py','scripts/prune_baseline_df00d.py','scripts/pulse_check.py',
  'scripts/push_gitleaks_fix.sh','scripts/release_v068_all.py','scripts/release_v068_docs.py',
  'scripts/release_v068_pipeline.py','scripts/repair_instructions_v068.py','scripts/run-gates-080.sh',
  'scripts/run-gates-083.sh','scripts/scope_baseline_augment.py','scripts/scope_baseline_from_zip.py',
  'scripts/scope_rebaseline.py','scripts/screenshots_v0_7_11.sh','scripts/slim_leadcard.py',
  'scripts/test_integrity.py','scripts/verify_df19_examples.py','scripts/verify_release_diff.sh',
  'scripts/verify_v027_commit.py','src/components/documents/DocumentsPackageSection.tsx',
  'test-results/.last-run.json'
)
$stale | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Force } }
$stale | ForEach-Object { if (Test-Path $_) { Write-Host "ОСТАЛСЯ: $_" } }
Write-Host "Гигиена: удаление завершено"
```

Вывод `ОСТАЛСЯ: …` — стоп, чат агенту. Отдельно: если `git status` после распаковки покажет удаления файлов, которых нет в списке выше — чат агенту, ничего не удалять самому.

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.8.6"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
git status --short | Group-Object { $_[0] } | Select-Object Name, Count
```

Ориентир: **M 54, D 42, ?? 79** (±1–2 за счёт ваших локальных артефактов). Расхождение по НАЛИЧИЮ строк `src/…` или `prisma/…` — стоп, чат агенту. Ключевые позиции: **новые** — `prisma/migrations/20261103120000_df_14_stage_doc_requirements/migration.sql`, `src/lib/document-phases.ts` (+тест), `src/lib/document-summary.ts` (+тест), `src/lib/document-zip-{plan,server,client}.ts` (+тест плана), `src/lib/stage-doc-requirements{,-server}.ts` (+тест), `src/lib/override-guard.ts`, `src/components/documents/DocumentsRegistrySection.tsx`, `DocumentsSummaryPart.tsx`, части `Registry*`/`ZipScopeConfirmDialog`, `src/components/admin/stagecatalog/{StageRequirementsDialog,ProviderSelect}.tsx`, роуты `stage-catalog/requirements`, `documents/[id]/status` ×3, `api/admin/orders/[id]/stages/[stageId]`, `docs/releases/RELEASE-{NOTES,INSTRUCTIONS}-v0.8.6.md`, `SCOPE-v0.8.6.json`, `docs/MASTER-ROADMAP.md`, `docs/audit/*`; **правки** — `prisma/schema.prisma`, `scripts/seed.ts`, `src/lib/document-constants.ts`, `document-{upload,package,package-server,lifecycle,constants}.ts`, `event-registry.ts`, `order-counts.ts`, `waiting*.ts`, `status-machine.ts`, `activity.ts`, `pulse*.ts`, `document-versions/[id]/file/route.ts`, zip-роуты ×3, карточки трёх кабинетов, `OrderSidePanel.tsx`, `page.tsx` заявки, `parts/Registry{Header,PermitRow}.tsx` (чистка неиспользуемых экспортов), `scripts/knip-baseline.json`, `scripts/integrity-baseline.json`, `CHANGELOG.md`, `package.json`, `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`, `docs/DECISIONS.md`, `docs/INVENTORY.md`; **удаления** — ровно 42 файла из блока шага 3.

## Шаг 4. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.8.6: DF-14 чек-листы обязательных документов по этапам + DF-26 волна 1 «Единый центр документов — реестр» — df_14_stage_doc_requirements additive (StageDocumentRequirement: stageCode+kind уникально, providedBy, isBlocking; дефолты таможни импорта/экспорта — ДТ и разрешительный от брокера, «рекомендуется» по O-5; сид idempotent без перезаписи isBlocking), управление чек-листом в справочнике этапов, гард завершения этапа и P1-05 через override-guard (мастер + комментарий в журнал); DF-26 волна 1: DocumentsRegistrySection на три кабинета (чипы, фазы-аккордеон со счётчиками, сводка панели), строки разрешительных требований фазы 07, единая форма загрузки по требованию (permitRequirementId — 404/409 fail-fast), ZIP all/selected с подтверждением и точными счётчиками, фикс гонки К-1 (удаление при сборке ZIP — без 500), события document_link_issued/document_downloaded, мобильная адаптация 375 (цели ≥44), уход PermitsSection со страниц заявок; документация: мастер-роадмап D54, консолидация v1.2 (D57), аудит v0.8.5, журнал D58–D60; vitest 563 (+27), e2e 628/644 (блок DF-26 25/25), tsc 0, build OK; миграция одна — df_14 additive"
git push origin main
```

GitHub Actions — дождаться **зелёного** CI. Красный — лог в чат агенту; откат `git revert HEAD --no-edit && git push` (только по согласованию).

## Шаг 5. Vercel

Deployments → дождаться **Ready**. Env-переменных в релизе нет — Redeploy вручную не требуется (Vercel деплоит новый коммит сама; Prisma Client с новой моделью генерируется при сборке).

## Шаг 6. Миграция прода (протокол А, RULES 2.16)

**6.1. Снимок:** Neon → зафиксировать точку point-in-time restore ДО шага 6.2 (free-тариф: запомнить текущее время).

**6.2. Применить** (Node.js LTS установлен, D16; миграция additive — новая таблица и 4 строки-дефолта, совместима с кодом 0.8.5, поэтому безопасно применять сразу после пуша, параллельно сборке Vercel):

```powershell
npx prisma@6 migrate deploy
```

Ожидаемый вывод: `1 migration found in prisma/migrations` → применяется `20261103120000_df_14_stage_doc_requirements`. До применения миграции единственное видимое отличие нового кода — админ-раздел «Требования документов» в справочнике этапов отвечает ошибкой (минуты, ожидаемо).

**6.3. КТ3 — последняя применённая (не PowerShell — Neon SQL Editor):**

```sql
SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 1;
```

Ожидается: `20261103120000_df_14_stage_doc_requirements`.

**6.4. КТ4 — дефолтный чек-лист (Neon SQL Editor):**

```sql
SELECT "stageCode", "kind", "providedBy", "isBlocking"
FROM "StageDocumentRequirement"
ORDER BY "stageCode", "kind";
```

Ожидается ровно 4 строки: `export_customs` и `import_customs` × (`customs_declaration`, `permit_document`), везде `broker` / `false`. Не 4 — чат агенту.

**6.5. Контроль данных (Neon SQL Editor):** снимок до и после миграции — числа обязаны совпасть (миграция документы не трогает):

```sql
SELECT "status", COUNT(*) AS cnt FROM "Document" GROUP BY "status" ORDER BY "status";
```

## Шаг 7. Smoke на проде (по ролям, RULES 2.16)

1. `/api/health` → `{"status":"ok","db":"ok"}`.
2. Вход ×3 кабинета (сотрудник, клиент, брокер).
3. **Сотрудник** — карточка заявки → «Документы»: реестр — чипы «Все документы / Разрешительные / Черновики и на проверке», фазы аккордеоном со счётчиками, текущий этап подсвечен; сводка панели («Документы X из Y…»); фаза 07 — строки требований (ОЖИДАЕТСЯ/ПОЛУЧЕН/НЕ ТРЕБУЕТСЯ, срок, «предоставит») и «+ Добавить».
4. «Загрузить» в строке требования → единое окно, вид «Разрешительный документ» уже выбран → загрузить тестовый PDF → строка перешла в «ПОЛУЧЕН», документ в реестре.
5. «Скачать все документы» → диалог подтверждения с точными счётчиками («Всего N · из них черновики M») → ZIP скачивается, внутри папка заявки с фазами; «Скачать финальные» — прежний путь.
6. **Сотрудник** — Справочник этапов: в карточке этапа «Таможенное оформление» открыть «Требования документов» → 4 строки (ДТ и разрешительный, брокер, «рекомендуется»); редактирование — только сотрудник.
7. **Клиент** (свой кабинет): реестр без фазы «Внутренние» и без подрядческих видов, статусы видны, кнопок правки строк нет; чужая заявка — 404.
8. **Брокер**: аналогично — свой реестр без внутренних, чужая — 404.
9. Мобильный 375 (владелец с телефона): полноэкранный реестр, вкладки sticky, карточки фаз и требований, кнопки ≥44×44, «Добавить документ» доступна. Кнопок «Принять/Отклонить» в требованиях НЕТ — это волна 2 (согласовано, Р-2).
10. Тестовый документ удалить (кнопка «Удалить» у сотрудника).

## Откат

Vercel → Deployments → **Promote** предыдущего деплоя (0.8.5), затем `git revert HEAD --no-edit && git push`. Базу откатывать НЕ нужно: таблица `StageDocumentRequirement` additive — код 0.8.5 её не читает, данным ничего не грозит; обратной миграции нет и она не требуется. Чек-лист остаётся в базе и подхватится следующим деплоем.
