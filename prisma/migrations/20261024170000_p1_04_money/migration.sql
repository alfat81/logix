-- P1-04 «Деньги: валюта, НДС, себестоимость» (RULES 2.15, D19, D22)
-- Все денежные поля — Decimal + код валюты; float и «рубли по
-- умолчанию» запрещены. Существующие цены (целые рубли) становятся
-- Decimal с валютой RUB — значения не теряются, backfill не нужен.

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('RUB', 'USD', 'EUR', 'CNY');

-- CreateEnum
CREATE TYPE "VatMode" AS ENUM ('WITH_VAT', 'WITHOUT_VAT', 'ZERO_VAT');

-- QuoteOption: цена клиенту → Decimal; себестоимость — отдельные
-- колонки (D19: цена клиенту и себестоимость хранятся раздельно,
-- маржа не вычисляется). vatMode — метка цены, НЕ расчёт.
ALTER TABLE "QuoteOption" RENAME COLUMN "priceEstimate" TO "price";
ALTER TABLE "QuoteOption" ALTER COLUMN "price" TYPE DECIMAL(14,2);
ALTER TABLE "QuoteOption" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'RUB',
ADD COLUMN     "vatMode" "VatMode" NOT NULL DEFAULT 'WITHOUT_VAT',
ADD COLUMN     "costEstimate" DECIMAL(14,2),
ADD COLUMN     "costCurrency" "Currency" NOT NULL DEFAULT 'RUB';

-- BrokerEstimate: таможенные платежи → Decimal по 2.15 (все деньги —
-- Decimal). Валюта — RUB по природе платежа (ТК ЕАЭС), отдельный код
-- не нужен; значения сохраняются.
ALTER TABLE "BrokerEstimate" ALTER COLUMN "customsDutyEstimate" TYPE DECIMAL(14,2);
