-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SiteMediaKind" AS ENUM ('IMAGE', 'VIDEO', 'FILE');

-- CreateEnum
CREATE TYPE "SiteDomainStatus" AS ENUM ('PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED');

-- CreateEnum
CREATE TYPE "SiteFormTarget" AS ENUM ('ENQUIRY', 'INBOX');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "templateKey" TEXT,
    "theme" JSONB NOT NULL,
    "navigation" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePage" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBn" TEXT,
    "seo" JSONB NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "scheduledPublishAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteMedia" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" "SiteMediaKind" NOT NULL DEFAULT 'IMAGE',
    "name" TEXT NOT NULL,
    "size" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "alt" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDomain" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "SiteDomainStatus" NOT NULL DEFAULT 'PENDING_DNS',
    "verificationToken" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerRef" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "error" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePost" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "coverUrl" TEXT,
    "body" JSONB NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "authorUserId" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteForm" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "target" "SiteFormTarget" NOT NULL DEFAULT 'INBOX',
    "notifyEmails" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteFormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "SiteFormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_institutionId_key" ON "Site"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_subdomain_key" ON "Site"("subdomain");

-- CreateIndex
CREATE INDEX "SitePage_institutionId_idx" ON "SitePage"("institutionId");

-- CreateIndex
CREATE INDEX "SitePage_scheduledPublishAt_idx" ON "SitePage"("scheduledPublishAt");

-- CreateIndex
CREATE UNIQUE INDEX "SitePage_siteId_slug_key" ON "SitePage"("siteId", "slug");

-- CreateIndex
CREATE INDEX "SitePageVersion_pageId_createdAt_idx" ON "SitePageVersion"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteMedia_institutionId_createdAt_idx" ON "SiteMedia"("institutionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteDomain_hostname_key" ON "SiteDomain"("hostname");

-- CreateIndex
CREATE INDEX "SiteDomain_siteId_idx" ON "SiteDomain"("siteId");

-- CreateIndex
CREATE INDEX "SiteDomain_institutionId_idx" ON "SiteDomain"("institutionId");

-- CreateIndex
CREATE INDEX "SiteDomain_status_idx" ON "SiteDomain"("status");

-- CreateIndex
CREATE INDEX "SitePost_institutionId_idx" ON "SitePost"("institutionId");

-- CreateIndex
CREATE INDEX "SitePost_siteId_status_publishedAt_idx" ON "SitePost"("siteId", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SitePost_siteId_slug_key" ON "SitePost"("siteId", "slug");

-- CreateIndex
CREATE INDEX "SiteForm_siteId_idx" ON "SiteForm"("siteId");

-- CreateIndex
CREATE INDEX "SiteForm_institutionId_idx" ON "SiteForm"("institutionId");

-- CreateIndex
CREATE INDEX "SiteFormSubmission_formId_createdAt_idx" ON "SiteFormSubmission"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteFormSubmission_institutionId_idx" ON "SiteFormSubmission"("institutionId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePage" ADD CONSTRAINT "SitePage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePageVersion" ADD CONSTRAINT "SitePageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "SitePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMedia" ADD CONSTRAINT "SiteMedia_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDomain" ADD CONSTRAINT "SiteDomain_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePost" ADD CONSTRAINT "SitePost_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteForm" ADD CONSTRAINT "SiteForm_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteFormSubmission" ADD CONSTRAINT "SiteFormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "SiteForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

