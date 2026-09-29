-- Superseded by the user-keyed StaffAttendance created in
-- 20260927000000_wave_c_feature_foundation (merged from the Habib branch).
-- This migration originally created a StaffProfile-keyed table of the same
-- name; it is now a no-op wherever that table already exists, so fresh
-- databases (which run Wave C first) don't fail on a duplicate CREATE TABLE.
-- Databases that already applied the original version are converted by
-- 20260929300000_unify_staff_attendance.
DO $$
BEGIN
  IF to_regclass('"StaffAttendance"') IS NULL THEN
    CREATE TABLE "StaffAttendance" (
        "id" TEXT NOT NULL,
        "institutionId" TEXT NOT NULL,
        "staffId" TEXT NOT NULL,
        "date" TIMESTAMP(3) NOT NULL,
        "status" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX "StaffAttendance_institutionId_idx" ON "StaffAttendance"("institutionId");
    CREATE INDEX "StaffAttendance_staffId_idx" ON "StaffAttendance"("staffId");
    CREATE INDEX "StaffAttendance_date_idx" ON "StaffAttendance"("date");
    CREATE UNIQUE INDEX "StaffAttendance_institutionId_staffId_date_key" ON "StaffAttendance"("institutionId", "staffId", "date");
    ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
