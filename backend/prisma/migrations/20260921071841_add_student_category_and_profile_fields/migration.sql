-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "caste" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "height" TEXT,
ADD COLUMN     "weight" TEXT;

-- CreateTable
CREATE TABLE "StudentCategory" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentCategory_institutionId_idx" ON "StudentCategory"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCategory_institutionId_name_key" ON "StudentCategory"("institutionId", "name");

-- CreateIndex
CREATE INDEX "Student_categoryId_idx" ON "Student"("categoryId");

-- AddForeignKey
ALTER TABLE "StudentCategory" ADD CONSTRAINT "StudentCategory_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StudentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
