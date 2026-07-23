-- Attendance v2 redesign
-- Adds register-lifecycle attendance model, teacher-section assignment history,
-- attendance reasons, correction requests, audit events and an optional penalty policy.
-- Backfills existing Attendance rows and Section.classTeacherId into the new model
-- BEFORE dropping the old table/column, so no historical data is lost.

-- Ensure gen_random_uuid() is available for backfill row ids below
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "AttendanceModeType" AS ENUM ('DAILY', 'PERIOD');
CREATE TYPE "RegisterStatus" AS ENUM ('NOT_OPENED', 'IN_PROGRESS', 'SUBMITTED', 'LOCKED', 'REOPENED');
CREATE TYPE "AttendanceMark" AS ENUM ('PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'LEAVE', 'NOT_REQUIRED');
CREATE TYPE "AttendanceEntrySource" AS ENUM ('TEACHER_WEB', 'ADMIN_WEB', 'ADMIN_ON_BEHALF', 'IMPORT', 'LEGACY_MIGRATED', 'CORRECTION');
CREATE TYPE "AssignmentRole" AS ENUM ('PRIMARY', 'SUBSTITUTE');
CREATE TYPE "CorrectionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "InstitutionSettings" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "attendanceMode" "AttendanceModeType" NOT NULL DEFAULT 'DAILY',
    "lockAfterDays" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstitutionSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceReason" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "appliesTo" "AttendanceMark"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceReason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeacherSectionAssignment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subject" TEXT,
    "role" "AssignmentRole" NOT NULL DEFAULT 'PRIMARY',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherSectionAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceRegister" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "subject" TEXT NOT NULL,
    "periodSlotId" TEXT,
    "status" "RegisterStatus" NOT NULL DEFAULT 'NOT_OPENED',
    "assignmentId" TEXT,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceRegister_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mark" "AttendanceMark" NOT NULL,
    "reasonId" TEXT,
    "note" TEXT,
    "minutesLate" INTEGER,
    "entrySource" "AttendanceEntrySource" NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "attributedTeacherId" TEXT,
    "updatedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceAuditEvent" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "recordId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCorrectionRequest" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedMark" "AttendanceMark" NOT NULL,
    "requestedReasonId" TEXT,
    "requestNote" TEXT NOT NULL,
    "status" "CorrectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendancePenaltyPolicy" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "feeCategoryId" TEXT,
    "amountPerAbsence" DECIMAL(10,2),
    "countsMark" "AttendanceMark" NOT NULL DEFAULT 'ABSENT_UNEXCUSED',
    "billingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendancePenaltyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionSettings_institutionId_key" ON "InstitutionSettings"("institutionId");
CREATE INDEX "InstitutionSettings_institutionId_idx" ON "InstitutionSettings"("institutionId");
CREATE INDEX "AttendanceReason_institutionId_idx" ON "AttendanceReason"("institutionId");
CREATE UNIQUE INDEX "AttendanceReason_institutionId_code_key" ON "AttendanceReason"("institutionId", "code");
CREATE INDEX "TeacherSectionAssignment_institutionId_idx" ON "TeacherSectionAssignment"("institutionId");
CREATE INDEX "TeacherSectionAssignment_sectionId_idx" ON "TeacherSectionAssignment"("sectionId");
CREATE INDEX "TeacherSectionAssignment_teacherId_idx" ON "TeacherSectionAssignment"("teacherId");
CREATE INDEX "TeacherSectionAssignment_institutionId_sectionId_subject_ef_idx" ON "TeacherSectionAssignment"("institutionId", "sectionId", "subject", "effectiveFrom", "effectiveTo");
CREATE INDEX "AttendanceRegister_institutionId_idx" ON "AttendanceRegister"("institutionId");
CREATE INDEX "AttendanceRegister_institutionId_date_idx" ON "AttendanceRegister"("institutionId", "date");
CREATE INDEX "AttendanceRegister_sectionId_date_idx" ON "AttendanceRegister"("sectionId", "date");
CREATE INDEX "AttendanceRegister_status_idx" ON "AttendanceRegister"("status");
CREATE UNIQUE INDEX "AttendanceRegister_institutionId_sectionId_date_subject_key" ON "AttendanceRegister"("institutionId", "sectionId", "date", "subject");
CREATE INDEX "AttendanceRecord_institutionId_idx" ON "AttendanceRecord"("institutionId");
CREATE INDEX "AttendanceRecord_studentId_idx" ON "AttendanceRecord"("studentId");
CREATE INDEX "AttendanceRecord_registerId_idx" ON "AttendanceRecord"("registerId");
CREATE INDEX "AttendanceRecord_institutionId_studentId_idx" ON "AttendanceRecord"("institutionId", "studentId");
CREATE UNIQUE INDEX "AttendanceRecord_registerId_studentId_key" ON "AttendanceRecord"("registerId", "studentId");
CREATE INDEX "AttendanceAuditEvent_institutionId_idx" ON "AttendanceAuditEvent"("institutionId");
CREATE INDEX "AttendanceAuditEvent_registerId_idx" ON "AttendanceAuditEvent"("registerId");
CREATE INDEX "AttendanceAuditEvent_recordId_idx" ON "AttendanceAuditEvent"("recordId");
CREATE INDEX "AttendanceAuditEvent_createdAt_idx" ON "AttendanceAuditEvent"("createdAt");
CREATE INDEX "AttendanceCorrectionRequest_institutionId_idx" ON "AttendanceCorrectionRequest"("institutionId");
CREATE INDEX "AttendanceCorrectionRequest_recordId_idx" ON "AttendanceCorrectionRequest"("recordId");
CREATE INDEX "AttendanceCorrectionRequest_status_idx" ON "AttendanceCorrectionRequest"("status");
CREATE UNIQUE INDEX "AttendancePenaltyPolicy_institutionId_key" ON "AttendancePenaltyPolicy"("institutionId");
CREATE INDEX "AttendancePenaltyPolicy_institutionId_idx" ON "AttendancePenaltyPolicy"("institutionId");

-- AddForeignKey
ALTER TABLE "InstitutionSettings" ADD CONSTRAINT "InstitutionSettings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceReason" ADD CONSTRAINT "AttendanceReason_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherSectionAssignment" ADD CONSTRAINT "TeacherSectionAssignment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherSectionAssignment" ADD CONSTRAINT "TeacherSectionAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherSectionAssignment" ADD CONSTRAINT "TeacherSectionAssignment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRegister" ADD CONSTRAINT "AttendanceRegister_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TeacherSectionAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "AttendanceRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "AttendanceReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceAuditEvent" ADD CONSTRAINT "AttendanceAuditEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceAuditEvent" ADD CONSTRAINT "AttendanceAuditEvent_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "AttendanceRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionRequest" ADD CONSTRAINT "AttendanceCorrectionRequest_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendancePenaltyPolicy" ADD CONSTRAINT "AttendancePenaltyPolicy_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendancePenaltyPolicy" ADD CONSTRAINT "AttendancePenaltyPolicy_feeCategoryId_fkey" FOREIGN KEY ("feeCategoryId") REFERENCES "FeeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- BACKFILL: Section.classTeacherId -> TeacherSectionAssignment
-- One PRIMARY, open-ended (effectiveTo NULL) assignment per section that
-- currently has a class teacher set. effectiveFrom uses the institution's
-- createdAt since the real historical start date is unknown.
-- createdByUserId falls back to the institution's earliest ADMIN/SUPER_ADMIN
-- user, or else the institution's earliest user of any role.
-- =====================================================================
INSERT INTO "TeacherSectionAssignment"
  ("id", "institutionId", "teacherId", "sectionId", "subject", "role", "effectiveFrom", "effectiveTo", "createdByUserId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  b."institutionId",
  s."classTeacherId",
  s."id",
  NULL,
  'PRIMARY',
  i."createdAt",
  NULL,
  COALESCE(
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = b."institutionId" AND u."role" IN ('ADMIN','SUPER_ADMIN') ORDER BY u."createdAt" ASC LIMIT 1),
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = b."institutionId" ORDER BY u."createdAt" ASC LIMIT 1)
  ),
  NOW(),
  NOW()
FROM "Section" s
JOIN "Class" c ON c."id" = s."classId"
JOIN "Branch" b ON b."id" = c."branchId"
JOIN "Institution" i ON i."id" = b."institutionId"
WHERE s."classTeacherId" IS NOT NULL
  AND COALESCE(
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = b."institutionId" AND u."role" IN ('ADMIN','SUPER_ADMIN') ORDER BY u."createdAt" ASC LIMIT 1),
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = b."institutionId" ORDER BY u."createdAt" ASC LIMIT 1)
  ) IS NOT NULL;

-- =====================================================================
-- BACKFILL: legacy Attendance -> AttendanceRegister + AttendanceRecord
-- Grouped by (institutionId, student's CURRENT sectionId, date) since the
-- legacy rows carry no historical section reference. Registers land LOCKED
-- (per product decision) since this is frozen historical data; corrections
-- must go through the new AttendanceCorrectionRequest flow.
-- Legacy rows for students with no current sectionId cannot be attributed
-- to any section and are intentionally skipped (none exist in this dataset,
-- but the query guards against it regardless).
-- =====================================================================
CREATE TEMP TABLE "_legacy_attendance_grouped" AS
SELECT
  a."institutionId" AS institution_id,
  st."sectionId" AS section_id,
  a."date"::date AS att_date,
  MIN(a."createdAt") AS earliest_created_at,
  gen_random_uuid()::text AS new_register_id
FROM "Attendance" a
JOIN "Student" st ON st."id" = a."studentId"
WHERE st."sectionId" IS NOT NULL
GROUP BY a."institutionId", st."sectionId", a."date"::date;

INSERT INTO "AttendanceRegister"
  ("id", "institutionId", "sectionId", "date", "subject", "status", "submittedByUserId", "submittedAt", "lockedByUserId", "lockedAt", "version", "createdAt", "updatedAt")
SELECT
  g."new_register_id",
  g."institution_id",
  g."section_id",
  g."att_date",
  '__DAILY__',
  'LOCKED',
  NULL,
  g."earliest_created_at",
  NULL,
  NOW(),
  0,
  g."earliest_created_at",
  NOW()
FROM "_legacy_attendance_grouped" g;

INSERT INTO "AttendanceAuditEvent"
  ("id", "institutionId", "registerId", "recordId", "eventType", "actorUserId", "afterValue", "reason", "createdAt")
SELECT
  gen_random_uuid()::text,
  g."institution_id",
  g."new_register_id",
  NULL,
  'LEGACY_BACKFILL',
  COALESCE(
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = g."institution_id" AND u."role" IN ('ADMIN','SUPER_ADMIN') ORDER BY u."createdAt" ASC LIMIT 1),
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = g."institution_id" ORDER BY u."createdAt" ASC LIMIT 1)
  ),
  jsonb_build_object('sectionId', g."section_id", 'date', g."att_date", 'source', 'attendance_v2_redesign_migration'),
  'Migrated from legacy Attendance table',
  NOW()
FROM "_legacy_attendance_grouped" g;

INSERT INTO "AttendanceRecord"
  ("id", "institutionId", "registerId", "studentId", "mark", "note", "entrySource", "recordedByUserId", "version", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  a."institutionId",
  g."new_register_id",
  a."studentId",
  CASE a."status"
    WHEN 'PRESENT' THEN 'PRESENT'::"AttendanceMark"
    WHEN 'LATE' THEN 'LATE'::"AttendanceMark"
    WHEN 'HALF_DAY' THEN 'ABSENT_EXCUSED'::"AttendanceMark"
    WHEN 'ABSENT' THEN 'ABSENT_UNEXCUSED'::"AttendanceMark"
    ELSE 'ABSENT_UNEXCUSED'::"AttendanceMark"
  END,
  CASE WHEN a."status" = 'HALF_DAY' THEN TRIM(BOTH ' ' FROM CONCAT_WS(' ', a."notes", '(legacy HALF_DAY)')) ELSE a."notes" END,
  'LEGACY_MIGRATED',
  COALESCE(
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = a."institutionId" AND u."role" IN ('ADMIN','SUPER_ADMIN') ORDER BY u."createdAt" ASC LIMIT 1),
    (SELECT u."id" FROM "User" u WHERE u."institutionId" = a."institutionId" ORDER BY u."createdAt" ASC LIMIT 1)
  ),
  0,
  a."createdAt",
  a."updatedAt"
FROM "Attendance" a
JOIN "Student" st ON st."id" = a."studentId"
JOIN "_legacy_attendance_grouped" g
  ON g."institution_id" = a."institutionId"
 AND g."section_id" = st."sectionId"
 AND g."att_date" = a."date"::date
WHERE st."sectionId" IS NOT NULL;

DROP TABLE "_legacy_attendance_grouped";

-- =====================================================================
-- Drop superseded legacy structures now that data has been migrated
-- =====================================================================

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_institutionId_fkey";
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_studentId_fkey";
ALTER TABLE "Section" DROP CONSTRAINT "Section_classTeacherId_fkey";

-- DropIndex
DROP INDEX "Section_classTeacherId_idx";

-- AlterTable
ALTER TABLE "Section" DROP COLUMN "classTeacherId";

-- DropTable
DROP TABLE "Attendance";
