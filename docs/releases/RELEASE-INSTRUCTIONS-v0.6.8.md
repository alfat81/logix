# Release Instructions — v0.6.8 (29.10.2026) · rev. B (fix1+fix2+fix3, 29.10)

Выполняется на машине владельца (PowerShell). Архивы: `logix-v0.6.8.zip` (база) + `logix-v0.6.8-fix1.zip` + `logix-v0.6.8-fix2.zip` + `logix-v0.6.8-fix3.zip` (патчи, прецедент fix1/fix2/fix3 v0.6.7). Новых env нет. Миграции additive.

**rev. B — что изменилось (29.10.2026, после красного CI на снапшот-пуше `151978e`):**

- добавлен Шаг 0 — откат сквош-коммита по Шагу 3 RULES 2.16 (красный CI → `git revert`);
- состав дополнен `.gitleaks.toml` (allowlist для развед-артефактов `scripts/hs-source/`) и редакцией стороннего ключа в `scripts/hs-source/ett-page.html` — оба файла приезжают из патч-архива `logix-v0.6.8-fix1.zip`;
- служебный файл `.release-v068-state.json` (попал в базовый архив мимо списка «ожидается») удаляется перед коммитом;
- Шаг 9 дополнен `npx prisma@6 generate` (fix1, обращение владельца: `migrate deploy` не перегенерирует Prisma Client — `import-hs.ts` падал на `prisma.hsImport.findMany`);
- Шаг 9 дополнен патчем fix2 (обращение владельца: P2028 — дефолтные 5 с транзакции не хватало на вставку 13 294 строк до Neon через WAN; в fix2 таймаут явный 60 с);
- примечание к списку КТ2 переформулировано без бэктик-путей (fix3, красный CI integrity IC-08: две ссылки на служебные скрипты конвейера, которые в архивы не входят и на origin отсутствуют);
- КТ1/КТ2 и шаги CI/Vercel/миграции/смоук — без изменений.

## 0. Откат снапшот-пуша (RULES 2.16, Шаг 3)

CI на `151978e` красный (gitleaks, ложное срабатывание на артефакте разведки — см. RELEASE-NOTES-v0.6.8-fix1.md). По канону — revert, затем повторный релиз уже с фиксом в составе:

```powershell
git fetch origin
git reset --hard origin/main
git revert HEAD --no-edit
git push origin main
```

Если `git status` перед шагом показывает локальные коммиты или незавершённый rebase/merge — стоп, писать агенту (урок 24.10). После пуша CI снова зелёный (состав v0.6.7). Затем — шаги 1–5.

## 1. Синхронизация клона

```powershell
git fetch origin
git reset --hard origin/main
```

## 2. Распаковка архивов

Сначала база, поверх — патч (он доносит `.gitleaks.toml`, отредактированный `ett-page.html` и эту инструкцию):

```powershell
Expand-Archive -Path .\logix-v0.6.8.zip -DestinationPath . -Force
Expand-Archive -Path .\logix-v0.6.8-fix1.zip -DestinationPath . -Force
Expand-Archive -Path .\logix-v0.6.8-fix2.zip -DestinationPath . -Force
Expand-Archive -Path .\logix-v0.6.8-fix3.zip -DestinationPath . -Force
```

## 3. Проверка версии (КТ1)

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Должно быть `"version": "0.6.8"` (fix-патч версию не меняет — прецедент v0.6.7-fix1/2/3). Не совпала — стоп и чат агенту.

## 3а. Служебный файл конвейера

```powershell
Remove-Item .\.release-v068-state.json -ErrorAction SilentlyContinue
```

Файл состояния релизного конвейера попал в базовый архив мимо списка «ожидается» — в репозиторий ему не место (исправлено в конвейере, fix1 его не содержит).

## 4. Проверка состава (КТ2)

```powershell
git status --short
```

Ожидаемый состав релиза относительно точки `cddc368` (предыдущий релиз, включая новые файлы). Число строк — 190; расхождение — стоп и чат агенту:

```
A       .gitleaks.toml
A       "download/Logix-RULES-\320\276\320\261\320\275\320\276\320\262\320\273\321\221\320\275\320\275\321\213\320\271.md"
M       .gitignore
M       CHANGELOG.md
A       df01-report.md
M       docs/INVENTORY.md
M       docs/REFERENCES-SOURCES.md
M       docs/ROADMAP-DEALFLOW.md
M       docs/ROADMAP.md
A       docs/releases/RELEASE-INSTRUCTIONS-v0.6.8.md
A       docs/releases/RELEASE-NOTES-v0.6.7-fix2.md
A       docs/releases/RELEASE-NOTES-v0.6.8-fix1.md
A       docs/releases/RELEASE-NOTES-v0.6.8.md
A       download/BRANDBOOK.md
A       download/CHANGELOG.md
A       download/Logix-CHANGELOG.md
A       download/Logix-DECISIONS.md
A       download/Logix-RELEASE-INSTRUCTIONS-v0.2.3.md
A       download/Logix-RELEASE-INSTRUCTIONS-v0.2.4.md
A       download/Logix-RELEASE-INSTRUCTIONS-v0.2.5.md
A       download/Logix-RELEASE-INSTRUCTIONS-v0.2.6.md
A       download/Logix-RELEASE-NOTES-v0.2.3.md
A       download/Logix-RELEASE-NOTES-v0.2.4.md
A       download/Logix-RELEASE-NOTES-v0.2.5.md
A       download/Logix-RELEASE-NOTES-v0.2.6.md
A       download/README.md
A       download/RELEASE-INSTRUCTIONS-v0.2.0.md
A       download/RELEASE-INSTRUCTIONS-v0.2.1.md
A       download/RELEASE-INSTRUCTIONS-v0.2.2.md
A       download/RELEASE-INSTRUCTIONS-v0.2.7.md
A       download/RELEASE-INSTRUCTIONS-v0.2.8.md
A       download/RELEASE-INSTRUCTIONS-v0.2.9.md
A       download/RELEASE-INSTRUCTIONS-v0.3.0.md
A       download/RELEASE-INSTRUCTIONS-v0.3.1.md
A       download/RELEASE-INSTRUCTIONS-v0.4.0.md
A       download/RELEASE-INSTRUCTIONS-v0.4.1.md
A       download/RELEASE-INSTRUCTIONS-v0.5.0.md
A       download/RELEASE-INSTRUCTIONS-v0.5.3.md
A       download/RELEASE-INSTRUCTIONS-v0.5.4.md
A       download/RELEASE-INSTRUCTIONS-v0.5.5.md
A       download/RELEASE-INSTRUCTIONS-v0.6.4.md
A       download/RELEASE-NOTES-v0.2.0.md
A       download/RELEASE-NOTES-v0.2.1.md
A       download/RELEASE-NOTES-v0.2.2.md
A       download/RELEASE-NOTES-v0.2.7.md
A       download/RELEASE-NOTES-v0.2.8.md
A       download/RELEASE-NOTES-v0.2.9.md
A       download/RELEASE-NOTES-v0.3.0.md
A       download/RELEASE-NOTES-v0.3.1.md
A       download/RELEASE-NOTES-v0.4.0.md
A       download/RELEASE-NOTES-v0.4.1.md
A       download/RELEASE-NOTES-v0.5.0.md
A       download/RELEASE-NOTES-v0.5.3.md
A       download/RELEASE-NOTES-v0.5.4.md
A       download/RELEASE-NOTES-v0.5.5.md
A       download/RELEASE-NOTES-v0.6.4.md
A       download/RELEASE-v0.6.8/SHA256SUMS
A       download/RELEASE-v0.6.8/logix-v0.6.8.zip
A       download/RELEASE-v0.6.8/logix-v0.6.8.zip_
A       download/RULES-AUDIT-v0.4.0.md
A       download/RULES.md
A       download/ci-cron-secret-fix.patch
A       download/ci-email-provider-fix.patch
A       download/ci.yml
A       download/p1-07-df00c-contract-dialog.png
A       download/p1-07-df00c-landing-frozen.png
A       download/p1-07-df00c-pool-dialog.png
A       download/p1-18-home-1440.png
A       download/p1-19-lead-1440.png
A       download/p1-19-order-1440.png
A       download/p1-19-print.png
A       download/p1-20-home-1440.png
A       download/p1-20-orders-1440.png
A       download/p1-20-orders-375.png
A       download/p1-20-orders-v031-1440.png
A       download/p1-20-orders-v031-375.png
A       download/p1-20-print-v031.png
A       download/p1-20-print.png
A       download/p1-21-contracts-1440.png
A       download/p1-21-customers-1440.png
A       download/p1-21-lead-dialog-375.png
A       download/p1-21-leads-1440.png
A       download/p1-21-leads-375.png
A       download/p1-21-orders-1440.png
A       download/p1-22-brokers-1440.png
A       download/p1-22-brokers-375.png
A       download/p1-22-contractors-1440.png
A       download/p1-22-employees-1440.png
A       download/p1-22-employees-375.png
A       download/p1-22-legal-entities-1440.png
A       download/p1-22-order-docs-1440.png
A       download/p1-22-print-1440.png
A       download/p1-23-home-1440.png
A       download/p1-23-lead-card-1440.png
A       download/p1-23-lead-dialog-1440.png
A       download/p1-23-leads-1440.png
A       download/p1-23-leads-375.png
M       package.json
A       prisma/migrations/20261028193326_df_17c_hs/migration.sql
A       prisma/migrations/20261029120000_df_18_broker_items/migration.sql
M       prisma/schema.prisma
A       releases/archive/RELEASE-v0.6.4/RELEASE-INSTRUCTIONS-v0.6.4.md
A       releases/archive/RELEASE-v0.6.4/RELEASE-NOTES-v0.6.4.md
A       releases/archive/RELEASE-v0.6.4/SHA256SUMS.txt
A       releases/archive/RELEASE-v0.6.5/RELEASE-INSTRUCTIONS-v0.6.5.md
A       releases/archive/RELEASE-v0.6.5/RELEASE-NOTES-v0.6.5.md
A       releases/archive/RELEASE-v0.6.5/SHA256SUMS.txt
A       releases/archive/RELEASE-v0.6.6/RELEASE-INSTRUCTIONS-v0.6.6.md
A       releases/archive/RELEASE-v0.6.6/RELEASE-NOTES-v0.6.6.md
A       releases/archive/RELEASE-v0.6.6/SHA256SUMS.txt
A       releases/archive/RELEASE-v0.6.7-fix1/RELEASE-NOTES-v0.6.7-fix1.md
A       releases/archive/RELEASE-v0.6.7-fix1/SHA256SUMS.txt
A       releases/archive/RELEASE-v0.6.7-fix2/RELEASE-NOTES-v0.6.7-fix2.md
A       releases/archive/RELEASE-v0.6.7-fix2/SHA256SUMS.txt
A       releases/archive/RELEASE-v0.6.7-fix3/RELEASE-NOTES-v0.6.7-fix3.md
A       releases/archive/RELEASE-v0.6.7-fix3/SHA256SUMS.txt
A       releases/archive/RELEASE-v0.6.7/RELEASE-INSTRUCTIONS-v0.6.7.md
A       releases/archive/RELEASE-v0.6.7/RELEASE-NOTES-v0.6.7.md
A       releases/archive/RELEASE-v0.6.7/SHA256SUMS.txt
A       releases/archive/root/logix-v0.6.7-fix3.zip_
A       scripts/d27_terminology.py
A       scripts/df02a_smoke5.py
M       scripts/e2e_api_test.py
A       scripts/env-fallback.ts
A       scripts/fix_expected_status_v068.py
A       scripts/fix_leadcard_aside.py
A       scripts/hs-source/ett-page.html
A       scripts/hs-source/group01.pdf
A       scripts/hs-source/group01.txt
A       scripts/hs-source/nsi-dictionaries.json
A       scripts/hs_make_snapshot.py
A       scripts/ic14_probe.py
A       scripts/import-hs.ts
M       scripts/integrity-baseline.json
M       scripts/knip-baseline.json
A       scripts/make_fix1_zip.py
A       scripts/make_fix3_zip.py
A       scripts/p1_22_browser.sh
A       scripts/p1_22_emp_search.sh
A       scripts/p1_23_roadmap.py
A       scripts/provision_pg.sh
A       scripts/prune_baseline_df00d.py
A       scripts/ref-data/hs/tnved-tws.json
A       scripts/release_v068_all.py
A       scripts/release_v068_docs.py
A       scripts/release_v068_pipeline.py
A       scripts/repair_instructions_v068.py
A       scripts/scope_baseline_augment.py
M       scripts/seed.ts
A       scripts/slim_leadcard.py
A       scripts/verify_release_diff.py
A       scripts/verify_release_diff.sh
A       scripts/verify_v027_commit.py
M       src/app/api/admin/leads/[id]/brokers/route.ts
M       src/app/api/admin/leads/[id]/route.ts
M       src/app/api/admin/orders/[id]/route.ts
M       src/app/api/broker/leads/[id]/estimate/route.ts
M       src/app/api/broker/leads/[id]/route.ts
M       src/app/api/broker/orders/[id]/route.ts
A       src/app/api/hs/search/route.ts
M       src/components/admin/BrokerLinksSection.tsx
M       src/components/admin/SideActivityFeed.tsx
A       src/components/admin/estimate/EstimateView.tsx
M       src/components/broker/BrokerEstimateForm.tsx
A       src/components/broker/estimate/FormBlocks.tsx
A       src/components/broker/estimate/ItemsEditor.tsx
A       src/components/references/ComboOptionRow.tsx
A       src/components/references/HsCodeCombobox.tsx
M       src/components/references/ReferenceCombobox.tsx
M       src/lib/activity.ts
A       src/lib/brokers.test.ts
M       src/lib/brokers.ts
M       src/lib/event-registry.ts
A       src/lib/hs-db.ts
A       src/lib/hs.test.ts
A       src/lib/hs.ts
M       src/lib/settings.test.ts
M       src/lib/settings.ts
A       upload/Pasted Content_1793171045984.txt
A       upload/pasted_image_1793176923808.png
A       upload/pasted_image_1793177557170.png
A       upload/pasted_image_1793210512257.png
A       upload/pasted_image_1793211508179.png
A       upload/pasted_image_1793211520871.png
A       upload/pasted_image_1793211648050.png
A       upload/pasted_image_1793212132432.png
A       upload/pasted_image_1793212162829.png
A       upload/pasted_image_1793262721393.png
A       upload/pasted_image_1793278949282.png
A       worklog.md
```

Примечания к списку: строка `A .gitleaks.toml` — первая, из патч-архива `logix-v0.6.8-fix1.zip` (там же отредактированный `scripts/hs-source/ett-page.html`, эта инструкция и `docs/releases/RELEASE-NOTES-v0.6.8-fix1.md` — строка в списке учтена). Служебные скрипты конвейера (сборка патч-архивов, локальный gitleaks-прогон) в архивы не входят и на origin отсутствуют — в списке их нет и быть не должно (урок fix3: бэктик-пути в прозе docs ловит IC-08).

## 5. Коммит и push

```powershell
git add -A
git commit -m "release v0.6.8: DF-17C справочник ТН ВЭД (tws.by, 13294 позиции, ред. 2022-2023) + DF-18 ответ брокера кодами и процентами (D38); миграции df_17c_hs + df_18_broker_items (additive); /api/hs/search + HsCodeCombobox (подсказка ЕТТ не автоподстановка); BrokerEstimateForm items+send, серверная верификация кодов, broker.max_items; vitest 241/241, e2e 311/311, tsc/lint/build/integrity/knip чисто"
git push origin main
```

## 6. CI

Дождаться зелёного CI на GitHub (gitleaks зелёный: allowlist + отредактированный артефакт в составе). Откат кода при проблемах:

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

## 9. Генерация Prisma Client и импорт ТН ВЭД

Строго после шага 8. `migrate deploy` применяет SQL, но НЕ перегенерирует Prisma Client: без generate новых моделей в клиенте нет, и импортёр падает (`Cannot read properties of undefined (reading 'findMany')` на `prisma.hsImport`). Vercel генерирует клиента при сборке сам — шаг нужен только для локального запуска скриптов:

```powershell
npx prisma@6 generate
npx tsx scripts/import-hs.ts
```

Ожидаемый вывод:

```
Импорт ТН ВЭД: редакция 2026-10-28, позиций 13294 (TWS.by — открытая выгрузка справочника ТН ВЭД ЕАЭС)
  + Вставлено 13294 позиций (редакция 2026-10-28)
  ~ Закрыто записей предыдущих редакций: 0
Готово: справочник ТН ВЭД актуализирован, история сохранена.
```

Повторный запуск — no-op: «уже в базе (13294 позиций) — повторный импорт ничего не изменил».

Если словили `P2028` («Transaction already closed», истёк таймаут транзакции) — это fix2: распакуйте патч и повторите импорт (транзакция атомарна, после таймаута всё откатилось — дубликатов не будет; миграции Шага 8 повторять не нужно):

```powershell
Expand-Archive -Path .\logix-v0.6.8-fix2.zip -DestinationPath . -Force
npx tsx scripts/import-hs.ts
```

После распаковки fix2 список Шага 4 дополняется строкой `M       scripts/import-hs.ts` (всего 191); после fix3 — ещё строкой с notes fix3 (всего 192).

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
