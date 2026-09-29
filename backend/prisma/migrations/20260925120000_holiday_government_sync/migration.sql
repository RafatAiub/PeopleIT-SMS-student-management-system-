-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN "sourceKey" TEXT,
ADD COLUMN "isCustomized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HolidayCalendar" ADD COLUMN "governmentSource" TEXT,
ADD COLUMN "governmentSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_institutionId_sourceKey_key" ON "Holiday"("institutionId", "sourceKey");

-- Backfill: weekly rows seeded before this migration get their source key.
UPDATE "Holiday" SET "sourceKey" = 'weekly:' || to_char("date", 'YYYY-MM-DD') WHERE "type" = 'WEEKLY';

-- Government rows seeded from the old hand-written list are replaced by the
-- feed sync (governmentSource stays NULL, so the next visit re-syncs them).
-- Rows an admin already edited are kept as school-owned holidays.
DELETE FROM "Holiday" WHERE "type" = 'GOVERNMENT' AND "updatedAt" - "createdAt" < interval '2 seconds';
