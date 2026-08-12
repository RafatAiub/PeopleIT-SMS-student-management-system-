-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "InstitutionApplication" (
    "id" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "applicantFirstName" TEXT NOT NULL,
    "applicantLastName" TEXT NOT NULL,
    "applicantEmail" TEXT NOT NULL,
    "applicantPhone" TEXT,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdInstitutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstitutionApplication_status_idx" ON "InstitutionApplication"("status");

-- CreateIndex
CREATE INDEX "InstitutionApplication_applicantEmail_idx" ON "InstitutionApplication"("applicantEmail");

-- AddForeignKey
ALTER TABLE "InstitutionApplication" ADD CONSTRAINT "InstitutionApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
