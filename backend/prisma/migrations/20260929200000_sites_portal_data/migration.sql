-- Website v3 (Track B) — Sites portal data.
-- Institution profile fields (B1), committee/albums/downloads/admission
-- circulars (B2), and the showOnWebsite staff opt-in (B2, owner decision 3).
-- All additive: new nullable columns, new tables, one new NOT NULL boolean
-- column with a safe default (false).

-- AlterTable
ALTER TABLE "Institution" ADD COLUMN     "complaintsOfficer" JSONB,
ADD COLUMN     "eiin" TEXT,
ADD COLUMN     "establishedYear" INTEGER,
ADD COLUMN     "headOfInstitution" JSONB,
ADD COLUMN     "informationOfficer" JSONB,
ADD COLUMN     "mpoInfo" TEXT,
ADD COLUMN     "nameBn" TEXT,
ADD COLUMN     "recognitionInfo" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showOnWebsite" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SiteCommitteeMember" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "role" TEXT NOT NULL,
    "roleBn" TEXT,
    "photoUrl" TEXT,
    "phone" TEXT,
    "showPhone" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCommitteeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAlbum" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBn" TEXT,
    "coverUrl" TEXT,
    "description" TEXT,
    "eventDate" TIMESTAMP(3),
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAlbumPhoto" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteAlbumPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDownload" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBn" TEXT,
    "category" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAdmissionCircular" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "classNames" TEXT[],
    "title" TEXT NOT NULL,
    "titleBn" TEXT,
    "body" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "fee" DECIMAL(10,2),
    "pdfUrl" TEXT,
    "applyUrl" TEXT,
    "formId" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteAdmissionCircular_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteCommitteeMember_siteId_idx" ON "SiteCommitteeMember"("siteId");

-- CreateIndex
CREATE INDEX "SiteCommitteeMember_institutionId_idx" ON "SiteCommitteeMember"("institutionId");

-- CreateIndex
CREATE INDEX "SiteAlbum_siteId_status_idx" ON "SiteAlbum"("siteId", "status");

-- CreateIndex
CREATE INDEX "SiteAlbum_institutionId_idx" ON "SiteAlbum"("institutionId");

-- CreateIndex
CREATE INDEX "SiteAlbumPhoto_albumId_idx" ON "SiteAlbumPhoto"("albumId");

-- CreateIndex
CREATE INDEX "SiteDownload_siteId_status_category_idx" ON "SiteDownload"("siteId", "status", "category");

-- CreateIndex
CREATE INDEX "SiteDownload_institutionId_idx" ON "SiteDownload"("institutionId");

-- CreateIndex
CREATE INDEX "SiteAdmissionCircular_siteId_status_idx" ON "SiteAdmissionCircular"("siteId", "status");

-- CreateIndex
CREATE INDEX "SiteAdmissionCircular_institutionId_idx" ON "SiteAdmissionCircular"("institutionId");

-- AddForeignKey
ALTER TABLE "SiteCommitteeMember" ADD CONSTRAINT "SiteCommitteeMember_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCommitteeMember" ADD CONSTRAINT "SiteCommitteeMember_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAlbum" ADD CONSTRAINT "SiteAlbum_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAlbum" ADD CONSTRAINT "SiteAlbum_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAlbumPhoto" ADD CONSTRAINT "SiteAlbumPhoto_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "SiteAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDownload" ADD CONSTRAINT "SiteDownload_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDownload" ADD CONSTRAINT "SiteDownload_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAdmissionCircular" ADD CONSTRAINT "SiteAdmissionCircular_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAdmissionCircular" ADD CONSTRAINT "SiteAdmissionCircular_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed data: the "remove branding" feature flag (owner decision 4). Defaults
-- OFF (defaultEnabled = false) — the "Powered by PeopleNIT" footer credit is
-- shown unless a plan explicitly grants this feature via PlanFeature, or a
-- school gets an explicit InstitutionFeatureOverride. ON CONFLICT makes this
-- safe to re-run / already-seeded.
INSERT INTO "FeatureFlag" ("id", "key", "description", "defaultEnabled", "createdAt", "updatedAt")
VALUES ('feature-website-remove-branding', 'website_remove_branding', 'Remove "Powered by" footer credit from the school''s public site', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
