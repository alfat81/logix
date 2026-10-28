-- DF-17: справочники и курсы (D37, O-10) — additive, откат без потерь.
-- RefItem — универсальная таблица небольших справочников (страны,
-- валюты, упаковка, Инкотермс); CurrencyRate — официальные курсы ЦБ РФ
-- (импорт проходом диспетчера, идемпотентен по (date, code)).
-- Код-колонки Lead/Order — рядом со строковыми (expand); строковые
-- НЕ трогаем, backfill по совпадению названий — в seed (после наполнения
-- справочника; несовпавшее остаётся текстом).

-- ── RefItem ─────────────────────────────────────────────────────────
CREATE TABLE "RefItem" (
    "id" TEXT NOT NULL,
    "dir" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "meta" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefItem_dir_code_key" ON "RefItem"("dir" ASC, "code" ASC);
CREATE INDEX "RefItem_dir_isActive_idx" ON "RefItem"("dir" ASC, "isActive" ASC);

-- ── CurrencyRate ────────────────────────────────────────────────────
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "code" TEXT NOT NULL,
    "nominal" INTEGER NOT NULL DEFAULT 1,
    "value" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CurrencyRate_date_code_key" ON "CurrencyRate"("date" ASC, "code" ASC);
CREATE INDEX "CurrencyRate_code_date_idx" ON "CurrencyRate"("code" ASC, "date" ASC);

-- ── Код-колонки Lead/Order (nullable, без FK — справочник живёт
--    дольше снимков, паттерн кодов этапов stageCode) ──────────────────
ALTER TABLE "Lead" ADD COLUMN "originCountryCode" TEXT;
ALTER TABLE "Lead" ADD COLUMN "destinationCountryCode" TEXT;
ALTER TABLE "Lead" ADD COLUMN "incotermCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "originCountryCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "destinationCountryCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "incotermCode" TEXT;

-- ── Backfill Инкотермс: легаси-текст колонки incoterm уже хранит код
--    (литеральный список EXW…CIF в UI писал коды) — переносим в код-
--    колонку 1:1. Строку НЕ очищаем: она остаётся снимком-подсказкой.
UPDATE "Order" SET "incotermCode" = "incoterm"
WHERE "incoterm" IN ('EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF')
  AND "incotermCode" IS NULL;

-- ── Валюты: enum Currency → TEXT (DF-17) ────────────────────────────
-- Валюты выбираются из справочника (ISO 4217): фиксированная четвёрка
-- больше не отвечает составу сделок. Конвертация без потерь: значения
-- уже строки ('RUB'…), тип меняется, данные не трогаются.
ALTER TABLE "QuoteOption" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "QuoteOption" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;
ALTER TABLE "QuoteOption" ALTER COLUMN "currency" SET DEFAULT 'RUB';
ALTER TABLE "QuoteOption" ALTER COLUMN "costCurrency" DROP DEFAULT;
ALTER TABLE "QuoteOption" ALTER COLUMN "costCurrency" TYPE TEXT USING "costCurrency"::text;
ALTER TABLE "QuoteOption" ALTER COLUMN "costCurrency" SET DEFAULT 'RUB';
DROP TYPE "Currency";
