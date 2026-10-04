-- Two branches each introduced a "StaffAttendance" table. The merged schema
-- keeps the user-keyed version from Wave C (covers teachers, who have no
-- StaffProfile, plus check-in/out and QR check-in). Where the older
-- StaffProfile-keyed version exists (it has a "staffId" column), convert it,
-- carrying rows over by resolving each StaffProfile to its User. Databases
-- already on the Wave C shape are left untouched.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'StaffAttendance' AND column_name = 'staffId'
  ) THEN
    ALTER TABLE "StaffAttendance" DROP CONSTRAINT IF EXISTS "StaffAttendance_staffId_fkey";
    DROP INDEX IF EXISTS "StaffAttendance_date_idx";
    DROP INDEX IF EXISTS "StaffAttendance_institutionId_staffId_date_key";
    DROP INDEX IF EXISTS "StaffAttendance_staffId_idx";

    ALTER TABLE "StaffAttendance"
      ADD COLUMN "staffUserId" TEXT,
      ADD COLUMN "checkIn" TIMESTAMP(3),
      ADD COLUMN "checkOut" TIMESTAMP(3),
      ADD COLUMN "note" TEXT,
      ADD COLUMN "markedByUserId" TEXT;

    UPDATE "StaffAttendance" sa
    SET "staffUserId" = sp."userId"
    FROM "StaffProfile" sp
    WHERE sp."id" = sa."staffId";

    -- Rows whose StaffProfile no longer resolves to a user can't be kept.
    DELETE FROM "StaffAttendance" WHERE "staffUserId" IS NULL;

    ALTER TABLE "StaffAttendance"
      DROP COLUMN "staffId",
      ALTER COLUMN "staffUserId" SET NOT NULL,
      ALTER COLUMN "date" SET DATA TYPE DATE;

    CREATE INDEX "StaffAttendance_staffUserId_idx" ON "StaffAttendance"("staffUserId");
    CREATE UNIQUE INDEX "StaffAttendance_institutionId_staffUserId_date_key" ON "StaffAttendance"("institutionId", "staffUserId", "date");
    ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_markedByUserId_fkey" FOREIGN KEY ("markedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
