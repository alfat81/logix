# Инструкция владельца: деплой v0.6.3 (CI-фикс фикстур DF-02A) — 28.10.2026

Время: ~5 минут. Все команды — готовые блоки для вставки в PowerShell (D20).

**Что в этом релизе:** только тестовые фикстуры и релизные документы —
продукт-код, схема, миграции и env **не менялись**. Причина: CI упал на
стражнике `password.test.ts` (в базе не должно быть паролей без префикса
`scrypt:`) — новые тесты DF-02A создавали фикстуры-брокеров с открытым
текстом `'x'` (гонка параллельных тестов; в песочнице не воспроизводилось).
**Миграция НЕ требуется** — шаг `prisma migrate deploy` пропускаем.
**Новых переменных окружения нет.**

## 0. Привести клон в чистое состояние

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

КТ0: `working tree clean`, HEAD = `9bb1b02` (release v0.6.2).

## 1. Распаковать архив с заменой

```powershell
Expand-Archive -Path "C:\PROJECTS\logix-v0.6.3.zip" -DestinationPath "C:\PROJECTS\logix" -Force
```

## 2. Индексация и сверка

```powershell
git add -A
git status --short
Select-String -Path .\package.json -Pattern '"version"'
```

КТ1: **8 файлов — 5 изменённых (M) и 3 новых (A), удалений 0**.

Изменённые (5): `CHANGELOG.md`, `package.json`,
`docs/DEPRECATIONS.md`, `docs/ROADMAP.md`,
`src/lib/company-users.test.ts`.

Новые (3): `docs/releases/RELEASE-INSTRUCTIONS-v0.6.3.md`,
`docs/releases/RELEASE-NOTES-v0.6.3.md`,
`docs/releases/SCOPE-v0.6.3.json`.

КТ1а: `"version": "0.6.3"`. Не совпало — стоп, чат агенту.

## 3. Миграция — НЕ ТРЕБУЕТСЯ

Схема и данные не менялись. Шаг пропускаем целиком.

## 4. Коммит и пуш

```powershell
git commit -m "release v0.6.3: CI-фикс — фикстуры company-users.test.ts со scrypt-префиксом паролей (стражник password.test.ts vs гонка параллельных тестов DF-02A: 5 брокеров-обёрток с открытым текстом 'x', в CI поймано 4), vitest 138/138 x3 на чистой и грязной базе, tsc/lint/scope/integrity/knip чисто; DEPRECATIONS: оценка contract-релиза 0.6.3->0.6.4; продукт-код и схема не менялись, миграций нет"
git push origin main
git log --oneline -1
```

## 5. Проверка CI

Откройте Actions → ждите зелёного по всем 4 job'ам:

- `validate · tsc · lint · build` — здесь упало в прошлый раз;
- `integrity (G3/G4 — IC-01..IC-15, knip)`;
- `e2e API (PostgreSQL)` — **216/216** + шаг заморозки 16/16;
- `gitleaks`.

КТ2: все 4 job зелёные. Если что-то красное — пришлите полный лог
упавшего job'а.

## 6. Проверка прода

Vercel задеплоит тот же рантайм-код, что и v0.6.2 — риск нулевой:

```powershell
curl.exe -s https://logix-gamma.vercel.app/api/health
```

КТ3: `{"status":"ok","db":"ok",...}`.

После зелёного CI — **смоук v0.6.2 из 6 шагов** (список людей, вход по
прежним данным, второй человек, деактивация, автор-человек, брокеры) по
инструкции v0.6.2 — его ещё не делали, прод уже на коде DF-02A.

## Откат

Не требуется: изменение тестовое, на рантайм и данные не влияет.
При желании — `git revert <коммит>` + push.
