-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "parentAssignmentId" TEXT;

-- CreateIndex
CREATE INDEX "Assignment_parentAssignmentId_idx" ON "Assignment"("parentAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_parentAssignmentId_createdByUserId_key" ON "Assignment"("parentAssignmentId", "createdByUserId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_parentAssignmentId_fkey" FOREIGN KEY ("parentAssignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
