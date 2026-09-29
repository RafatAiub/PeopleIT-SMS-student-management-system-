-- Student Leave has no leave-type concept: STUDENT applicants never carry a
-- leaveTypeId (enforced in leave.service.ts), only STAFF requests do.
ALTER TABLE "LeaveRequest" ALTER COLUMN "leaveTypeId" DROP NOT NULL;
