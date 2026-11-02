# RELEASE-INSTRUCTIONS v0.8.1 — досылка DF-11: CSP для presigned PUT (03.11.2026)

Патч поверх v0.8.0: один файл кода (`next.config.ts`) + документация. Миграций нет, зависимостей нет, `bun.lock` не менялся — `npm install` не требуется.

## Состав

| Файл | Изменение |
| --- | --- |
| `next.config.ts` | CSP `connect-src` += origin `S3_ENDPOINT` (+wildcard поддоменов) из env при сборке |
| `CHANGELOG.md`, `package.json` | версия 0.8.1, запись |
| `DEPLOY.md` | `S3_FORCE_PATH_STYLE` — обязателен `true` для Cloud.ru (virtual-hosted без DNS-домена → 404) |
| `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md` | статус v0.8.1; DF-12 → 0.8.2, очередь сдвинута |
| `docs/releases/RELEASE-*-v0.8.1.md` | этот релиз |

## Шаги владельца

1. **Распаковать** `logix-v0.8.1.zip` поверх репозитория `C:\PROJECTS\logix`. Diff должен совпасть с таблицей «Состав» (проверьте `git status` — посторонних файлов быть не должно).
2. **Vercel → Settings → Environment Variables**: убедиться, что `S3_FORCE_PATH_STYLE=true` есть во всех окружениях (Production/Preview/Development). Если добавляли — Save.
3. **Закоммитить и запушить** (пуш на GitHub — владелец, RULES 2.11). Дождаться зелёного деплоя Vercel.
4. Если env менялись **после** последнего деплоя — Deployments → **Redeploy** (переменные окружения не применяются к работающему деплою).
5. **Смоук на проде**:
   - загрузить новый файл в любой сделке → в DevTools (Network) PUT должен уйти на `https://s3.cloud.ru/logix/docs/…` и вернуть 200; в консоли Cloud.ru счётчик объектов вырастет на 1;
   - скачать оба легаси-документа («Packing list (2).pdf», «TST2991567.docx») в сделке `cmvv9sby9000yl707k4nde875` — работает как прежде (302 на presigned GET);
   - убедиться, что просмотр PDF открывается в новой вкладке, скачивание — attachment.
6. **Отчёт в чат** — DF-11 закрывается окончательно, агент стартует DF-12 (v0.8.2).

## Если что-то не так

- **PUT снова блокирует CSP** — значит, деплой собран без `S3_*` (проверить, что переменные доступны в Build-окружении Vercel: CSP вычисляется при сборке) и/или деплой не пересобран после добавления env.
- **PUT 404** — адресация virtual-hosted: проверьте `S3_FORCE_PATH_STYLE=true` в Vercel.
- **PUT 403** — формат ключа: `S3_ACCESS_KEY_ID` должен быть `<tenant_id>:<key_id>`.
- **CORS-ошибка браузера** (не CSP) — не настроен CORS бакета: AllowedOrigins = прод-домен, Methods = `GET, PUT`, Headers = `*`.
- **Откат**: Deployments → предыдущий деплой → Redeploy. Данных и схемы патч не касается.
