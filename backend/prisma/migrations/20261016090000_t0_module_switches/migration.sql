-- T0: per-school module switches (Settings -> Modules).
-- Additive and nullable: NULL means "every module at its registry default".

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "modules" JSONB;
