-- CreateTable
CREATE TABLE "StudentFeeSettings" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT false,
    "generateDay" INTEGER NOT NULL DEFAULT 1,
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "monthlyCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "arrearsMode" TEXT NOT NULL DEFAULT 'SEPARATE',
    "fineCategoryId" TEXT,
    "lastAutoPeriod" TEXT,
    "lastAutoRunAt" TIMESTAMP(3),
    "lastRunSummary" JSONB,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFeeProfile" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeCategoryId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'MONTHLY',
    "monthlyAmount" DECIMAL(12,2),
    "yearlyAmount" DECIMAL(12,2),
    "yearlyMode" TEXT NOT NULL DEFAULT 'SPREAD',
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePeriod" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MONTHLY',
    "activeKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateFineRule" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "feeCategoryId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'FLAT',
    "value" DECIMAL(12,2) NOT NULL,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'ONCE',
    "maxAmount" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LateFineRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceFine" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "fineKey" TEXT NOT NULL,
    "ruleId" TEXT,
    "invoiceItemId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "waivedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "waivedAt" TIMESTAMP(3),
    "waivedByUserId" TEXT,
    "waiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceFine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReversal" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "appliedAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "reversedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeRefund" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "source" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeAdjustment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentFeeSettings_institutionId_key" ON "StudentFeeSettings"("institutionId");

-- CreateIndex
CREATE INDEX "StudentFeeProfile_institutionId_studentId_idx" ON "StudentFeeProfile"("institutionId", "studentId");

-- CreateIndex
CREATE INDEX "StudentFeeProfile_studentId_feeCategoryId_idx" ON "StudentFeeProfile"("studentId", "feeCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePeriod_invoiceId_key" ON "InvoicePeriod"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePeriod_activeKey_key" ON "InvoicePeriod"("activeKey");

-- CreateIndex
CREATE INDEX "InvoicePeriod_institutionId_period_idx" ON "InvoicePeriod"("institutionId", "period");

-- CreateIndex
CREATE INDEX "InvoicePeriod_studentId_period_idx" ON "InvoicePeriod"("studentId", "period");

-- CreateIndex
CREATE INDEX "LateFineRule_institutionId_idx" ON "LateFineRule"("institutionId");

-- CreateIndex
CREATE INDEX "InvoiceFine_institutionId_createdAt_idx" ON "InvoiceFine"("institutionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceFine_invoiceId_fineKey_key" ON "InvoiceFine"("invoiceId", "fineKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversal_paymentId_key" ON "PaymentReversal"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentReversal_institutionId_createdAt_idx" ON "PaymentReversal"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentReversal_invoiceId_idx" ON "PaymentReversal"("invoiceId");

-- CreateIndex
CREATE INDEX "FeeRefund_institutionId_createdAt_idx" ON "FeeRefund"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeRefund_paymentId_idx" ON "FeeRefund"("paymentId");

-- CreateIndex
CREATE INDEX "FeeRefund_studentId_idx" ON "FeeRefund"("studentId");

-- CreateIndex
CREATE INDEX "FeeAdjustment_institutionId_createdAt_idx" ON "FeeAdjustment"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "FeeAdjustment_invoiceId_idx" ON "FeeAdjustment"("invoiceId");

-- AddForeignKey
ALTER TABLE "StudentFeeSettings" ADD CONSTRAINT "StudentFeeSettings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeProfile" ADD CONSTRAINT "StudentFeeProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFeeProfile" ADD CONSTRAINT "StudentFeeProfile_feeCategoryId_fkey" FOREIGN KEY ("feeCategoryId") REFERENCES "FeeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePeriod" ADD CONSTRAINT "InvoicePeriod_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFineRule" ADD CONSTRAINT "LateFineRule_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateFineRule" ADD CONSTRAINT "LateFineRule_feeCategoryId_fkey" FOREIGN KEY ("feeCategoryId") REFERENCES "FeeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceFine" ADD CONSTRAINT "InvoiceFine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeRefund" ADD CONSTRAINT "FeeRefund_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT "FeeAdjustment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

