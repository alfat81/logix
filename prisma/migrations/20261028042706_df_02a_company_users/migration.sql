-- DF-02A «Сотрудники клиентов и брокеров: отдельные входы внутри
-- компании» (D34, пересмотр P1-07). Обе таблицы НОВЫЕ, колонки сессий
-- nullable — expand-безопасно: старый код новые объекты не трогает,
-- совместимость с v0.6.1 полная. Пользователь кабинета — контакт
-- компании с признаком «есть вход» (параллельную модель контактов не
-- создаём); CRUD — общая точка src/lib/company-users.ts. Старые поля
-- Customer.password / Broker.phone+password остаются до contract-релиза
-- (docs/DEPRECATIONS.md), вход по старым данным продолжает работать.
--
-- AlterTable: сессии получают пользователя (nullable — переходный
-- период, см. комментарий схемы; backfill ниже заполняет сразу).
ALTER TABLE "ClientSession" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "BrokerSession" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "CustomerUser" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerUser" (
    "id" TEXT NOT NULL,
    "brokerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "BrokerUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerUser_customerId_idx" ON "CustomerUser"("customerId");

-- CreateIndex
CREATE INDEX "CustomerUser_phone_idx" ON "CustomerUser"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerUser_phone_key" ON "BrokerUser"("phone");

-- CreateIndex
CREATE INDEX "BrokerUser_brokerId_idx" ON "BrokerUser"("brokerId");

-- CreateIndex
CREATE INDEX "ClientSession_userId_idx" ON "ClientSession"("userId");

-- CreateIndex
CREATE INDEX "BrokerSession_userId_idx" ON "BrokerSession"("userId");

-- AddForeignKey
ALTER TABLE "ClientSession" ADD CONSTRAINT "ClientSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerSession" ADD CONSTRAINT "BrokerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "BrokerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerUser" ADD CONSTRAINT "BrokerUser_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Backfill: основные пользователи из старого входа компании ─────
-- Для каждой компании с выданным доступом создаётся основной
-- пользователь из ТЕКУЩИХ логина и пароля; хеш переносится КАК ЕСТЬ
-- (критерий приёмки DF-02A: существующие клиенты и брокеры продолжают
-- входить без смены паролей). Личность человека системе не известна —
-- именем служит имя компании, менеджер поправит его в карточке
-- (админ-UI списка людей). Идентификатор детерминированный (md5 от id
-- компании с префиксом; подчёркивание исключает коллизию с cuid) —
-- повторный прогон SELECT даёт те же id, в журнале видна связка
-- «компания → пользователь». lastLoginAt не восстанавливается:
-- истории входов на уровне людей раньше не было.

INSERT INTO "CustomerUser" ("id", "customerId", "name", "phone", "email", "password", "isPrimary", "isActive", "createdAt", "lastLoginAt")
SELECT
  'cu1_' || md5(c."id"),
  c."id",
  c."name",
  c."phone",
  c."email",
  c."password",
  TRUE,
  c."isActive",
  c."createdAt",
  NULL
FROM "Customer" c
WHERE c."password" IS NOT NULL;

-- Брокера без пароля не существует (Broker.password NOT NULL) —
-- основной пользователь создаётся каждому брокеру справочника.
-- Email у брокера нет (контактное лицо — contactInfo Json, структура
-- не фиксирована) — остаётся NULL, менеджер заполнит в карточке.
INSERT INTO "BrokerUser" ("id", "brokerId", "name", "phone", "email", "password", "isPrimary", "isActive", "createdAt", "lastLoginAt")
SELECT
  'bu1_' || md5(b."id"),
  b."id",
  b."companyName",
  b."phone",
  NULL,
  b."password",
  TRUE,
  b."isActive",
  b."createdAt",
  NULL
FROM "Broker" b;

-- Существующие сессии созданы старым входом компании — их «владелец»
-- известен сразу: основной пользователь компании (сессии без компании
-- существовать не могут). После этого null в userId возможен только
-- в окне деплоя (код ещё не пишет пользователя в сессию).
UPDATE "ClientSession" s
SET "userId" = cu."id"
FROM "CustomerUser" cu
WHERE cu."customerId" = s."customerId" AND cu."isPrimary";

UPDATE "BrokerSession" s
SET "userId" = bu."id"
FROM "BrokerUser" bu
WHERE bu."brokerId" = s."brokerId" AND bu."isPrimary";
