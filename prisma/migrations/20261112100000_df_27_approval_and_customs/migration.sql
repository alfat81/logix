-- DF-27 волна 2 «Запрос, согласование, заказ, таможня» (Р-1/Р-3/Р-5 — D75; D73 — подготовка таблиц).
-- Additive: прежний код новые объекты не читает, backfill не требуется, откат не требуется.
-- Применяется владельцем по протоколу А с отдельного разрешения (техплан v1.3 §12.3).

-- AlterTable
ALTER TABLE "CustomsCalculation" ADD COLUMN     "origin" TEXT,
ADD COLUMN     "quoteOptionId" TEXT;

-- AlterTable
ALTER TABLE "LeadApprovalSnapshot" ADD COLUMN     "calcSnapshot" JSONB,
ADD COLUMN     "cargoSnapshot" JSONB,
ADD COLUMN     "customsCalculationId" TEXT,
ADD COLUMN     "printRevisionId" TEXT,
ADD COLUMN     "routeSnapshot" JSONB;

-- CreateTable
CREATE TABLE "LeadPrintRevision" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "leadSnapshot" JSONB NOT NULL,
    "renderedFileId" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadPrintRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadPrintRevisionConfirmation" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "partyRole" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "LeadPrintRevisionConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsFxRecalc" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "fxDate" DATE NOT NULL,
    "fxRates" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsFxRecalc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsFinalPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dtDate" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsFinalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadPrintRevision_leadId_createdAt_idx" ON "LeadPrintRevision"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadPrintRevision_leadId_seq_key" ON "LeadPrintRevision"("leadId", "seq");

-- CreateIndex
CREATE INDEX "LeadPrintRevisionConfirmation_revisionId_confirmedAt_idx" ON "LeadPrintRevisionConfirmation"("revisionId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadPrintRevisionConfirmation_revisionId_partyRole_key" ON "LeadPrintRevisionConfirmation"("revisionId", "partyRole");

-- CreateIndex
CREATE INDEX "CustomsFxRecalc_calculationId_createdAt_idx" ON "CustomsFxRecalc"("calculationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomsFinalPayment_orderId_createdAt_idx" ON "CustomsFinalPayment"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadApprovalSnapshot" ADD CONSTRAINT "LeadApprovalSnapshot_customsCalculationId_fkey" FOREIGN KEY ("customsCalculationId") REFERENCES "CustomsCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApprovalSnapshot" ADD CONSTRAINT "LeadApprovalSnapshot_printRevisionId_fkey" FOREIGN KEY ("printRevisionId") REFERENCES "LeadPrintRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsCalculation" ADD CONSTRAINT "CustomsCalculation_quoteOptionId_fkey" FOREIGN KEY ("quoteOptionId") REFERENCES "QuoteOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPrintRevision" ADD CONSTRAINT "LeadPrintRevision_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadPrintRevisionConfirmation" ADD CONSTRAINT "LeadPrintRevisionConfirmation_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "LeadPrintRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsFxRecalc" ADD CONSTRAINT "CustomsFxRecalc_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "CustomsCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsFinalPayment" ADD CONSTRAINT "CustomsFinalPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

