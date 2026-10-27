-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "stageId" TEXT;

-- DF-01 backfill: аудитория из текущей семантики видимости.
-- isInternal=true (заметки Ж3, события о внутренних документах) — только
-- staff; всё остальное — staff + client + broker: сегодня ленты читает
-- только staff (поведение чтения не меняется), DF-02 строит клиентскую/
-- брокерскую ленты на audience без второй миграции (D3: клиент видит всё
-- по своим сделкам, кроме внутреннего). Элементы — только из
-- staff|client|broker; 'contractor' не используется (D31).
UPDATE "Activity"
SET "audience" = CASE
  WHEN "isInternal" THEN ARRAY['staff']::TEXT[]
  ELSE ARRAY['staff', 'client', 'broker']::TEXT[]
END
WHERE "audience" = ARRAY[]::TEXT[];

-- Согласованность на будущее: пустая аудитория недопустима (событие
-- без зрителей = рудимент). cardinality(ARRAY[]::TEXT[]) = 0 — в отличие
-- от array_length, который для пустого массива возвращает NULL и
-- промолчал бы. Гарантию в коде даёт emitEvent (дефолт из EVENT_TYPES);
-- CHECK — страховка от ручных операций в БД. Все пути записи в коде
-- задают audience явно (emitEvent, logInternalNote).
ALTER TABLE "Activity"
  ADD CONSTRAINT "activity_audience_nonempty" CHECK (cardinality("audience") >= 1);
