-- AlterTable
ALTER TABLE "IdCardTemplate" ADD COLUMN     "layoutMode" TEXT NOT NULL DEFAULT 'SIMPLE',
ADD COLUMN     "canvasElements" JSONB;
