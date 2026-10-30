# Release Instructions — v0.7.1 (30.10.2026)

Выполняется на машине владельца (PowerShell). Архив: `logix-v0.7.1.zip`. Новых env нет. Миграций нет, сид не требуется. Полный контекст — `docs/releases/RELEASE-NOTES-v0.7.1.md` (в архиве).

## 1. Синхронизация клона

```powershell
git fetch origin
git status
```

Если ветка behind origin/main и локальных коммитов нет — `git reset --hard origin/main`. Есть локальные коммиты или незавершённый rebase/merge — стоп и чат агенту (урок 24.10).

## 2. Распаковка архива

```powershell
Expand-Archive -Path .\logix-v0.7.1.zip -DestinationPath . -Force
```

## 3. Проверка версии (КТ1)

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Должно быть `"version": "0.7.1"`. Не совпала — стоп и чат агенту.

## 4. Проверка состава (КТ2)

```powershell
git status --short --untracked-files=all
```

Ожидаемый состав относительно предыдущего релизного коммита на origin. Число строк — **41** (39 изменённых + 2 новых); обязательное наличие строк `src/app/globals.css`, `src/components/ui/badge.tsx`, `src/lib/status-badges.ts`, `scripts/contrast_check.py` (новый), `docs/design/contrast-pairs.json` (новый), `docs/BRANDBOOK.md`. Расхождение — стоп и чат агенту:

```
M       CHANGELOG.md
M       docs/BRANDBOOK.md
M       docs/INVENTORY.md
M       docs/ROADMAP-DEALFLOW.md
M       docs/ROADMAP.md
M       package.json
M       scripts/integrity-baseline.json
M       scripts/integrity_check.py
M       src/app/admin/(dashboard)/layout.tsx
M       src/app/client/(portal)/layout.tsx
M       src/app/contractor/(portal)/layout.tsx
M       src/app/globals.css
M       src/components/admin/ActivityFeed.tsx
M       src/components/admin/AdminNav.tsx
M       src/components/admin/BrokerLinksSection.tsx
M       src/components/admin/BrokerUsersDialog.tsx
M       src/components/admin/ContractorPoolSection.tsx
M       src/components/admin/CustomerCabinetAccess.tsx
M       src/components/admin/LeadListCard.tsx
M       src/components/admin/ListTabs.tsx
M       src/components/admin/OrderCard.tsx
M       src/components/admin/OrderStepper.tsx
M       src/components/admin/QuoteOptionsSection.tsx
M       src/components/admin/attention/AttentionSections.tsx
M       src/components/admin/broker/BrokerCard.tsx
M       src/components/admin/contractorlead/RawInfoView.tsx
M       src/components/admin/customs/CustomsCalcResult.tsx
M       src/components/admin/customs/CustomsItemsEditor.tsx
M       src/components/admin/estimate/EstimateView.tsx
M       src/components/admin/order/OrderQuoteCard.tsx
M       src/components/admin/order/StageCard.tsx
M       src/components/broker/estimate/ItemsEditor.tsx
M       src/components/contractor/ContractorOrderCard.tsx
M       src/components/contractor/ContractorOrdersList.tsx
M       src/components/references/ComboOptionRow.tsx
M       src/components/ui/badge.tsx
M       src/components/ui/button.tsx
M       src/lib/status-badges.ts
??      docs/design/contrast-pairs.json
??      docs/releases/RELEASE-INSTRUCTIONS-v0.7.1.md
??      docs/releases/RELEASE-NOTES-v0.7.1.md
??      docs/releases/SCOPE-v0.7.1.json
```

(итог 42 строки с учётом четырёх новых документов релиза — сверьте состав, число может отличаться на ±1 из-за служебных файлов; главное — набор путей и наличие строк `src/`).

## 5. Публикация

```powershell
git add -A
git commit -m "release v0.7.1: DF-20 — контраст WCAG AA (токены Brick-strong/Success-strong/Action-icon, кнопки Coral с Ink 6,09), красный сигнал только для срочного (лого/меню/этапы — Ink/Action-icon), теги с точкой 8px + critical/draft/checking/final, текст >=12px, брендбук v1.3 (+3.3, +4.5 «Телефон 375px»), IC-17 (contrast_check + 13 пар); vitest 264, e2e 343"
git push origin main
```

## 6. CI и Vercel

- CI — зелёный ожидание (прогон песочницы: integrity OK новых 0 c новой IC-17, vitest 264/264, tsc 0, lint 0 ошибок, build OK, e2e 343/343). Красный — прислать лог, откат `git revert HEAD --no-edit && git push origin main`.
- Vercel → Deployments → Ready. Env не менялся, миграций нет — кроме пуша ничего не требуется.

## 7. Смоук (прод) — визуальный, 5 минут

1. Вход → админка: логотип-знак ТЁМНЫЙ (Ink), не красный; активный пункт меню — белая плашка, тёмный текст, красная полоска 3px слева; счётчики — Coral с тёмным числом.
2. Кнопки «+ Новая заявка» и прочие основные — Coral с ТЁМНЫМ текстом (не белым).
3. Список заявок: теги статусов — светлые таблетки с цветной точкой слева и тёмным текстом; «В работе» — точка коралловая; «Завершена» — зелёная пара; текущий этап степпера — коралловая рамка (не красная).
4. Карточка сделки на телефоне (375px): ничего не вылезает за экран, подписи не мельче 12px.
5. Проверка контраста «на глаз»: текст читаем на телефоне при ярком свете.

## Откат

`git revert HEAD --no-edit && git push origin main`. БД не затронута — релиз только визуал/документы.
