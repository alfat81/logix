-- DF-12: жизненный цикл документа (expand, без удалений).
-- Новые nullable-колонки Document: вид (D5), статус, снимок финализации,
-- привязка к этапу. Легаси `type` остаётся до contract-релиза (0.9.0).

ALTER TABLE "Document" ADD COLUMN "kind" TEXT;
ALTER TABLE "Document" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Document" ADD COLUMN "finalizedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "finalizedByName" TEXT;
ALTER TABLE "Document" ADD COLUMN "finalVersion" INTEGER;
ALTER TABLE "Document" ADD COLUMN "stageCode" TEXT;

-- Backfill вида из легаси-типа (карточка DF-12): invoice →
-- commercial_invoice, customs → customs_declaration, application →
-- client_request, permit → permit_document; contract — по признаку
-- видимости: внутренний договор типа contract в UI всегда означал
-- договор с подрядчиком → contractor_agreement, внешнему «чей это
-- договор» по данным не определить → other (безопасный нейтральный);
-- остальные → other.
UPDATE "Document" SET "kind" = CASE
  WHEN "type" = 'invoice' THEN 'commercial_invoice'
  WHEN "type" = 'customs' THEN 'customs_declaration'
  WHEN "type" = 'application' THEN 'client_request'
  WHEN "type" = 'permit' THEN 'permit_document'
  WHEN "type" = 'contract' AND "isInternal" THEN 'contractor_agreement'
  ELSE 'other'
END
WHERE "kind" IS NULL;
