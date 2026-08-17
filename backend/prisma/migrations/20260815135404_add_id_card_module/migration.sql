-- CreateEnum
CREATE TYPE "IdCardUserType" AS ENUM ('STUDENT', 'STAFF');

-- CreateTable
CREATE TABLE "IdCardTemplate" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "applicableTo" "IdCardUserType" NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'VERTICAL',
    "widthMm" INTEGER NOT NULL DEFAULT 57,
    "heightMm" INTEGER NOT NULL DEFAULT 89,
    "backgroundImage" TEXT,
    "logoImage" TEXT,
    "signatureImage" TEXT,
    "photoStyle" TEXT NOT NULL DEFAULT 'CIRCLE',
    "photoWidthMm" INTEGER NOT NULL DEFAULT 21,
    "photoHeightMm" INTEGER NOT NULL DEFAULT 21,
    "showFields" JSONB NOT NULL DEFAULT '{"admissionNo":true,"name":true,"class":true,"fatherName":true,"motherName":true,"address":true,"dob":true,"bloodGroup":true}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdCardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdCard" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userType" "IdCardUserType" NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "cardNumber" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdCardTemplate_institutionId_idx" ON "IdCardTemplate"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "IdCard_cardNumber_key" ON "IdCard"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IdCard_verifyToken_key" ON "IdCard"("verifyToken");

-- CreateIndex
CREATE INDEX "IdCard_institutionId_idx" ON "IdCard"("institutionId");

-- CreateIndex
CREATE INDEX "IdCard_studentId_idx" ON "IdCard"("studentId");

-- CreateIndex
CREATE INDEX "IdCard_staffId_idx" ON "IdCard"("staffId");

-- CreateIndex
CREATE INDEX "IdCard_verifyToken_idx" ON "IdCard"("verifyToken");

-- AddForeignKey
ALTER TABLE "IdCardTemplate" ADD CONSTRAINT "IdCardTemplate_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCard" ADD CONSTRAINT "IdCard_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCard" ADD CONSTRAINT "IdCard_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IdCardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCard" ADD CONSTRAINT "IdCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdCard" ADD CONSTRAINT "IdCard_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
