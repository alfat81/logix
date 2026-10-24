-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('auto', 'rail', 'sea', 'air', 'multimodal');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "destinationCity" TEXT,
ADD COLUMN     "destinationCountry" TEXT,
ADD COLUMN     "originCity" TEXT,
ADD COLUMN     "originCountry" TEXT,
ADD COLUMN     "placesCount" INTEGER,
ADD COLUMN     "readyDate" TIMESTAMP(3),
ADD COLUMN     "transportType" "TransportType",
ADD COLUMN     "volumeM3" DECIMAL(10,3),
ADD COLUMN     "weightKg" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "destinationCity" TEXT,
ADD COLUMN     "destinationCountry" TEXT,
ADD COLUMN     "originCity" TEXT,
ADD COLUMN     "originCountry" TEXT,
ADD COLUMN     "placesCount" INTEGER,
ADD COLUMN     "readyDate" TIMESTAMP(3),
ADD COLUMN     "transportType" "TransportType",
ADD COLUMN     "volumeM3" DECIMAL(10,3),
ADD COLUMN     "weightKg" DECIMAL(12,3);

-- CreateIndex
CREATE INDEX "Lead_transportType_idx" ON "Lead"("transportType");

-- CreateIndex
CREATE INDEX "Lead_originCountry_idx" ON "Lead"("originCountry");

-- CreateIndex
CREATE INDEX "Lead_destinationCountry_idx" ON "Lead"("destinationCountry");

-- CreateIndex
CREATE INDEX "Order_transportType_idx" ON "Order"("transportType");

-- CreateIndex
CREATE INDEX "Order_originCountry_idx" ON "Order"("originCountry");

-- CreateIndex
CREATE INDEX "Order_destinationCountry_idx" ON "Order"("destinationCountry");

-- ─── P1-03: backfill — перенос маршрута и метрик груза из Json ──────
-- from/to хранят свободный текст «Страна, город» (подсказка формы:
-- «Китай, Чэнду»): первая запятая = граница. Легаси-ключи origin/
-- destination (кабинет/старые данные) — fallback, когда from/to пусты.
-- transportType: словарь русских подписей формы → коды enum (битое
-- значение не валит миграцию — остаётся в Json до правки). Дата —
-- только строго yyyy-mm-dd; числа — только числовые строки.
-- Перенесённые ключи УДАЛЯЮТСЯ из Json (источник правды — колонки),
-- неизвестные ключи сохраняются, анкета получает маркер версии v: 1.

UPDATE "Lead" SET
  "originCity"         = r.o_city,
  "originCountry"      = r.o_country,
  "destinationCity"    = r.d_city,
  "destinationCountry" = r.d_country,
  "transportType"      = r.ttype::"TransportType",
  "readyDate"          = r.rdate::timestamp(3),
  "weightKg"           = r.wkg::numeric(12,3),
  "volumeM3"           = r.vol::numeric(10,3),
  "placesCount"        = r.places::int,
  "cargoInfo" = CASE
    WHEN "cargoInfo" IS NULL THEN NULL
    WHEN ("cargoInfo" - 'transportType' - 'from' - 'to' - 'shipDate'
              - 'weightKg' - 'volumeM3' - 'placesCount'
              - 'origin' - 'destination') = '{}'::jsonb THEN NULL
    ELSE ("cargoInfo" - 'transportType' - 'from' - 'to' - 'shipDate'
              - 'weightKg' - 'volumeM3' - 'placesCount'
              - 'origin' - 'destination') || '{"v": 1}'::jsonb
  END
FROM (
  SELECT
    l.id AS lid,
    CASE WHEN src.o LIKE '%,%' THEN btrim(split_part(src.o, ',', 1)) END AS o_country,
    CASE WHEN src.o LIKE '%,%' THEN btrim(substr(src.o, strpos(src.o, ',') + 1))
         WHEN src.o <> '' THEN src.o END AS o_city,
    CASE WHEN src.d LIKE '%,%' THEN btrim(split_part(src.d, ',', 1)) END AS d_country,
    CASE WHEN src.d LIKE '%,%' THEN btrim(substr(src.d, strpos(src.d, ',') + 1))
         WHEN src.d <> '' THEN src.d END AS d_city,
    CASE btrim(src.t)
      WHEN 'Авто' THEN 'auto' WHEN 'авто' THEN 'auto' WHEN 'auto' THEN 'auto'
      WHEN 'ЖД' THEN 'rail' WHEN 'жд' THEN 'rail' WHEN 'rail' THEN 'rail'
      WHEN 'Море' THEN 'sea' WHEN 'море' THEN 'sea' WHEN 'sea' THEN 'sea'
      WHEN 'Авиа' THEN 'air' WHEN 'авиа' THEN 'air' WHEN 'air' THEN 'air'
      WHEN 'Мультимодальная' THEN 'multimodal' WHEN 'Мультимодальный' THEN 'multimodal'
      WHEN 'мультимодальная' THEN 'multimodal' WHEN 'multimodal' THEN 'multimodal'
    END AS ttype,
    CASE WHEN l."cargoInfo"->>'shipDate' ~ '^\d{4}-\d{2}-\d{2}$'
         THEN l."cargoInfo"->>'shipDate' END AS rdate,
    CASE WHEN l."cargoInfo"->>'weightKg' ~ '^\d+(\.\d+)?$'
         THEN l."cargoInfo"->>'weightKg' END AS wkg,
    CASE WHEN l."cargoInfo"->>'volumeM3' ~ '^\d+(\.\d+)?$'
         THEN l."cargoInfo"->>'volumeM3' END AS vol,
    CASE WHEN l."cargoInfo"->>'placesCount' ~ '^\d+$'
         THEN l."cargoInfo"->>'placesCount' END AS places
  FROM "Lead" l
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(btrim(l."cargoInfo"->>'from'), btrim(l."cargoInfo"->>'origin'), '') AS o,
      COALESCE(btrim(l."cargoInfo"->>'to'), btrim(l."cargoInfo"->>'destination'), '') AS d,
      COALESCE(l."cargoInfo"->>'transportType', '') AS t
  ) src
) r
WHERE "Lead".id = r.lid;

UPDATE "Order" SET
  "originCity"         = r.o_city,
  "originCountry"      = r.o_country,
  "destinationCity"    = r.d_city,
  "destinationCountry" = r.d_country,
  "transportType"      = r.ttype::"TransportType",
  "readyDate"          = r.rdate::timestamp(3),
  "weightKg"           = r.wkg::numeric(12,3),
  "volumeM3"           = r.vol::numeric(10,3),
  "placesCount"        = r.places::int,
  "cargoInfo" = CASE
    WHEN "cargoInfo" IS NULL THEN NULL
    WHEN ("cargoInfo" - 'transportType' - 'from' - 'to' - 'shipDate'
              - 'weightKg' - 'volumeM3' - 'placesCount'
              - 'origin' - 'destination') = '{}'::jsonb THEN NULL
    ELSE ("cargoInfo" - 'transportType' - 'from' - 'to' - 'shipDate'
              - 'weightKg' - 'volumeM3' - 'placesCount'
              - 'origin' - 'destination') || '{"v": 1}'::jsonb
  END
FROM (
  SELECT
    o.id AS oid,
    CASE WHEN src.o LIKE '%,%' THEN btrim(split_part(src.o, ',', 1)) END AS o_country,
    CASE WHEN src.o LIKE '%,%' THEN btrim(substr(src.o, strpos(src.o, ',') + 1))
         WHEN src.o <> '' THEN src.o END AS o_city,
    CASE WHEN src.d LIKE '%,%' THEN btrim(split_part(src.d, ',', 1)) END AS d_country,
    CASE WHEN src.d LIKE '%,%' THEN btrim(substr(src.d, strpos(src.d, ',') + 1))
         WHEN src.d <> '' THEN src.d END AS d_city,
    CASE btrim(src.t)
      WHEN 'Авто' THEN 'auto' WHEN 'авто' THEN 'auto' WHEN 'auto' THEN 'auto'
      WHEN 'ЖД' THEN 'rail' WHEN 'жд' THEN 'rail' WHEN 'rail' THEN 'rail'
      WHEN 'Море' THEN 'sea' WHEN 'море' THEN 'sea' WHEN 'sea' THEN 'sea'
      WHEN 'Авиа' THEN 'air' WHEN 'авиа' THEN 'air' WHEN 'air' THEN 'air'
      WHEN 'Мультимодальная' THEN 'multimodal' WHEN 'Мультимодальный' THEN 'multimodal'
      WHEN 'мультимодальная' THEN 'multimodal' WHEN 'multimodal' THEN 'multimodal'
    END AS ttype,
    CASE WHEN o."cargoInfo"->>'shipDate' ~ '^\d{4}-\d{2}-\d{2}$'
         THEN o."cargoInfo"->>'shipDate' END AS rdate,
    CASE WHEN o."cargoInfo"->>'weightKg' ~ '^\d+(\.\d+)?$'
         THEN o."cargoInfo"->>'weightKg' END AS wkg,
    CASE WHEN o."cargoInfo"->>'volumeM3' ~ '^\d+(\.\d+)?$'
         THEN o."cargoInfo"->>'volumeM3' END AS vol,
    CASE WHEN o."cargoInfo"->>'placesCount' ~ '^\d+$'
         THEN o."cargoInfo"->>'placesCount' END AS places
  FROM "Order" o
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(btrim(o."cargoInfo"->>'from'), btrim(o."cargoInfo"->>'origin'), '') AS o,
      COALESCE(btrim(o."cargoInfo"->>'to'), btrim(o."cargoInfo"->>'destination'), '') AS d,
      COALESCE(o."cargoInfo"->>'transportType', '') AS t
  ) src
) r
WHERE "Order".id = r.oid;
