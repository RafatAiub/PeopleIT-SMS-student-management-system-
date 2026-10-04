-- The schema says deleting a LeaveType sets LeaveRequest.leaveTypeId to NULL,
-- but 20260919120000_add_leave_module created the foreign key as RESTRICT.
-- Align the database with the schema.
ALTER TABLE "LeaveRequest" DROP CONSTRAINT IF EXISTS "LeaveRequest_leaveTypeId_fkey";
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey"
  FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
