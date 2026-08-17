-- CreateTable
CREATE TABLE "LectureMaterialComment" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "lectureMaterialId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LectureMaterialComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LectureMaterialComment_institutionId_idx" ON "LectureMaterialComment"("institutionId");

-- CreateIndex
CREATE INDEX "LectureMaterialComment_lectureMaterialId_idx" ON "LectureMaterialComment"("lectureMaterialId");

-- CreateIndex
CREATE INDEX "LectureMaterialComment_authorUserId_idx" ON "LectureMaterialComment"("authorUserId");

-- AddForeignKey
ALTER TABLE "LectureMaterialComment" ADD CONSTRAINT "LectureMaterialComment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureMaterialComment" ADD CONSTRAINT "LectureMaterialComment_lectureMaterialId_fkey" FOREIGN KEY ("lectureMaterialId") REFERENCES "LectureMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureMaterialComment" ADD CONSTRAINT "LectureMaterialComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
