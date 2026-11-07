-- DF-26 волна 2: единый центр документов — разрешительные проверки и
-- принятие (SPEC v1.6 §5, §10; решение D61). Additive: три новые
-- таблицы + nullable-колонки у PermitRequirement/Activity/
-- DocumentVersion + NOT NULL DEFAULT 'bound' у PermitRequirement.
-- Существующие строки не преобразуются; бэкафилы снимков — ТОЛЬКО из
-- исторических снимков (actorName/authorName/createdByName/
-- receivedByName записаны на момент действия), текущие профили не
-- читаются (§10.2/§10.3). Инварианты закрепляются физически
-- (замечание 1 ред. 1.3): CHECK «ровно одна цель» и частичные
-- уникальные индексы открытых записей — в НОВЫХ таблицах;
-- существующие таблицы новых ограничений не получают.

-- ── PermitCheck: проверка разрешительных по коду ТН ВЭД ────────────
-- Запись о РЕЗУЛЬТАТЕ (требование — PermitRequirement). Одна проверка
-- на пару (сделка, код) — результат свойства пары; охват позиций —
-- PermitCheckItem, требования — PermitCheckRequirement (ниже).
CREATE TABLE "PermitCheck" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "leadId" TEXT,
    "hsCode" TEXT NOT NULL,
    "reviewItemId" TEXT,
    "result" TEXT NOT NULL,
    "basis" TEXT,
    "dictionaryVersion" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "checkedByType" TEXT NOT NULL,
    "checkedById" TEXT,
    "checkedByName" TEXT NOT NULL,
    "checkedByUserName" TEXT,
    "checkedByCompanyName" TEXT,
    "reviewOfCheckId" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'none',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserName" TEXT,
    "reviewedByCompanyName" TEXT,
    "reviewOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitCheck_pkey" PRIMARY KEY ("id")
);

-- Инвариант «ровно одна цель» — ФИЗИЧЕСКИ (SPEC §5.1; у PermitRequirement/
-- Document он на уровне роутов, здесь — CHECK в новой таблице).
ALTER TABLE "PermitCheck" ADD CONSTRAINT "chk_permitcheck_one_target"
  CHECK (("orderId" IS NOT NULL AND "leadId" IS NULL) OR ("orderId" IS NULL AND "leadId" IS NOT NULL));

-- Инвариант 1: одна открытая auto-запись на пару (сделка, код).
-- Вторая INSERT получает 23505 — API обрабатывает как «уже есть»
-- (объединение, §11.2). Частичные индексы — только открытые записи;
-- закрытые (reviewed) в дедупликации не участвуют.
CREATE UNIQUE INDEX "uq_permitcheck_open_unclear_order"
  ON "PermitCheck"("orderId", "hsCode")
  WHERE "source" = 'auto' AND "result" = 'unclear' AND "reviewStatus" = 'none' AND "orderId" IS NOT NULL;
CREATE UNIQUE INDEX "uq_permitcheck_open_unclear_lead"
  ON "PermitCheck"("leadId", "hsCode")
  WHERE "source" = 'auto' AND "result" = 'unclear' AND "reviewStatus" = 'none' AND "leadId" IS NOT NULL;

-- Инвариант §5.7 п. 2а: одна открытая needs_review-запись на
-- (сделка, позиция) независимо от числа смен кода. NULLS NOT DISTINCT
-- покрывает сделочный пересмотр без позиции (reviewItemId = NULL).
CREATE UNIQUE INDEX "uq_permitcheck_open_review_order"
  ON "PermitCheck"("orderId", "reviewItemId") NULLS NOT DISTINCT
  WHERE "reviewStatus" = 'needs_review' AND "orderId" IS NOT NULL;
CREATE UNIQUE INDEX "uq_permitcheck_open_review_lead"
  ON "PermitCheck"("leadId", "reviewItemId") NULLS NOT DISTINCT
  WHERE "reviewStatus" = 'needs_review' AND "leadId" IS NOT NULL;

-- Обычные индексы — для выборок (уникальность открытых записей
-- обеспечивают только частичные индексы выше).
CREATE INDEX "PermitCheck_orderId_result_idx" ON "PermitCheck"("orderId", "result");
CREATE INDEX "PermitCheck_leadId_result_idx" ON "PermitCheck"("leadId", "result");
CREATE INDEX "PermitCheck_reviewStatus_idx" ON "PermitCheck"("reviewStatus");

ALTER TABLE "PermitCheck" ADD CONSTRAINT "PermitCheck_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitCheck" ADD CONSTRAINT "PermitCheck_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Пересмотр: проверка-предшественник. Ограничение RESTRICT — страховка:
-- API проверки не удаляет (§5.7 п. 5 — история не редактируется).
ALTER TABLE "PermitCheck" ADD CONSTRAINT "PermitCheck_reviewOfCheckId_fkey"
  FOREIGN KEY ("reviewOfCheckId") REFERENCES "PermitCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── PermitCheckItem: связь «проверка → охваченные позиции» ─────────
-- (замечание 2 ред. 1.4). itemId БЕЗ FK (паттерн PermitRequirement.itemId:
-- строки оценки пересоздаются/удаляются, охват открытой auto-записи
-- синхронизируется кодом — §5.7 п. 0а); UNIQUE пары — uq_permitcheckitem_pair.
CREATE TABLE "PermitCheckItem" (
    "id" TEXT NOT NULL,
    "permitCheckId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitCheckItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_permitcheckitem_pair"
  ON "PermitCheckItem"("permitCheckId", "itemId");
CREATE INDEX "PermitCheckItem_itemId_idx" ON "PermitCheckItem"("itemId");

ALTER TABLE "PermitCheckItem" ADD CONSTRAINT "PermitCheckItem_permitCheckId_fkey"
  FOREIGN KEY ("permitCheckId") REFERENCES "PermitCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── PermitCheckRequirement: связь «проверка → созданные требования» ─
-- (замечание 2 ред. 1.3). У каждого созданного проверкой требования
-- ровно одно происхождение (UNIQUE permitRequirementId); у позиции
-- может быть несколько требований — скаляра permitId у проверки нет.
CREATE TABLE "PermitCheckRequirement" (
    "id" TEXT NOT NULL,
    "permitCheckId" TEXT NOT NULL,
    "permitRequirementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitCheckRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PermitCheckRequirement_permitRequirementId_key"
  ON "PermitCheckRequirement"("permitRequirementId");
CREATE INDEX "PermitCheckRequirement_permitCheckId_idx"
  ON "PermitCheckRequirement"("permitCheckId");

ALTER TABLE "PermitCheckRequirement" ADD CONSTRAINT "PermitCheckRequirement_permitCheckId_fkey"
  FOREIGN KEY ("permitCheckId") REFERENCES "PermitCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitCheckRequirement" ADD CONSTRAINT "PermitCheckRequirement_permitRequirementId_fkey"
  FOREIGN KEY ("permitRequirementId") REFERENCES "PermitRequirement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── PermitRequirement: +10 nullable-колонок и bindingState (§10.2) ──
ALTER TABLE "PermitRequirement" ADD COLUMN "stageCode" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "PermitRequirement" ADD COLUMN "submittedByName" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "submittedByUserName" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "submittedByCompanyName" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "acceptedVersion" INTEGER;
ALTER TABLE "PermitRequirement" ADD COLUMN "createdByUserName" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "createdByCompanyName" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "receivedByUserName" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "receivedByCompanyName" TEXT;
ALTER TABLE "PermitRequirement" ADD COLUMN "bindingState" TEXT NOT NULL DEFAULT 'bound';

-- Состояние привязки: bound | pending_manual (SPEC §5.7 п. 0а).
-- bound + itemId = NULL — «ко всей сделке» (осознанное решение
-- сотрудника, единственный путь к NULL); pending_manual — строка
-- оценки удалена при дифф-сохранении, ссылка заморожена (не NULL).
ALTER TABLE "PermitRequirement" ADD CONSTRAINT "chk_permitreq_binding_state"
  CHECK ("bindingState" IN ('bound', 'pending_manual'));

-- ── Activity / DocumentVersion: двойные снимки (§6.1) ──────────────
ALTER TABLE "Activity" ADD COLUMN "actorUserName" TEXT;
ALTER TABLE "Activity" ADD COLUMN "actorCompanyName" TEXT;
ALTER TABLE "DocumentVersion" ADD COLUMN "authorUserName" TEXT;
ALTER TABLE "DocumentVersion" ADD COLUMN "authorCompanyName" TEXT;

-- ── Бэкафилы — только из достоверных исторических снимков (§10.3) ──
-- Правило (§10.2): client/broker → компания из снимка, имя NULL
-- (личность исторически неизвестна — честная деградация);
-- employee/contractor/system → имя из снимка, компания NULL
-- («Logix» задним числом не подставляется). Текущие профили
-- (CustomerUser/BrokerUser/Employee) НЕ читаются. Тип участника
-- строки требования — исторический createdByType (receivedByType не
-- записывался; у PermitRequirement приёмка исторически шла загрузкой
-- того же участника, что и строка — снимок receivedByName бэкафилится
-- по типу createdByType, прочие случаи остаются NULL).

UPDATE "PermitRequirement" SET
  "createdByUserName" = CASE WHEN "createdByType" IN ('client', 'broker') THEN NULL ELSE "createdByName" END,
  "createdByCompanyName" = CASE WHEN "createdByType" IN ('client', 'broker') THEN "createdByName" ELSE NULL END;
UPDATE "PermitRequirement" SET
  "receivedByUserName" = CASE
    WHEN "receivedByName" IS NULL THEN NULL
    WHEN "createdByType" IN ('client', 'broker') THEN NULL
    ELSE "receivedByName" END,
  "receivedByCompanyName" = CASE
    WHEN "receivedByName" IS NULL THEN NULL
    WHEN "createdByType" IN ('client', 'broker') THEN "receivedByName"
    ELSE NULL END;

UPDATE "Activity" SET
  "actorUserName" = CASE WHEN "actorType" IN ('employee', 'contractor', 'system') THEN "actorName" ELSE NULL END,
  "actorCompanyName" = CASE WHEN "actorType" IN ('client', 'broker') THEN "actorName" ELSE NULL END;

UPDATE "DocumentVersion" SET
  "authorUserName" = CASE WHEN "authorType" = 'employee' THEN "authorName" ELSE NULL END,
  "authorCompanyName" = CASE WHEN "authorType" IN ('client', 'broker') THEN "authorName" ELSE NULL END;

-- acceptedVersion: только достоверный случай — у связанного документа
-- единственная готовая версия (currentVersion = 1): какая версия была
-- принята исторически, недостоверно ни при каком другом раскладе
-- (§10.3 п. 3). Существующие received не переоткрываются.
UPDATE "PermitRequirement" p
SET "acceptedVersion" = d."currentVersion"
FROM "Document" d
WHERE p."documentId" = d."id"
  AND p."status" = 'received'
  AND d."currentVersion" = 1;
