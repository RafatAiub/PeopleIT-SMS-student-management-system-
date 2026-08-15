-- LectureMaterial ownership moves from Teacher-only to any uploading User
-- (TEACHER or STUDENT). Table has no rows yet, so this is a safe in-place
-- column swap rather than a backfill.

-- DropForeignKey
ALTER TABLE "LectureMaterial" DROP CONSTRAINT "LectureMaterial_teacherId_fkey";

-- DropIndex
DROP INDEX "LectureMaterial_teacherId_idx";

-- AlterTable
ALTER TABLE "LectureMaterial" DROP COLUMN "teacherId",
ADD COLUMN "uploadedByUserId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "LectureMaterial_uploadedByUserId_idx" ON "LectureMaterial"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "LectureMaterial" ADD CONSTRAINT "LectureMaterial_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
