-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SINGLE', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('ACADEMIC', 'SPORTS', 'CULTURAL', 'CELEBRATION', 'EXAM', 'MEETING', 'TRIP', 'COMPETITION', 'OTHER');

-- CreateEnum
CREATE TYPE "EventAudience" AS ENUM ('STUDENTS', 'GUARDIANS', 'TEACHERS', 'STAFF');

-- AlterTable
ALTER TABLE "AcademicYear" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "EventCategory" NOT NULL DEFAULT 'OTHER',
    "type" "EventType" NOT NULL DEFAULT 'SINGLE',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "venue" TEXT,
    "audience" "EventAudience"[],
    "imageUrl" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_institutionId_startDate_idx" ON "Event"("institutionId", "startDate");

-- CreateIndex
CREATE INDEX "Event_academicYearId_idx" ON "Event"("academicYearId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data fix: an institution must have exactly one default session year. Where
-- several are flagged current, keep the one with the most students (then the
-- latest start) and clear the rest.
UPDATE "AcademicYear" a SET "isCurrent" = false
WHERE a."isCurrent" AND a.id <> (
  SELECT b.id FROM "AcademicYear" b
  WHERE b."institutionId" = a."institutionId" AND b."isCurrent"
  ORDER BY (SELECT count(*) FROM "Student" s WHERE s."academicYearId" = b.id) DESC, b."startDate" DESC, b.id
  LIMIT 1
);
