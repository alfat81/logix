# RELEASE-INSTRUCTIONS v0.8.3 — DF-11, досылка: ZIP не проходил фильтр MIME (03.11.2026)

Патч поверх v0.8.2: две точки кода, тесты и документация. Миграций нет, env-переменных нет, зависимостей нет — `npm install` не требуется, Redeploy вручную не требуется. Все команды — готовые блоки для PowerShell (D20): копируйте и выполняйте как есть.

## Состав

| Файл | Изменение |
| --- | --- |
| `src/lib/document-constants.ts` | карта псевдонимов MIME `DOC_MIME_ALIASES` (x-zip-compressed → zip, image/jpg → jpeg) |
| `src/lib/document-upload.ts` | `normalizeUploadMime` сводит псевдоним к канону до проверки белого списка |
| `src/lib/document-upload.test.ts` | unit +2: алиасы → канон; сигнатура настоящего ZIP |
| `scripts/e2e_api_test.py` | e2e +2: ZIP с алиасом Firefox проходит цикл; image/jpg (Android) → image/jpeg |
| `scripts/run-gates-083.sh` | конвейер гейтов v0.8.3 (ожидания 0.8.3/451/532) |
| `scripts/knip-baseline.json` | 38 → 37: находка STALE `DocAllowedMime` устранена (тип теперь используется картой алиасов) |
| `docs/INVENTORY.md` | перегенерирован (новый экспорт `DOC_MIME_ALIASES`) |
| `CHANGELOG.md` | запись [0.8.3] |
| `package.json` | версия 0.8.3 |
| `docs/ROADMAP.md` | статус-блок v0.8.3 |
| `docs/ROADMAP-DEALFLOW.md` | очередь сдвинута: DF-12 → 0.8.4, DF-13 → 0.8.5, DF-14 → 0.8.6, DF-15 → 0.8.7 |
| `docs/releases/RELEASE-NOTES-v0.8.3.md` | этот релиз |
| `docs/releases/RELEASE-INSTRUCTIONS-v0.8.3.md` | эта инструкция |
| `download/logix-v0.8.3.sha256` | sha256-сумма архива (содержимое — в чате; сам `*.zip` в git не входит — .gitignore) |

## Шаги владельца

1. **Синхронизировать клон** (перед распаковкой — урок 24.10: не пушить из отставшего клона):

```powershell
git fetch origin
git status
```

Если статус «behind origin/main» и локальных коммитов нет:

```powershell
git reset --hard origin/main
```

Если есть локальные коммиты или незавершённый rebase/merge — **стоп**, напишите в чат агенту, сами не мержите.

2. **Распаковать архив** `logix-v0.8.3.zip` в клон `C:\PROJECTS\logix` с заменой:

```powershell
Expand-Archive -Path .\logix-v0.8.3.zip -DestinationPath . -Force
```

3. **КТ1 — версия после распаковки:**

```powershell
Select-String -Path .\package.json -Pattern '"version"'
```

Ожидание ровно одно: `"version": "0.8.3"`. Не совпало — **стоп** и чат агенту (инцидент v0.2.6 24.10.2026: распаковка пропущена — дальше по цепочке едет не то состояние).

4. **КТ2 — состав перед коммитом:**

```powershell
git status --short
```

Ожидание: **ровно 14 строк** — десять изменённых (`src/lib/document-constants.ts`, `src/lib/document-upload.ts`, `src/lib/document-upload.test.ts`, `scripts/e2e_api_test.py`, `scripts/knip-baseline.json`, `docs/INVENTORY.md`, `CHANGELOG.md`, `package.json`, `docs/ROADMAP.md`, `docs/ROADMAP-DEALFLOW.md`) и четыре новых (`scripts/run-gates-083.sh`, `docs/releases/RELEASE-NOTES-v0.8.3.md`, `docs/releases/RELEASE-INSTRUCTIONS-v0.8.3.md`, `download/logix-v0.8.3.sha256`). Обязательно наличие строк `src/lib/` и `package.json`. Посторонние файлы или другое число строк — **стоп** и чат агенту (служебные файлы конвейера в архив не входят — урок v0.6.8).

4а. **КТ2а — sha256-файл** (сумма архива для трассировки; файл коммитится, сам `*.zip` — нет, .gitignore). Сохраните приложенный к сообщению агента файл `logix-v0.8.3.sha256` в каталог `download\` клона (создайте каталог, если его нет) — либо создайте сами, подставив сумму из чата агента:

```powershell
New-Item -ItemType Directory -Force -Path .\download | Out-Null
Set-Content -Path .\download\logix-v0.8.3.sha256 -Value "<SHA-256 из чата агента>  download/logix-v0.8.3.zip" -Encoding ascii
Get-FileHash .\logix-v0.8.3.zip -Algorithm SHA256
```

`Hash` из последней команды обязан совпасть с суммой из чата. Не совпал — архив повреждён при передаче, **стоп** и чат агенту.

5. **Коммит и пуш** (пуш на GitHub — владелец, RULES 2.11):

```powershell
git add -A
git commit -m "release v0.8.3: DF-11 досылка — ZIP не проходил фильтр MIME из-за браузерного псевдонима (x-zip-compressed -> zip, image/jpg -> jpeg до проверки белого списка); белый список не расширялся, confirm-сигнатура и выдача не затронуты; vitest 451 (+2), e2e 532 (+2); миграций/env/зависимостей нет"
git push origin main
```

6. **CI и деплой.** Дождаться зелёного в GitHub Actions (вкладка Actions) и Ready в Vercel (Deployments). Миграций нет — миграционный шаг пропускается. Env-переменных в этом релизе нет — Redeploy вручную не нужен: Vercel пересоберёт стандартно по push.

7. **Smoke на проде — проверка исправления (нужен реальный zip):**

- Откройте сделку → «Документы» → «Загрузить документ» → выберите **любой .zip** (тот самый, что не проходил). Ожидание: загрузка доходит до конца, тост «Документ загружен», документ виден в списке и скачивается.
- Если загрузчик — Firefox/Windows: раньше шаг create отвечал 400 «Формат "application/x-zip-compressed" не поддерживается», теперь сообщение не появляется вовсе.
- Попутно: `.jpg`-скан с Android-браузера тоже загружается.
- Регресс-страховка: файл неподдерживаемого формата (например, `.html` или переименованный в `.pdf` не-PDF) по-прежнему отклоняется — фильтр работает.

## Если что-то не так

- **КТ1/КТ2 не сошлись** — чат агенту, дальше не идти.
- **CI красный** — прислать агенту лог упавшего шага; откат:

```powershell
git revert HEAD --no-edit
git push origin main
```

- **ZIP снова не загружается после релиза** — пришлите в чат: браузер, точный текст ошибки из тоста, имя файла (расширение) и запись Network-вкладки по запросу `…/documents` (статус ответа). Это отличит остаток проблемы MIME от размера файла (лимит `files.max_mb`, сейчас 25 МБ) и от содержимого (сигнатура на confirm — например, RAR, переименованный в .zip, не пройдёт по задумке).

## Отчёт

После зелёного CI и Ready — короткое подтверждение в чат: версия КТ1, число строк КТ2, ссылка на коммит, результат smoke с zip. DF-12 «Виды документов» (v0.8.4) стартует следующей карточкой.
