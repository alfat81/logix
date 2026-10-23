# Действия владельца после инцидента с секретами (E0-01)

В публичном репозитории были пароль мастера (`check-master-pass.js`,
`worklog.md`) и шесть файлов с токенами сессий (`cmv*`). Коммит Фазы 0
убирает их из текущей версии, но **они остаются в истории git** и могли
быть скопированы. Выполните по порядку.

## 1. Сразу (5 минут)

- [ ] Сменить пароль мастера на проде:
      `DATABASE_URL="<direct-строка Neon>" bun run set-master`
      (новый пароль — из менеджера паролей, ≥ 16 символов).
- [ ] Если этот пароль использовался где-то ещё (почта, Neon, Vercel, GitHub) — сменить и там.
- [ ] Сбросить все активные сессии: в Neon SQL Editor
      `DELETE FROM "EmployeeSession"; DELETE FROM "ContractorSession"; DELETE FROM "ClientSession"; DELETE FROM "BrokerSession";`
     
- [ ] Решить, остаётся ли репозиторий публичным. Если нет — Settings → General → Danger Zone → Change visibility → Private.

## 2. Очистка истории git (15 минут, после мержа этого PR)

Переписывает историю — все копии репозитория нужно будет склонировать заново.

```bash
pip install git-filter-repo
git clone --mirror https://github.com/alfat81/logix.git logix-mirror
cd logix-mirror
git filter-repo --invert-paths \
  --path check-master-pass.js \
  --path-glob 'cmv*' \
  --path ROADMAP-v3.14.md
# вычистить строку пароля из всех оставшихся файлов истории:
echo '<старый пароль>==>[удалено]' > ../replace.txt   # подставить старый пароль целиком
git filter-repo --replace-text ../replace.txt
git push --force --mirror
```

- [ ] После force-push: GitHub → Settings → обратиться в поддержку GitHub с просьбой удалить кэшированные представления коммитов (для публичных репозиториев), либо сделать репозиторий приватным.
- [ ] Проверка: `gitleaks detect --source . --log-opts="--all"` — 0 находок.

## 3. CI (5 минут)

Все прогоны GitHub Actions до 23.10.2026 падали на шаге «Set up job». Причина
была в коде workflow: несуществующий action `oven/setup-bun` (правильно —
`oven-sh/setup-bun`). Исправлено в PR #2, аккаунт и биллинг ни при чём.

- [ ] После зелёного прогона: Settings → Branches → правило для `main`: «Require status checks to pass» (checks, e2e, gitleaks).

## 4. Перевод прод-базы на миграции

См. блок в начале `DEPLOY.md`: `db:baseline` один раз, дальше только `db:deploy`.
