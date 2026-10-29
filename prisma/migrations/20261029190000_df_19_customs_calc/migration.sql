-- DF-19 «Расчёт таможенных платежей в рублях по условиям поставки»
-- (D38/D39) — additive: таблицы расчёта (CustomsCalculation — снимок
-- входных данных, курсов и версии правил; строки по кодам ТН ВЭД —
-- проценты-снимок ответа брокера и результаты в рублях), шкала сборов
-- (CustomsFeeScale, редакции по validFrom) и nullable место условия
-- поставки на Lead/Order (expand). Существующие данные не трогаются.
-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "incotermPlace" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "incotermPlace" TEXT;

-- CreateTable
CREATE TABLE "CustomsCalculation" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "orderId" TEXT,
    "incoterm" TEXT NOT NULL,
    "incotermPlace" TEXT,
    "calcDate" TIMESTAMP(3) NOT NULL,
    "fxDate" DATE NOT NULL,
    "fxRates" JSONB NOT NULL,
    "fxReservePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "freightTotal" DECIMAL(14,2) NOT NULL,
    "freightCurrency" TEXT NOT NULL DEFAULT 'USD',
    "freightToArrival" DECIMAL(14,2),
    "insurance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherCosts" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "brokerFeeRub" DECIMAL(14,2),
    "allocationOverride" JSONB,
    "rulesVersion" TEXT NOT NULL,
    "feeRub" DECIMAL(14,2),
    "feeManual" BOOLEAN NOT NULL DEFAULT false,
    "totals" JSONB NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsCalculationItem" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "brokerItemId" TEXT,
    "hsCode" TEXT NOT NULL,
    "goodsValue" DECIMAL(14,2) NOT NULL,
    "goodsCurrency" TEXT NOT NULL,
    "netWeightKg" DECIMAL(12,3) NOT NULL,
    "dutyPercent" DECIMAL(5,2),
    "addDutyPercent" DECIMAL(5,2),
    "vatPercent" DECIMAL(5,2),
    "customsValue" DECIMAL(14,2) NOT NULL,
    "duty" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "addDuty" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedCosts" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "CustomsCalculationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsFeeScale" (
    "id" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "upperBound" DECIMAL(14,2),
    "feeRub" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomsFeeScale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomsCalculation_leadId_createdAt_idx" ON "CustomsCalculation"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomsCalculation_orderId_createdAt_idx" ON "CustomsCalculation"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomsCalculation_isCurrent_idx" ON "CustomsCalculation"("isCurrent");

-- CreateIndex
CREATE INDEX "CustomsCalculationItem_calculationId_sortOrder_idx" ON "CustomsCalculationItem"("calculationId", "sortOrder");

-- CreateIndex
CREATE INDEX "CustomsFeeScale_validFrom_idx" ON "CustomsFeeScale"("validFrom");

-- AddForeignKey
ALTER TABLE "CustomsCalculation" ADD CONSTRAINT "CustomsCalculation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsCalculation" ADD CONSTRAINT "CustomsCalculation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsCalculationItem" ADD CONSTRAINT "CustomsCalculationItem_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "CustomsCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
