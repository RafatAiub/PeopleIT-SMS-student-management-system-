-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "permanentAddress" TEXT,
ADD COLUMN     "hobbies" TEXT;

-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "avatarUrl" TEXT;
