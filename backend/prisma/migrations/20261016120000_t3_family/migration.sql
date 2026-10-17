-- T3: Family profile (all schools, no module switch).
-- Additive: 6 tenant-scoped tables (Family, FamilyGuardian, FamilyStudent,
-- FamilyNote, FamilyPayment, FamilyPaymentAllocation) + a data backfill at
-- the end. No existing table or column is altered.

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryGuardianId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyGuardian" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyStudent" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyStudent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyNote" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyPayment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "familyId" TEXT,
    "source" TEXT NOT NULL,
    "gateway" "FeeGateway",
    "method" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "FeeTxnStatus" NOT NULL DEFAULT 'INITIATED',
    "gatewayTransactionId" TEXT,
    "gatewayPaymentId" TEXT,
    "gatewayValId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "rawResponse" JSONB,
    "transactionRef" TEXT,
    "notes" TEXT,
    "initiatedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyPaymentAllocation" (
    "id" TEXT NOT NULL,
    "familyPaymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentId" TEXT,

    CONSTRAINT "FamilyPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Family_institutionId_name_idx" ON "Family"("institutionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyGuardian_guardianId_key" ON "FamilyGuardian"("guardianId");

-- CreateIndex
CREATE INDEX "FamilyGuardian_familyId_idx" ON "FamilyGuardian"("familyId");

-- CreateIndex
CREATE INDEX "FamilyGuardian_institutionId_idx" ON "FamilyGuardian"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyStudent_studentId_key" ON "FamilyStudent"("studentId");

-- CreateIndex
CREATE INDEX "FamilyStudent_familyId_idx" ON "FamilyStudent"("familyId");

-- CreateIndex
CREATE INDEX "FamilyStudent_institutionId_idx" ON "FamilyStudent"("institutionId");

-- CreateIndex
CREATE INDEX "FamilyNote_familyId_createdAt_idx" ON "FamilyNote"("familyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyPayment_gatewayTransactionId_key" ON "FamilyPayment"("gatewayTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyPayment_gatewayValId_key" ON "FamilyPayment"("gatewayValId");

-- CreateIndex
CREATE INDEX "FamilyPayment_institutionId_createdAt_idx" ON "FamilyPayment"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "FamilyPayment_familyId_idx" ON "FamilyPayment"("familyId");

-- CreateIndex
CREATE INDEX "FamilyPayment_status_idx" ON "FamilyPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyPaymentAllocation_paymentId_key" ON "FamilyPaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "FamilyPaymentAllocation_invoiceId_idx" ON "FamilyPaymentAllocation"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyPaymentAllocation_familyPaymentId_invoiceId_key" ON "FamilyPaymentAllocation"("familyPaymentId", "invoiceId");

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_primaryGuardianId_fkey" FOREIGN KEY ("primaryGuardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyGuardian" ADD CONSTRAINT "FamilyGuardian_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyGuardian" ADD CONSTRAINT "FamilyGuardian_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyGuardian" ADD CONSTRAINT "FamilyGuardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyStudent" ADD CONSTRAINT "FamilyStudent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyStudent" ADD CONSTRAINT "FamilyStudent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyStudent" ADD CONSTRAINT "FamilyStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyNote" ADD CONSTRAINT "FamilyNote_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyNote" ADD CONSTRAINT "FamilyNote_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyPayment" ADD CONSTRAINT "FamilyPayment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyPayment" ADD CONSTRAINT "FamilyPayment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyPaymentAllocation" ADD CONSTRAINT "FamilyPaymentAllocation_familyPaymentId_fkey" FOREIGN KEY ("familyPaymentId") REFERENCES "FamilyPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyPaymentAllocation" ADD CONSTRAINT "FamilyPaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyPaymentAllocation" ADD CONSTRAINT "FamilyPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =============================================================================
-- Backfill: one family per anchor guardian (keep in sync with
-- src/modules/families/families.sync.ts and tests/family-backfill SQL).
--   * A student's anchor = its primary guardian (GuardianStudent.isPrimary),
--     else its earliest linked guardian (Guardian.createdAt, then id).
--   * Students sharing an anchor form one family, named "<anchor> family",
--     with the anchor as primary guardian.
--   * Every other guardian linked to those students joins a family too:
--     the one they anchor, else the first (by id) of their children's families.
--   * Guardians/students from another institution are never mixed.
-- Deterministic ids (md5 of the anchor/member id) make the backfill safe to
-- re-run (ON CONFLICT DO NOTHING).
-- =============================================================================

WITH anchor AS (
  SELECT DISTINCT ON (gs."studentId") gs."studentId", gs."guardianId", s."institutionId"
  FROM "GuardianStudent" gs
  JOIN "Student" s ON s."id" = gs."studentId"
  JOIN "Guardian" g ON g."id" = gs."guardianId" AND g."institutionId" = s."institutionId"
  ORDER BY gs."studentId", gs."isPrimary" DESC, g."createdAt" ASC, g."id" ASC
)
INSERT INTO "Family" ("id", "institutionId", "name", "primaryGuardianId", "source", "createdAt", "updatedAt")
SELECT DISTINCT 'fam_' || md5(a."guardianId"), a."institutionId",
       left(trim(g."firstName" || ' ' || g."lastName"), 100) || ' family', a."guardianId", 'AUTO', now(), now()
FROM anchor a
JOIN "Guardian" g ON g."id" = a."guardianId"
ON CONFLICT ("id") DO NOTHING;

WITH anchor AS (
  SELECT DISTINCT ON (gs."studentId") gs."studentId", gs."guardianId", s."institutionId"
  FROM "GuardianStudent" gs
  JOIN "Student" s ON s."id" = gs."studentId"
  JOIN "Guardian" g ON g."id" = gs."guardianId" AND g."institutionId" = s."institutionId"
  ORDER BY gs."studentId", gs."isPrimary" DESC, g."createdAt" ASC, g."id" ASC
)
INSERT INTO "FamilyStudent" ("id", "institutionId", "familyId", "studentId", "createdAt")
SELECT 'fs_' || md5(a."studentId"), a."institutionId", 'fam_' || md5(a."guardianId"), a."studentId", now()
FROM anchor a
ON CONFLICT DO NOTHING;

INSERT INTO "FamilyGuardian" ("id", "institutionId", "familyId", "guardianId", "createdAt")
SELECT DISTINCT ON (gs."guardianId") 'fg_' || md5(gs."guardianId"), g."institutionId", fs."familyId", gs."guardianId", now()
FROM "GuardianStudent" gs
JOIN "Guardian" g ON g."id" = gs."guardianId"
JOIN "FamilyStudent" fs ON fs."studentId" = gs."studentId" AND fs."institutionId" = g."institutionId"
ORDER BY gs."guardianId", (fs."familyId" = 'fam_' || md5(gs."guardianId")) DESC, fs."familyId" ASC
ON CONFLICT DO NOTHING;
