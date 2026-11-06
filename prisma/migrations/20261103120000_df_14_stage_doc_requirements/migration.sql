-- DF-14: чек-листы обязательных документов по этапам.
-- Новая таблица StageDocumentRequirement: какие виды документов нужны
-- для этапа каталога (stageCode — живой lookup по OrderStageCatalog,
-- как у OrderStageInstance), кто предоставляет и блокирует ли
-- завершение этапа. Additive, без удалений и правок существующих
-- колонок — код 0.8.5 работает и до применения (обращений к таблице
-- до этого релиза нет).

CREATE TABLE "StageDocumentRequirement" (
    "id" TEXT NOT NULL,
    "stageCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "providedBy" TEXT NOT NULL DEFAULT 'client',
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- Одна строка на пару этап+вид (чек-лист — множество, не счётчик;
-- несколько документов вида допустимы, требование — одно).
CREATE UNIQUE INDEX "StageDocumentRequirement_stageCode_kind_key"
  ON "StageDocumentRequirement"("stageCode", "kind");

CREATE INDEX "StageDocumentRequirement_stageCode_idx"
  ON "StageDocumentRequirement"("stageCode");

-- Дефолты чек-листа из D5/D35 (карточка DF-14, O-5): таможенный контур
-- обоих оформлений — декларация на товары и разрешительный документ,
-- предоставляет брокер (DF-13 DOCUMENT_KIND_PROVIDERS). Включаются
-- «рекомендуется» (isBlocking=false), пока владелец не подтвердит
-- блокировки; ON CONFLICT — сид повторяем без дублей.
INSERT INTO "StageDocumentRequirement" ("id", "stageCode", "kind", "providedBy", "isBlocking", "createdAt", "updatedAt")
VALUES
  (md5(random()::text || clock_timestamp()::text), 'import_customs', 'customs_declaration', 'broker', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5(random()::text || clock_timestamp()::text), 'import_customs', 'permit_document',     'broker', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5(random()::text || clock_timestamp()::text), 'export_customs', 'customs_declaration', 'broker', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5(random()::text || clock_timestamp()::text), 'export_customs', 'permit_document',     'broker', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("stageCode", "kind") DO NOTHING;
