-- CreateEnum
CREATE TYPE "SiteProductKind" AS ENUM ('PHYSICAL', 'DIGITAL');

-- CreateEnum
CREATE TYPE "SiteLessonKind" AS ENUM ('VIDEO', 'TEXT', 'FILE', 'EMBED');

-- CreateEnum
CREATE TYPE "SiteOrderStatus" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SiteOrderPaymentMethod" AS ENUM ('COD', 'BKASH', 'NAGAD', 'SSLCOMMERZ', 'FREE');

-- CreateEnum
CREATE TYPE "SiteEnrollmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "SiteProduct" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameBn" TEXT,
    "description" TEXT NOT NULL,
    "images" TEXT[],
    "price" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "sku" TEXT,
    "stock" INTEGER,
    "category" TEXT,
    "kind" "SiteProductKind" NOT NULL DEFAULT 'PHYSICAL',
    "digitalUrl" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCourse" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleBn" TEXT,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "coverUrl" TEXT,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "compareAtPrice" DECIMAL(12,2),
    "level" TEXT,
    "language" TEXT,
    "category" TEXT,
    "instructorName" TEXT,
    "instructorBio" TEXT,
    "instructorPhoto" TEXT,
    "durationText" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCourseLesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "module" TEXT,
    "title" TEXT NOT NULL,
    "kind" "SiteLessonKind" NOT NULL DEFAULT 'VIDEO',
    "videoUrl" TEXT,
    "body" TEXT,
    "fileUrl" TEXT,
    "durationMin" INTEGER,
    "isFreePreview" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCourseLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCustomer" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteOrder" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" JSONB,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "shipping" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "SiteOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "SiteOrderPaymentMethod" NOT NULL,
    "gatewayTranId" TEXT,
    "gatewayPaymentId" TEXT,
    "gatewayRef" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "returnUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteEnrollment" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "SiteEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteLessonProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteProduct_institutionId_idx" ON "SiteProduct"("institutionId");

-- CreateIndex
CREATE INDEX "SiteProduct_siteId_status_idx" ON "SiteProduct"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteProduct_siteId_slug_key" ON "SiteProduct"("siteId", "slug");

-- CreateIndex
CREATE INDEX "SiteCourse_institutionId_idx" ON "SiteCourse"("institutionId");

-- CreateIndex
CREATE INDEX "SiteCourse_siteId_status_idx" ON "SiteCourse"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteCourse_siteId_slug_key" ON "SiteCourse"("siteId", "slug");

-- CreateIndex
CREATE INDEX "SiteCourseLesson_courseId_sortOrder_idx" ON "SiteCourseLesson"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "SiteCourseLesson_institutionId_idx" ON "SiteCourseLesson"("institutionId");

-- CreateIndex
CREATE INDEX "SiteCustomer_institutionId_idx" ON "SiteCustomer"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteCustomer_siteId_email_key" ON "SiteCustomer"("siteId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "SiteOrder_orderNo_key" ON "SiteOrder"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "SiteOrder_gatewayTranId_key" ON "SiteOrder"("gatewayTranId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteOrder_gatewayRef_key" ON "SiteOrder"("gatewayRef");

-- CreateIndex
CREATE INDEX "SiteOrder_siteId_status_idx" ON "SiteOrder"("siteId", "status");

-- CreateIndex
CREATE INDEX "SiteOrder_institutionId_idx" ON "SiteOrder"("institutionId");

-- CreateIndex
CREATE INDEX "SiteOrder_customerId_idx" ON "SiteOrder"("customerId");

-- CreateIndex
CREATE INDEX "SiteEnrollment_institutionId_idx" ON "SiteEnrollment"("institutionId");

-- CreateIndex
CREATE INDEX "SiteEnrollment_siteId_idx" ON "SiteEnrollment"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteEnrollment_courseId_customerId_key" ON "SiteEnrollment"("courseId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteLessonProgress_enrollmentId_lessonId_key" ON "SiteLessonProgress"("enrollmentId", "lessonId");

-- AddForeignKey
ALTER TABLE "SiteProduct" ADD CONSTRAINT "SiteProduct_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCourse" ADD CONSTRAINT "SiteCourse_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCourseLesson" ADD CONSTRAINT "SiteCourseLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "SiteCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCustomer" ADD CONSTRAINT "SiteCustomer_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteOrder" ADD CONSTRAINT "SiteOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "SiteCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEnrollment" ADD CONSTRAINT "SiteEnrollment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEnrollment" ADD CONSTRAINT "SiteEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "SiteCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEnrollment" ADD CONSTRAINT "SiteEnrollment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "SiteCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteEnrollment" ADD CONSTRAINT "SiteEnrollment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SiteOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLessonProgress" ADD CONSTRAINT "SiteLessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "SiteEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteLessonProgress" ADD CONSTRAINT "SiteLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "SiteCourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

