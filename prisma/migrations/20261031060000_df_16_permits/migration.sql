-- DF-16 «Разрешительные документы: обязательства и напоминания» (D35)
-- additive: таблица PermitRequirement (цель — ровно одна из Lead/Order;
-- providedBy client|broker|staff; status pending|received|waived) и
-- ПЕРЕНОС ДАННЫХ: свободный список разрешительных из ответа брокера
-- (BrokerEstimate.requiredPermits, Json-массив строк) превращается в
-- строки PermitRequirement (карточка DF-16: «expand → миграция данных»).
-- Само поле requiredPermits остаётся (контракт PUT оценки не ломается)
-- до contract-релиза — запись в docs/DEPRECATIONS.md.
--
-- Правила переноса:
--  • цель — заявка, если лид уже конвертирован (won), иначе запрос
--    (ровно одна цель, инвариант как у Document/Activity);
--  • providedBy='client' (разрешительные чаще всего обязан предоставить
--    импортёр; сотрудник правит строкой при необходимости — это
--    осознанное допущение, зафиксировано в отчёте релиза);
--  • isBlocking=false, neededBy NULL (сроки в свободном списке не были),
--    status='pending', source='estimate', staffNote NULL;
--  • автор — брокер, писавший оценку (createdByType='broker',
--    createdById/Name — снимок компании брокера со связи LeadBroker);
--  • лиды в отказе (lost) пропускаются — обязательства потерянной
--    сделки напоминаниями не считаются;
--  • дедупликация по паре (сделка, lower(title)): два брокера, указавшие
--    один и тот же документ, дают одну строку; пустые и пробельные
--    пункты списка не переносятся.
-- Идемпотентность миграции обеспечивается журналом _prisma_migrations
-- (migrate deploy выполняет её один раз).

-- CreateTable
CREATE TABLE "PermitRequirement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "providedBy" TEXT NOT NULL,
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "neededBy" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "documentId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedByName" TEXT,
    "waivedReason" TEXT,
    "staffNote" TEXT,
    "itemId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdByType" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermitRequirement_orderId_status_idx" ON "PermitRequirement"("orderId", "status");

-- CreateIndex
CREATE INDEX "PermitRequirement_leadId_status_idx" ON "PermitRequirement"("leadId", "status");

-- AddForeignKey
ALTER TABLE "PermitRequirement" ADD CONSTRAINT "PermitRequirement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitRequirement" ADD CONSTRAINT "PermitRequirement_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Перенос данных: requiredPermits (Json) → строки PermitRequirement ──
INSERT INTO "PermitRequirement" (
    "id", "leadId", "orderId", "title", "providedBy", "isBlocking", "status",
    "createdByType", "createdById", "createdByName", "source", "createdAt", "updatedAt"
)
SELECT DISTINCT ON (
    COALESCE(o."id", lb."leadId"),
    lower(btrim(j.permit))
)
    'c' || substr(md5('df16' || be."id" || '#' || lower(btrim(j.permit))), 1, 24),
    CASE WHEN o."id" IS NULL THEN lb."leadId" END,
    o."id",
    btrim(j.permit),
    'client',
    false,
    'pending',
    'broker',
    lb."brokerId",
    b."companyName",
    'estimate',
    now(),
    now()
FROM "BrokerEstimate" be
JOIN "LeadBroker" lb ON be."leadBrokerId" = lb."id"
JOIN "Broker" b ON lb."brokerId" = b."id"
JOIN "Lead" l ON lb."leadId" = l."id"
LEFT JOIN "Order" o ON o."leadId" = l."id"
CROSS JOIN LATERAL jsonb_array_elements_text(be."requiredPermits") AS j(permit)
WHERE jsonb_typeof(be."requiredPermits") = 'array'
  AND l."status" <> 'lost'
  AND NULLIF(btrim(j.permit), '') IS NOT NULL
ORDER BY COALESCE(o."id", lb."leadId"), lower(btrim(j.permit)), be."createdAt" ASC;
