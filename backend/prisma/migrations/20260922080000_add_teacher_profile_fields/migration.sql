-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "gender" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "address" TEXT,
ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "canManageStudents" BOOLEAN NOT NULL DEFAULT false;
