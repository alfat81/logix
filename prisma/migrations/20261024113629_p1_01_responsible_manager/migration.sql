-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedToId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Order_assignedToId_idx" ON "Order"("assignedToId");

-- CreateIndex
CREATE INDEX "Order_updatedAt_idx" ON "Order"("updatedAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── P1-01: backfill — ответственный = создатель (из журнала) ────────
-- Существующие лиды/заявки получают ответственным сотрудника, который
-- их создал: самое раннее событие lead_created / order_created с
-- актёром-сотрудником (actorId — снимок создателя в Activity, Ж2).
-- DISTINCT ON (PostgreSQL): одна строка на сущность, tie-break по id
-- события при равенстве createdAt. Запросы из кабинета (И1, актёр
-- client) и «системные» события ответственного не дают — сущности
-- остаются NULL (фильтр «Без ответственного»). JOIN на Employee —
-- страховка: actorId в Activity без FK, битая/удалённая ссылка
-- молча пропускается вместо падения всей миграции.
UPDATE "Lead" SET "assignedToId" = sub."actorId"
FROM (
  SELECT DISTINCT ON (a."leadId") a."leadId" AS lid, a."actorId"
  FROM "Activity" a
  WHERE a."leadId" IS NOT NULL
    AND a."type" = 'lead_created'
    AND a."actorType" = 'employee'
    AND a."actorId" IS NOT NULL
  ORDER BY a."leadId", a."createdAt" ASC, a."id" ASC
) sub
JOIN "Employee" e ON e."id" = sub."actorId"
WHERE "Lead"."id" = sub."lid";

UPDATE "Order" SET "assignedToId" = sub."actorId"
FROM (
  SELECT DISTINCT ON (a."orderId") a."orderId" AS oid, a."actorId"
  FROM "Activity" a
  WHERE a."orderId" IS NOT NULL
    AND a."type" = 'order_created'
    AND a."actorType" = 'employee'
    AND a."actorId" IS NOT NULL
  ORDER BY a."orderId", a."createdAt" ASC, a."id" ASC
) sub
JOIN "Employee" e ON e."id" = sub."actorId"
WHERE "Order"."id" = sub."oid";
