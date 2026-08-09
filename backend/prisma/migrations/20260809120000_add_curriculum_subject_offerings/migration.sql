-- CreateEnum
CREATE TYPE "StudentGroup" AS ENUM ('NONE', 'SCIENCE', 'COMMERCE', 'ARTS');

-- CreateEnum
CREATE TYPE "SubjectPaper" AS ENUM ('NONE', 'FIRST', 'SECOND');

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectOffering" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "group" "StudentGroup" NOT NULL DEFAULT 'NONE',
    "subjectId" TEXT NOT NULL,
    "paper" "SubjectPaper" NOT NULL DEFAULT 'NONE',
    "defaultMaxMarks" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "isGraded" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subject_institutionId_idx" ON "Subject"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_institutionId_name_key" ON "Subject"("institutionId", "name");

-- CreateIndex
CREATE INDEX "SubjectOffering_institutionId_className_group_idx" ON "SubjectOffering"("institutionId", "className", "group");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectOffering_unique_offering" ON "SubjectOffering"("institutionId", "className", "group", "subjectId", "paper");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
