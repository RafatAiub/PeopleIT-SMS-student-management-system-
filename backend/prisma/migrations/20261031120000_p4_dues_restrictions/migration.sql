-- CreateTable
CREATE TABLE "FeeDuesSettings" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "restrictionsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minMonthsDue" INTEGER,
    "minAmountDue" DECIMAL(12,2),
    "overdueDays" INTEGER,
    "blockResults" BOOLEAN NOT NULL DEFAULT true,
    "blockAdmitCard" BOOLEAN NOT NULL DEFAULT true,
    "blockIdCard" BOOLEAN NOT NULL DEFAULT true,
    "blockPortalLogin" BOOLEAN NOT NULL DEFAULT false,
    "blockOnlineExam" BOOLEAN NOT NULL DEFAULT true,
    "restrictionMessage" TEXT,
    "smsTemplate" TEXT,
    "emailSubject" TEXT,
    "emailTemplate" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeDuesSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFeeStatus" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "monthsDue" INTEGER NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "oldestDueDate" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualState" TEXT,
    "manualReason" TEXT,
    "manualByUserId" TEXT,
    "manualAt" TIMESTAMP(3),
    "exempt" BOOLEAN NOT NULL DEFAULT false,
    "exemptReason" TEXT,
    "exemptByUserId" TEXT,
    "exemptAt" TIMESTAMP(3),
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeDuesReminderLog" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "segments" INTEGER,
    "monthsDue" INTEGER NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeDuesReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeDuesSettings_institutionId_key" ON "FeeDuesSettings"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFeeStatus_studentId_key" ON "StudentFeeStatus"("studentId");

-- CreateIndex
CREATE INDEX "StudentFeeStatus_institutionId_amountDue_idx" ON "StudentFeeStatus"("institutionId", "amountDue");

-- CreateIndex
CREATE INDEX "StudentFeeStatus_institutionId_manualState_idx" ON "StudentFeeStatus"("institutionId", "manualState");

-- CreateIndex
CREATE INDEX "FeeDuesReminderLog_institutionId_createdAt_idx" ON "FeeDuesReminderLog"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeDuesReminderLog_studentId_createdAt_idx" ON "FeeDuesReminderLog"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeDuesReminderLog_batchId_idx" ON "FeeDuesReminderLog"("batchId");

-- AddForeignKey
ALTER TABLE "FeeDuesSettings" ADD CONSTRAINT "FeeDuesSettings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeStatus" ADD CONSTRAINT "StudentFeeStatus_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeStatus" ADD CONSTRAINT "StudentFeeStatus_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDuesReminderLog" ADD CONSTRAINT "FeeDuesReminderLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeDuesReminderLog" ADD CONSTRAINT "FeeDuesReminderLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

