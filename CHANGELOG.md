# Changelog

## [Unreleased] — Фаза 0: безопасность и гигиена (23.10.2026)

### Безопасность
- Удалены из репозитория файлы с паролем мастера (`check-master-pass.js`) и шесть файлов cookie-сессий (`cmv*`); пароль вычищен из журнала. `scripts/check-master-pass.mjs` принимает кандидатов только аргументами. Сид больше не печатает пароль в лог. **Требуются действия владельца — см. `docs/SECURITY-ACTIONS.md`.** (E0-01)
- Rate-limit входа: IP берётся только из доверенного источника (Vercel / `TRUSTED_PROXY=true`), подмена `X-Forwarded-For` не даёт новых попыток. Лимит по логину с любых IP больше не блокирует вход, а замедляет ответ (до 5 с) — злоумышленник не может запереть владельца. Жёсткая блокировка — по IP и по паре «логин + IP». (E0-05)
- Загрузка документов: проверка сигнатуры файла (magic bytes) — HTML/скрипт под видом PDF отклоняется; DOCX/XLSX без MIME от браузера определяются по содержимому. Скачивание: повторная проверка сигнатуры (в том числе для старых файлов), несовпадение → `attachment` + `application/octet-stream`; картинки — с `CSP: sandbox`. (E0-07)
- Security-заголовки на все ответы: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy; убран `X-Powered-By`. `robots.txt` и `X-Robots-Tag: noindex` для кабинетов и API. (E0-04)
- CSRF: изменяющие запросы к `/api/*` с чужим `Origin` отклоняются (403), `src/proxy.ts`. (E0-09)

### База данных
- Prisma Migrate: базовая миграция `20261023000000_baseline`, скрипты `db:migrate`, `db:deploy`, `db:baseline`. Порядок перевода существующей базы — в `DEPLOY.md`. (E0-03)

### CI и тесты
- CI: job `checks` (validate, tsc, lint, build), job `e2e` (PostgreSQL 16, миграции, сид, сквозной API-тест), job `gitleaks`. (E0-02)
- `scripts/e2e_api_test.py` — 58 проверок: полный цикл сделки по четырём кабинетам, изоляция доступа, гонки, лимиты. Удалён устаревший `smoke_test_logix.py`.

### Репозиторий
- Удалены чужой роадмап `ROADMAP-v3.14.md` (APEX Moto) и скрипты с путями песочницы (`repro-p2021.sh`, `verify-hotfix.sh`, `download_yandex.sh`). Новые `docs/ROADMAP.md`, `docs/RULES.md`; старый роадмап v2.0 и `worklog.md` → `docs/archive/`. README переписан. (E0-11)
