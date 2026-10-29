# Release Instructions — v0.7.0 (30.10.2026)

Выполняется на машине владельца (PowerShell). Архив: `logix-v0.7.0.zip`. Новых env нет. Миграция additive (протокол А). Полный контекст — `docs/releases/RELEASE-NOTES-v0.7.0.md` (в архиве), отчёт гейтов — `worklog.md` (30.10, G1–G4).

## 1. Синхронизация клона

```powershell
git fetch origin
git status
```

Если ветка behind origin/main и локальных коммитов нет — `git reset --hard origin/main`. Есть локальные коммиты или незавершённый rebase/merge — стоп и чат агенту (урок 24.10).

## 2. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.7.0.zip -DestinationPath . -Force
```

## 3. Проверка версии (КТ1)

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Должно быть `"version": "0.7.0"`. Не совпала — стоп и чат агенту.

## 4. Проверка состава (КТ2)

```powershell
git status --short --untracked-files=all
```

Ожидаемый состав относительно предыдущего релизного коммита (`f9a442d` на origin). Число строк — **57**; обязательное наличие строк `src/lib/customs.ts` и `prisma/migrations/20261029190000_df_19_customs_calc/migration.sql`. Расхождение — стоп и чат агенту:

```
M       CHANGELOG.md
M       docs/INVENTORY.md
M       docs/ROADMAP-DEALFLOW.md
M       docs/ROADMAP.md
M       docs/releases/SCOPE-v0.7.0.json
M       package.json
M       prisma/schema.prisma
M       scripts/e2e_api_test.py
M       scripts/integrity-baseline.json
M       scripts/integrity_check.py
M       scripts/knip-baseline.json
M       scripts/ref-data/incoterms.ts
M       scripts/seed.ts
M       src/app/admin/(dashboard)/orders/[id]/page.tsx
M       src/app/admin/orders/[id]/print/PrintTable.tsx
M       src/app/admin/orders/[id]/print/data.ts
M       src/app/admin/orders/[id]/print/page.tsx
M       src/app/admin/orders/[id]/print/print.css
M       src/app/api/admin/leads/[id]/patch.ts
M       src/app/api/admin/orders/[id]/patch.ts
M       src/app/api/admin/orders/[id]/schemas.ts
M       src/components/admin/LeadCard.tsx
M       src/components/admin/estimate/EstimateView.tsx
M       src/components/admin/lead/types.ts
M       src/components/admin/order/types.ts
M       src/lib/activity.ts
M       src/lib/event-registry.ts
M       src/lib/lead-edit.ts
M       src/lib/leads.ts
M       src/lib/orders.ts
M       src/lib/permissions-guard.test.ts
M       src/lib/settings-validators.ts
M       src/lib/settings.test.ts
M       src/lib/settings.ts
M       tsconfig.json
M       worklog.md
A       docs/releases/RELEASE-INSTRUCTIONS-v0.7.0.md
A       docs/releases/RELEASE-NOTES-v0.7.0.md
A       prisma/migrations/20261029190000_df_19_customs_calc/migration.sql
A       scripts/ref-data/customs-fees.ts
A       src/app/admin/orders/[id]/print/CustomsPrintBlock.tsx
A       src/app/admin/orders/[id]/print/customs-data.ts
A       src/app/api/admin/customs-calculations/[id]/route.ts
A       src/app/api/admin/leads/[id]/customs-calculations/route.ts
A       src/app/api/admin/orders/[id]/customs-calculations/route.ts
A       src/components/admin/customs/CustomsCalcForm.tsx
A       src/components/admin/customs/CustomsCalcResult.tsx
A       src/components/admin/customs/CustomsCalcScreen.tsx
A       src/components/admin/customs/CustomsFxInputs.tsx
A       src/components/admin/customs/CustomsItemsEditor.tsx
A       src/components/admin/customs/prefill.ts
A       src/components/admin/customs/types.ts
A       src/components/admin/customs/use-incoterm-flags.ts
A       src/lib/customs-api.ts
A       src/lib/customs-server.ts
A       src/lib/customs.test.ts
A       src/lib/customs.ts
```

Примечание: в печатных путях скобки (`[id]`) и скобочная папка `(dashboard)` — это часть пути, PowerShell их не интерпретирует внутри вывода git; сверяйте построчно.

## 5. Коммит и публикация

```powershell
git add -A
git commit -m "release v0.7.0: DF-19 расчёт таможенных платежей в рублях по условиям поставки (D38/D39)"
git push origin main
```

Публикация — только git-командами из клона; загрузка файлов через веб-интерфейс GitHub запрещена (RULES 2.16, КТ3).

## 6. CI

GitHub Actions — зелёный (tsc, lint, vitest, build, e2e, gitleaks). Красный — прислать лог агенту, откат `git revert HEAD --no-edit && git push origin main`.

## 7. Vercel

Deployments → Ready (env не менялся — Redeploy не требуется).

## 8. Миграция (протокол А, D16)

1. До: Neon — зафиксировать точку point-in-time restore (free-тариф).
2. Применение — ПОСЛЕ распаковки архива и КТ1/КТ2:

```powershell
npx prisma@6 migrate deploy
```

Ожидается применение одной миграции: `20261029190000_df_19_customs_calc`. Книгаучёт пишется в `_prisma_migrations` автоматически. Резерв (Node недоступен): Neon SQL Editor — содержимое `prisma/migrations/20261029190000_df_19_customs_calc/migration.sql`, затем регистрационный INSERT (агент даёт с sha256 по запросу).

3. Генерация клиента (для локальных скриптов; Vercel генерирует при сборке сам — урок v0.6.8):

```powershell
npx prisma@6 generate
```

4. Сид справочников (идемпотентен): обновляет meta Инкотермс (draft снят — D44) и заливает шкалу таможенных сборов 2026 (8 строк; без него расчёт сборов будет требовать ручной ввод):

```powershell
bun run seed
```

Сид требует MASTER_PHONE/MASTER_PASSWORD (не-локальная база) — те же значения, что при первичном сиде.

5. Проверка:

```sql
SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 1;
SELECT count(*) FROM "CustomsFeeScale";  -- ожидается 8
```

## 9. Smoke (прод)

1. `/api/health` — ok.
2. Вход ×4 кабинета.
3. Карточка запроса → секция «Расчёт таможенных платежей» → «Рассчитать платежи»: условие поставки FOB, одна строка (код из ответа брокера, стоимость, вес нетто), фрахт → «Сохранить расчёт» — таблица итогов с подписью «Оценка. Окончательные платежи определяются при декларировании».
4. Тестовый расчёт удалить нельзя (история) — проверка на реальной сделке; тестовые данные сделки не создавать.
5. Печатная форма заявки с расчётом — приложение «Расчёт таможенных платежей (оценка)» в конце бланка.

## Откат

Vercel → Deployments → Promote предыдущего; `git revert HEAD --no-edit && git push origin main`. Миграция additive — откат кода безопасен без отката БД (таблицы останутся пустыми до следующего релиза).

## Что говорит менеджеру после деплоя

- В карточке запроса/заявки появилась секция «Расчёт таможенных платежей» — расчёт создаётся кнопкой «Рассчитать платежи»; правки черновика — «Править расчёт», новая версия — «Пересчитать новой версией» (история сохраняется).
- «Из ответа брокера» подставляет проценты DF-18; стоимость товара и вес НЕТТО (гр. 38) вносит менеджер.
- Если курса ЦБ на выбранную дату нет (свежая дата, импорт ещё не прошёл) — введите курс вручную (графа «Курсы вручную»), например из самой ДТ.
- Экран справочника «Условия поставки» больше не помечает правила черновиком — они утверждены брокером для тестового контура (D44); операционное подтверждение — после первого живого расчёта, сошедшегося с фактической ДТ.
