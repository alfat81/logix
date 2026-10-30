-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "waitingOnId" TEXT,
ADD COLUMN     "waitingOnKind" TEXT,
ADD COLUMN     "waitingReason" TEXT,
ADD COLUMN     "waitingSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "waitingOnId" TEXT,
ADD COLUMN     "waitingOnKind" TEXT,
ADD COLUMN     "waitingReason" TEXT,
ADD COLUMN     "waitingSince" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Lead_waitingOnKind_waitingSince_idx" ON "Lead"("waitingOnKind", "waitingSince");

-- CreateIndex
CREATE INDEX "Order_waitingOnKind_waitingSince_idx" ON "Order"("waitingOnKind", "waitingSince");

-- DF-05: допустимые значения kind зафиксированы на уровне БД
-- (NULL разрешён = «ещё не пересчитано»; прецедент CHECK —
-- activity_audience_nonempty из df_01_event_audience).
ALTER TABLE "Lead" ADD CONSTRAINT "lead_waiting_kind_check"
  CHECK ("waitingOnKind" IS NULL OR "waitingOnKind" IN ('manager', 'client', 'broker', 'contractor', 'none'));
ALTER TABLE "Order" ADD CONSTRAINT "order_waiting_kind_check"
  CHECK ("waitingOnKind" IS NULL OR "waitingOnKind" IN ('manager', 'client', 'broker', 'contractor', 'none'));
