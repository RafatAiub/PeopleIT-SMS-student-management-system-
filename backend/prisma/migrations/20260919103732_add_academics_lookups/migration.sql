-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "mediumId" TEXT,
ADD COLUMN     "semesterId" TEXT,
ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "streamId" TEXT;

-- CreateTable
CREATE TABLE "Medium" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medium_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Medium_institutionId_idx" ON "Medium"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Medium_institutionId_name_key" ON "Medium"("institutionId", "name");

-- CreateIndex
CREATE INDEX "Stream_institutionId_idx" ON "Stream"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Stream_institutionId_name_key" ON "Stream"("institutionId", "name");

-- CreateIndex
CREATE INDEX "Shift_institutionId_idx" ON "Shift"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_institutionId_name_key" ON "Shift"("institutionId", "name");

-- CreateIndex
CREATE INDEX "Semester_institutionId_idx" ON "Semester"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_institutionId_name_key" ON "Semester"("institutionId", "name");

-- CreateIndex
CREATE INDEX "Class_mediumId_idx" ON "Class"("mediumId");

-- CreateIndex
CREATE INDEX "Class_streamId_idx" ON "Class"("streamId");

-- CreateIndex
CREATE INDEX "Class_shiftId_idx" ON "Class"("shiftId");

-- CreateIndex
CREATE INDEX "Class_semesterId_idx" ON "Class"("semesterId");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_mediumId_fkey" FOREIGN KEY ("mediumId") REFERENCES "Medium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medium" ADD CONSTRAINT "Medium_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stream" ADD CONSTRAINT "Stream_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
