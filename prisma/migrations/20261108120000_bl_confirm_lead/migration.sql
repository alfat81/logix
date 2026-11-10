-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "clientConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "clientConfirmedById" TEXT,
ADD COLUMN     "clientConfirmedByName" TEXT,
ADD COLUMN     "clientConfirmedVia" TEXT,
ADD COLUMN     "selectedOptionId" TEXT;

-- CreateTable
CREATE TABLE "LeadApprovalSnapshot" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionCreatedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "transportModes" JSONB,
    "price" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "vatMode" "VatMode" NOT NULL DEFAULT 'WITHOUT_VAT',
    "etaDays" INTEGER NOT NULL,
    "priorityFit" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "confirmedVia" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadApprovalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadApprovalSnapshot_leadId_idx" ON "LeadApprovalSnapshot"("leadId");

-- AddForeignKey
ALTER TABLE "LeadApprovalSnapshot" ADD CONSTRAINT "LeadApprovalSnapshot_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
