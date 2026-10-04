import { z } from 'zod';
import { STAFF_ATTENDANCE_STATUSES } from './staff-attendance.logic';

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM');

export const StaffRegisterQueryDto = z.object({ date: DAY });

export const StaffBulkSubmitDto = z.object({
  date: DAY,
  records: z
    .array(
      z.object({
        staffUserId: z.string().min(1),
        status: z.enum(STAFF_ATTENDANCE_STATUSES),
        note: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1, 'At least one record is required')
    .max(1000),
});

export const StaffReportQueryDto = z.object({ month: MONTH });

export const StaffUserParamDto = z.object({ staffUserId: z.string().min(1) });

export type StaffBulkSubmitDtoType = z.infer<typeof StaffBulkSubmitDto>;
