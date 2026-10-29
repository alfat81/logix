-- DF-18 «Ответ брокера: коды ТН ВЭД и проценты» (D38) — additive:
-- новая таблица строк ответа + статус отправки на существующей оценке.
-- Существующие данные не трогаются: customsDutyEstimate становится
-- необязательным «итого, ₽» (карточка DF-18, шаг 2), старые ответы
-- (только сумма и список разрешительных) остаются валидными как есть.

-- CreateTable
CREATE TABLE "BrokerEstimateItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "hsCode" TEXT NOT NULL,
    "isManualCode" BOOLEAN NOT NULL DEFAULT false,
    "dutyPercent" DECIMAL(5,2),
    "addDutyPercent" DECIMAL(5,2),
    "addDutyNote" TEXT,
    "vatPercent" DECIMAL(5,2),
    "rateNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerEstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrokerEstimateItem_estimateId_sortOrder_idx" ON "BrokerEstimateItem"("estimateId", "sortOrder");

-- AddForeignKey
ALTER TABLE "BrokerEstimateItem" ADD CONSTRAINT "BrokerEstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "BrokerEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: статус ответа draft|sent (дефолт draft — существующие
-- ответы остаются черновиками, отправка не задним числом)
ALTER TABLE "BrokerEstimate" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';

-- AlterTable: момент ПЕРВОЙ отправки (не перезаписывается правками)
ALTER TABLE "BrokerEstimate" ADD COLUMN "sentAt" TIMESTAMP(3);
