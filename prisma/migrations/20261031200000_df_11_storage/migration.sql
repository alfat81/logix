-- DF-11 «Хранилище файлов» (ROADMAP-DEALFLOW, карточка DF-11): expand-миграция,
-- только новые nullable-колонки и дефолт (RULES 2.2 п.4, заморозка схемы 2.16).
-- Легаси-строки (файл в БД) становятся ready автоматически — они скачиваются
-- из fileData, пока скрипт scripts/migrate-files-to-storage.ts не перенесёт
-- их в хранилище. Обратная совместимость с кодом 0.7.15: старый код читает
-- fileData у всех строк, новые pending-строки в 0.7.15 не создаются.
ALTER TABLE "DocumentVersion" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "DocumentVersion" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "DocumentVersion" ALTER COLUMN "fileData" DROP NOT NULL;

-- DF-11: индекс фоновой уборки — скрипт переноса и prune ищут зависшие
-- pending-строки по статусу (таблица небольшая, индекс частичный).
CREATE INDEX "DocumentVersion_status_pending_idx"
  ON "DocumentVersion" ("status")
  WHERE "status" = 'pending';
