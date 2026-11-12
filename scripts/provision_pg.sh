#!/usr/bin/env bash
# TU-01: восстановление локального PostgreSQL для интеграционных тестов
# (vitest 44 интеграционных теста + IC-01 prisma validate) после
# перезапуска песочницы: процессы и одноразовые каталоги не сохраняются.
# Архитектура та же, что в scripts/gate1_full.sh / gate2_smoke.sh:
# embedded-бинарники PostgreSQL (zonky) в .pg/, БД logix@127.0.0.1:5432.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_URL='postgresql://logix@127.0.0.1:5432/logix?schema=public'

# 1. Бинарники (если нет — скачать jar zonky и распаковать)
if [ ! -x .pg/bin/pg_ctl ]; then
  mkdir -p .pg
  JAR="embedded-postgres-binaries-linux-amd64-16.4.0.jar"
  URL="https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-linux-amd64/16.4.0/$JAR"
  echo "Скачиваю $URL"
  curl -fsSL -o ".pg/$JAR" "$URL"
  (cd .pg && unzip -o -q "$JAR" postgres-linux-x86_64.txz && tar -xJf postgres-linux-x86_64.txz && rm postgres-linux-x86_64.txz)
  # jar распаковывается в .pg (bin/, lib/) — приводим к схеме gate-скриптов
  mkdir -p .pg/bin
  [ -d .pg/bin ] || true
  echo "Бинарники распакованы"
fi

# 2. Инициализация кластера (superuser logix — как в DATABASE_URL gate-скриптов)
if [ ! -d .pg/data ]; then
  LD_LIBRARY_PATH="$(pwd)/.pg/lib" .pg/bin/initdb -D .pg/data -U logix -A trust -E UTF8 >/dev/null
  echo "Кластер инициализирован (user logix)"
fi

# 3. Запуск
if ! LD_LIBRARY_PATH="$(pwd)/.pg/lib" .pg/bin/pg_ctl -D .pg/data status >/dev/null 2>&1; then
  LD_LIBRARY_PATH="$(pwd)/.pg/lib" .pg/bin/pg_ctl -D .pg/data -l .pg/postgres.log \
    -o "-p 5432 -k /tmp -c listen_addresses=127.0.0.1" start >/dev/null
  echo "PostgreSQL запущен (127.0.0.1:5432)"
fi

# 4. База logix — создаётся автоматически на шаге миграций (prisma migrate
#    deploy создаёт целевую БД при отсутствии; zonky-набор 16.4 не содержит
#    psql/createdb — клиентские утилиты не нужны)

# 5. .env (только если отсутствует или это заглушка не-postgres)
if ! grep -q "^DATABASE_URL=postgresql://" .env 2>/dev/null; then
  {
    echo "DATABASE_URL=$PG_URL"
    echo "TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "CRON_SECRET=$(openssl rand -hex 16)"
  } > .env
  echo ".env записан (DATABASE_URL postgres, ключи сгенерированы)"
fi

# 6. Схема (миграции)
DATABASE_URL="$PG_URL" npx prisma migrate deploy 2>&1 | tail -2
echo "OK: локальный PostgreSQL готов (vitest integration + IC-01)"
