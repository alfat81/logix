-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL,
    "recipientId" TEXT,
  "toAddress" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "mode" TEXT NOT NULL,
    "eventId" TEXT,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "providerId" TEXT,
    "windowKey" TEXT,
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Notification_recipientKind_recipientId_createdAt_idx" ON "Notification"("recipientKind", "recipientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_recipientKind_recipientId_channel_key" ON "NotificationPreference"("recipientKind", "recipientId", "channel");
