-- CreateTable
CREATE TABLE "LectureMaterial" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resourceType" TEXT NOT NULL DEFAULT 'NOTE',
    "fileUrl" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LectureMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LectureMaterial_institutionId_idx" ON "LectureMaterial"("institutionId");

-- CreateIndex
CREATE INDEX "LectureMaterial_branchId_idx" ON "LectureMaterial"("branchId");

-- CreateIndex
CREATE INDEX "LectureMaterial_teacherId_idx" ON "LectureMaterial"("teacherId");

-- AddForeignKey
ALTER TABLE "LectureMaterial" ADD CONSTRAINT "LectureMaterial_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureMaterial" ADD CONSTRAINT "LectureMaterial_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureMaterial" ADD CONSTRAINT "LectureMaterial_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
