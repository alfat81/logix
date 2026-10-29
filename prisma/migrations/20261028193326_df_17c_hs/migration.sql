-- CreateTable
CREATE TABLE "HsCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "unit" TEXT,
    "etdDutyText" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "sourceRev" TEXT NOT NULL,

    CONSTRAINT "HsCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HsImport" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HsImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HsCode_code_idx" ON "HsCode"("code");

-- CreateIndex
CREATE INDEX "HsCode_sourceRev_validTo_idx" ON "HsCode"("sourceRev", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "HsCode_code_sourceRev_key" ON "HsCode"("code", "sourceRev");

-- CreateIndex
CREATE UNIQUE INDEX "HsImport_version_key" ON "HsImport"("version");

-- CreateIndex
CREATE INDEX "HsImport_importedAt_idx" ON "HsImport"("importedAt");
