# RELEASE-INSTRUCTIONS v0.8.0 — DF-11 «Хранилище файлов» (02.11.2026)

Владелец выполняет в PowerShell из клона `C:\PROJECTS\logix`. База — v0.7.15 (на проде, деплой зелёный). В релизе: **миграция `df_11_storage` (additive), новые env `S3_*`, перенос легаси-файлов скриптом**. Порядок строгий: распаковка → env Vercel → CORS бакета → пуш/CI → миграция (протокол А) → Redeploy → перенос легаси → smoke по ролям.

## Шаг 0. Синхронизация клона (до распаковки!)

```powershell
git fetch origin
git status
```

Если ветка behind `origin/main` и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — чат агенту, самому не мержить. `origin/main` — v0.7.15.

## Шаг 1. Распаковка архива

Архив приходит с суффиксом `_` — сначала переименовать (если уже `logix-v0.8.0.zip` — пропустите Rename-Item):

```powershell
Rename-Item .\logix-v0.8.0.zip_ logix-v0.8.0.zip
Expand-Archive -Path .\logix-v0.8.0.zip -DestinationPath . -Force
```

**КТ1 — версия:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидается `"version": "0.8.0"`. Не совпало — стоп, чат агенту.

**КТ2 — состав (перед коммитом):**

```powershell
git status --short
```

Состав «ожидается» (числа ориентировочные, расхождение по НАЛИЧИЮ строк `src/…` — стоп, чат агенту): `src/lib/storage.ts`, `src/lib/document-upload.ts`, `src/lib/document-confirm.ts` (новые); `src/lib/documents.ts`, `src/lib/document-constants.ts`, `src/lib/file-signature.ts`, `src/lib/permits-db.ts` (правки); 12 роутов `src/app/api/{admin,client,broker}/…documents|versions|permits…` (правки); 3 новых `…/document-versions/[id]/confirm/route.ts`; `src/app/api/storage/local/[...key]/route.ts`; `src/app/api/document-versions/[id]/file/route.ts`; `src/components/documents/**` (диалоги, `UploadProgress.tsx`, `upload-client.ts`), `src/components/permits/**`; `prisma/migrations/20261031200000_df_11_storage/`; `scripts/migrate-files-to-storage.ts`; `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`, `docs/DEPRECATIONS.md`, `docs/INVENTORY.md`, `docs/releases/RELEASE-*v0.8.0.md`; `CHANGELOG.md`, `DEPLOY.md`, `.env.example`, `package.json`, `knip.json`, `src/proxy.ts`, `src/lib/storage.test.ts`, `src/lib/document-upload.test.ts`, `scripts/e2e_api_test.py`, `scripts/integrity_check.py`.

## Шаг 2. Env Vercel (до пуша — чтобы деплой сразу собрался с хранилищем)

Vercel → проект → Settings → Environment Variables (Production) — добавить:

| Имя | Значение |
|---|---|
| `S3_ENDPOINT` | `https://s3.cloud.ru` |
| `S3_REGION` | `ru-central-1` |
| `S3_BUCKET` | имя приватного бакета (создан заранее) |
| `S3_ACCESS_KEY_ID` | статический ключ Cloud.ru в формате `<tenant_id>:<key_id>` |
| `S3_SECRET_ACCESS_KEY` | секрет статического ключа |
| `S3_FORCE_PATH_STYLE` | пусто (virtual-host); если провайдер требует path-style — `true` |

Save. **Пока Redeploy не нажимать** — он будет после миграции (шаг 6).

## Шаг 3. CORS бакета (консоль Cloud.ru)

Для бакета разрешить методы **GET и PUT** с Origin — только прод-домен приложения (`APP_BASE_URL`, временный адрес Vercel). AllowedHeaders: `*`; AllowedMethods: `GET, PUT`; AllowedOrigins: `https://<прод-домен>` (без завершающего слэша). Публичный доступ к бакету — запрещён (по умолчанию).

## Шаг 4. Коммит и пуш

```powershell
git add -A
git commit -m "release v0.8.0: DF-11 хранилище файлов — S3 (Cloud.ru) через aws4fetch, двухфазная загрузка create→PUT→confirm с проверкой сигнатуры и лимита files.max_mb (25 МБ из настроек), скачивание 302 presigned GET 60с (inline только pdf/png/jpeg/webp), легаси из fileData читается и переносится migrate-files-to-storage.ts (--dry), df_11_storage additive, env S3_*, устранён флак e2e-дайджеста DF-16 (окна между секциями — в будущем), vitest 449 (+17), e2e 530 (+20)"
git push origin main
```

GitHub Actions — дождаться **зелёного** CI. Красный — лог в чат агенту; откат `git revert HEAD --no-edit && git push` (только по согласованию).

## Шаг 5. Миграция прода (протокол А)

**5.1. Снимок:** Neon → ветка/point-in-time restore точка зафиксирована ДО шага 5.2 (free-тариф: запомнить время).

**5.2. Применить** (Node.js LTS установлен, D16; миграция additive — совместима с кодом 0.7.15):

```powershell
npx prisma@6 migrate deploy
```

**5.3. КТ3 — последняя применённая:**

```sql
SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "started_at" DESC LIMIT 1;
```

(не PowerShell — Neon SQL Editor). Ожидается: `20261031200000_df_11_storage`.

## Шаг 6. Redeploy и перенос легаси

**6.1.** Vercel → Deployments → **Redeploy** (env подхватятся только так, RULES 2.16 шаг 4). Дождаться Ready.

**6.2. Перенос легаси-файлов из БД в бакет** (сначала отчёт, потом боевой запуск; идемпотентен):

```powershell
npx prisma@6 generate
npx tsx scripts/migrate-files-to-storage.ts --dry
```

Отчёт `{"mode":"dry",...,"pending":N}` — N = число файлов к переносу (у каждого байты в БД и нет `storageKey`). Прислать отчёт в чат. Затем боевой запуск:

```powershell
npx tsx scripts/migrate-files-to-storage.ts
```

В конце — `{"summary":{"mode":"migrate","moved":N,"bytes":B,"failed":0}}`. `failed > 0` — чат агенту (список версий в выводе). Байты из БД при этом **не удаляются** (dual-хранение до 0.9.0 — DEPRECATIONS).

## Шаг 7. Smoke по ролям (прод)

1. Вход ×4: менеджер, мастер, клиент, брокер (у сотрудников с TOTP — код).
2. **Админка:** карточка заявки → «Документы» → «Загрузить документ» → PDF и PNG (виден прогресс; PDF открывается по ссылке в предпросмотре, PNG — картинкой).
3. **Кабинет клиента:** тот же поток — загрузка PDF в документ и документа в строку разрешительного («Загрузить и закрыть» — строка стала «Получен»); DOCX/XLSX скачиваются (не открываются в браузере).
4. **Кабинет брокера:** загрузка акта в заявку — без ошибок.
5. Отказы: файл >25 МБ → внятная ошибка про лимит; HTML, переименованный в .pdf → отказ «Содержимое файла не совпадает с его форматом».
6. Ссылка на документ у другого клиента (из другой компании) — 404.
7. `/api/health` — `{"status":"ok"}`; «Настройки» → «Файлы» — `files.max_mb` виден.

Откат: Vercel → Deployments → Promote предыдущего; `git revert HEAD --no-edit && git push`; базу миграция не ломает (только новые колонки) — point-in-time restore не требуется.
