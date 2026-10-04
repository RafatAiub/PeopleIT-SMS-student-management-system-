-- CreateEnum
CREATE TYPE "SitePageKind" AS ENUM ('PAGE', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "SiteModuleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "publicSlug" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "publicSlug" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "publicConsent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SitePage" ADD COLUMN     "collectionKey" TEXT,
ADD COLUMN     "kind" "SitePageKind" NOT NULL DEFAULT 'PAGE';

-- CreateTable
CREATE TABLE "SiteModule" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "icon" TEXT,
    "fields" JSONB NOT NULL,
    "template" TEXT NOT NULL,
    "css" TEXT NOT NULL DEFAULT '',
    "js" TEXT NOT NULL DEFAULT '',
    "status" "SiteModuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedVersion" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "hasDraftChanges" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteModuleVersion" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteModuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteModule_institutionId_idx" ON "SiteModule"("institutionId");

-- CreateIndex
CREATE INDEX "SiteModule_siteId_status_idx" ON "SiteModule"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteModule_siteId_key_key" ON "SiteModule"("siteId", "key");

-- CreateIndex
CREATE INDEX "SiteModuleVersion_moduleId_createdAt_idx" ON "SiteModuleVersion"("moduleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteModuleVersion_moduleId_version_key" ON "SiteModuleVersion"("moduleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Class_publicSlug_key" ON "Class"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicSlug_key" ON "User"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_siteId_collectionKey_key" ON "SitePage"("siteId", "collectionKey");

-- AddForeignKey
ALTER TABLE "SiteModule" ADD CONSTRAINT "SiteModule_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteModuleVersion" ADD CONSTRAINT "SiteModuleVersion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "SiteModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

