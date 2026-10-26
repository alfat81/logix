# Инструкция владельца: деплой v0.5.1 (DF-00) — 26.10.2026

Время: ~5–7 минут. Все команды — готовые блоки для вставки в PowerShell (D20).
Выполняйте строго по порядку.

**В этом релизе миграций БД НЕТ** — схема базы не менялась.
Содержание: DF-00 — атомарная интерактивная конвертация лида в заявку (P1-10), разграничение прав мастера/менеджера (P1-09), ужесточение верификации паролей (отказ от открытого текста), ограничение seed.ts.

## 0. Привести клон в чистое состояние

Откройте PowerShell и выполните блок:

```powershell
cd C:\PROJECTS\logix
git rebase --abort
git merge --abort
git fetch origin
git reset --hard origin/main
git clean -fd
git log --oneline -1
git status
```

Контрольная точка 0: рабочий каталог чист (`working tree clean`), коммит соответствует актуальному состоянию ветки `main`.

## 1. Распаковать релизный архив в клон

Скачайте `logix-v0.5.1.zip` в папку `C:\PROJECTS\logix`, затем выполните:

```powershell
Expand-Archive -Path .\logix-v0.5.1.zip -DestinationPath . -Force
Remove-Item .\logix-v0.5.1.zip -ErrorAction SilentlyContinue
```

## 2. Проверка статуса файлов

```powershell
git status
```

Проверьте список измененных и добавленных файлов:
- `package.json` (0.5.1), `CHANGELOG.md`
- `docs/ROADMAP-DEALFLOW.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`, `docs/RULES.md`, `docs/SECURITY-ACTIONS.md`
- `docs/releases/RELEASE-NOTES-v0.5.1.md`, `docs/releases/RELEASE-INSTRUCTIONS-v0.5.1.md`
- `src/lib/password.ts`, `src/lib/orders.ts`, `src/lib/order-summary.ts`
- `src/lib/password.test.ts`, `src/lib/permissions-guard.test.ts`, `src/lib/convert-atomic.test.ts`
- `src/app/api/admin/leads/[id]/convert/route.ts`, `src/app/api/admin/leads/[id]/convert/helpers.ts`
- `src/app/api/admin/stage-catalog/route.ts`, `src/app/api/admin/stage-catalog/[id]/route.ts`
- `src/app/api/admin/legal-entities/route.ts`, `src/app/api/admin/legal-entities/[id]/route.ts`
- `src/app/api/admin/leads/[id]/route.ts`, `src/app/api/admin/leads/[id]/patch.ts`
- `scripts/seed.ts`, `.env.example`

## 3. Локальные тесты и сборка

```powershell
npm test
npm run lint
npm run build
```

Все 3 команды должны завершиться успешно (39 unit-тестов зеленые).

## 4. Коммит и пуш

```powershell
git add .
git commit -m "release v0.5.1: DF-00 атомарная конвертация, разграничение прав P1-09, гигиена"
git push origin main
```

## 5. Проверка после деплоя

После завершения автодеплоя на Vercel проверьте:
1. Запрос `GET https://<ваш-домен>/api/health` — возвращает `status: ok, db: ok`.
2. Вход под учетной записью менеджера:
   - Попытка создать этап в справочнике или изменить юрлицо возвращает 403 Forbidden.
   - Попытка удалить лид возвращает 403 Forbidden.
3. Вход под учетной записью мастера:
   - Конвертация запроса в заявку выполняется успешно и атомарно в одной транзакции.
