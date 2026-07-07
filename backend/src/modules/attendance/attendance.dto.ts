import { z } from 'zod';

export const BulkSubmitAttendanceDto = z.object({
  date: z.string().transform((val) => new Date(val)),
  records: z.array(
    z.object({
      studentId: z.string().min(1, 'Student ID is required'),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY']),
      notes: z.string().optional().nullable(),
    })
  ),
});

export const AttendanceQueryDto = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  pageSize: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
  date: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  startDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  endDate: z.string().optional().transform((val) => (val ? new Date(val) : undefined)),
  studentId: z.string().optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY']).optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
});

export const AssignTeacherDto = z.object({
  teacherId: z.string().min(1, 'Teacher ID is required'),
  sectionId: z.string().min(1, 'Section ID is required'),
});

export const AttendanceSheetQueryDto = z.object({
  className: z.string().min(1, 'Class name is required'),
  sectionName: z.string().min(1, 'Section name is required'),
  date: z.string().transform((val) => new Date(val)),
});

export type BulkSubmitAttendanceDtoType = z.infer<typeof BulkSubmitAttendanceDto>;
export type AttendanceQueryDtoType = z.infer<typeof AttendanceQueryDto>;
export type AssignTeacherDtoType = z.infer<typeof AssignTeacherDto>;
export type AttendanceSheetQueryDtoType = z.infer<typeof AttendanceSheetQueryDto>;
