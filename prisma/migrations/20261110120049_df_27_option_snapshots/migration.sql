-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "wishes" TEXT;

-- AlterTable
ALTER TABLE "QuoteOption" ADD COLUMN     "cargoSnapshot" JSONB,
ADD COLUMN     "editedFields" JSONB,
ADD COLUMN     "isPreliminary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missingData" JSONB,
ADD COLUMN     "priceReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "routeSnapshot" JSONB,
ADD COLUMN     "routeStops" JSONB,
ADD COLUMN     "sourceFields" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "updatedByName" TEXT;

-- CreateTable
CREATE TABLE "QuoteOptionCalcLine" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "article" TEXT NOT NULL,
    "title" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRateToOffer" DECIMAL(14,6),
    "amountOffer" DECIMAL(14,2),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "customsCalculationId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteOptionCalcLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteOptionRevision" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "changedFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteOptionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteOptionCalcLine_optionId_sortOrder_idx" ON "QuoteOptionCalcLine"("optionId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuoteOptionRevision_optionId_createdAt_idx" ON "QuoteOptionRevision"("optionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteOptionRevision_optionId_seq_key" ON "QuoteOptionRevision"("optionId", "seq");

-- AddForeignKey
ALTER TABLE "QuoteOptionCalcLine" ADD CONSTRAINT "QuoteOptionCalcLine_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOptionCalcLine" ADD CONSTRAINT "QuoteOptionCalcLine_customsCalculationId_fkey" FOREIGN KEY ("customsCalculationId") REFERENCES "CustomsCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOptionRevision" ADD CONSTRAINT "QuoteOptionRevision_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
