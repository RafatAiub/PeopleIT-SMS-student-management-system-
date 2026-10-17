-- T2: Character (Akhlaq) scoring & badges (module islamic.character).
-- Additive only: 3 enums + 8 tenant-scoped tables. No existing table changes.

-- CreateEnum
CREATE TYPE "CharacterPeriodKind" AS ENUM ('WEEKLY', 'MONTHLY', 'TERM');

-- CreateEnum
CREATE TYPE "CharacterBadgeRule" AS ENUM ('NONE', 'TRAIT_AVERAGE', 'OVERALL_AVERAGE', 'ATTENDANCE_STREAK');

-- CreateEnum
CREATE TYPE "CharacterAwardSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateTable
CREATE TABLE "CharacterSettings" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "leaderboardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "leaderboardPublic" BOOLEAN NOT NULL DEFAULT false,
    "notifyGuardians" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterTrait" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "description" TEXT,
    "scaleMin" INTEGER NOT NULL DEFAULT 1,
    "scaleMax" INTEGER NOT NULL DEFAULT 5,
    "weight" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterTrait_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterPeriod" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CharacterPeriodKind" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "academicYearId" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterScore" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "traitId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "sectionId" TEXT,
    "scoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterComment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterBadge" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'star',
    "color" TEXT NOT NULL DEFAULT '#c2550a',
    "points" INTEGER NOT NULL DEFAULT 10,
    "rule" "CharacterBadgeRule" NOT NULL DEFAULT 'NONE',
    "ruleTraitId" TEXT,
    "ruleThreshold" DECIMAL(6,2),
    "ruleStreakDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterAward" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "periodId" TEXT,
    "source" "CharacterAwardSource" NOT NULL DEFAULT 'MANUAL',
    "points" INTEGER NOT NULL,
    "reason" TEXT,
    "dedupeKey" TEXT,
    "awardedById" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,

    CONSTRAINT "CharacterAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterPointEntry" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "awardId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterPointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterSettings_institutionId_key" ON "CharacterSettings"("institutionId");

-- CreateIndex
CREATE INDEX "CharacterTrait_institutionId_active_sortOrder_idx" ON "CharacterTrait"("institutionId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "CharacterPeriod_institutionId_startDate_idx" ON "CharacterPeriod"("institutionId", "startDate");

-- CreateIndex
CREATE INDEX "CharacterScore_institutionId_studentId_idx" ON "CharacterScore"("institutionId", "studentId");

-- CreateIndex
CREATE INDEX "CharacterScore_periodId_sectionId_idx" ON "CharacterScore"("periodId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterScore_periodId_studentId_traitId_key" ON "CharacterScore"("periodId", "studentId", "traitId");

-- CreateIndex
CREATE INDEX "CharacterComment_institutionId_studentId_idx" ON "CharacterComment"("institutionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterComment_periodId_studentId_key" ON "CharacterComment"("periodId", "studentId");

-- CreateIndex
CREATE INDEX "CharacterBadge_institutionId_active_idx" ON "CharacterBadge"("institutionId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterAward_dedupeKey_key" ON "CharacterAward"("dedupeKey");

-- CreateIndex
CREATE INDEX "CharacterAward_institutionId_studentId_idx" ON "CharacterAward"("institutionId", "studentId");

-- CreateIndex
CREATE INDEX "CharacterAward_institutionId_awardedAt_idx" ON "CharacterAward"("institutionId", "awardedAt");

-- CreateIndex
CREATE INDEX "CharacterAward_badgeId_idx" ON "CharacterAward"("badgeId");

-- CreateIndex
CREATE INDEX "CharacterPointEntry_institutionId_studentId_idx" ON "CharacterPointEntry"("institutionId", "studentId");

-- CreateIndex
CREATE INDEX "CharacterPointEntry_awardId_idx" ON "CharacterPointEntry"("awardId");

-- AddForeignKey
ALTER TABLE "CharacterSettings" ADD CONSTRAINT "CharacterSettings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTrait" ADD CONSTRAINT "CharacterTrait_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterPeriod" ADD CONSTRAINT "CharacterPeriod_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterPeriod" ADD CONSTRAINT "CharacterPeriod_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterScore" ADD CONSTRAINT "CharacterScore_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterScore" ADD CONSTRAINT "CharacterScore_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CharacterPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterScore" ADD CONSTRAINT "CharacterScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterScore" ADD CONSTRAINT "CharacterScore_traitId_fkey" FOREIGN KEY ("traitId") REFERENCES "CharacterTrait"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterComment" ADD CONSTRAINT "CharacterComment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterComment" ADD CONSTRAINT "CharacterComment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CharacterPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterComment" ADD CONSTRAINT "CharacterComment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterBadge" ADD CONSTRAINT "CharacterBadge_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterBadge" ADD CONSTRAINT "CharacterBadge_ruleTraitId_fkey" FOREIGN KEY ("ruleTraitId") REFERENCES "CharacterTrait"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAward" ADD CONSTRAINT "CharacterAward_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAward" ADD CONSTRAINT "CharacterAward_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "CharacterBadge"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAward" ADD CONSTRAINT "CharacterAward_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterAward" ADD CONSTRAINT "CharacterAward_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CharacterPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterPointEntry" ADD CONSTRAINT "CharacterPointEntry_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterPointEntry" ADD CONSTRAINT "CharacterPointEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterPointEntry" ADD CONSTRAINT "CharacterPointEntry_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "CharacterAward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

