import { z } from 'zod';

export const StaffAttendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'HOLIDAY']);

export const BulkStaffAttendanceDto = z.object({
  date: z.coerce.date(),
  records: z.array(
    z.object({
      staffId: z.string().min(1, 'staffId is required'),
      status: StaffAttendanceStatusEnum,
    }),
  ).min(1, 'At least one record is required'),
});

export const StaffAttendanceQueryDto = z.object({
  date: z.coerce.date(),
});

export type BulkStaffAttendanceDtoType = z.infer<typeof BulkStaffAttendanceDto>;
export type StaffAttendanceQueryDtoType = z.infer<typeof StaffAttendanceQueryDto>;
