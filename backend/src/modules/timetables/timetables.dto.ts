import { z } from 'zod';

export const DayOfWeekEnum = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const CreateTimetableSlotBaseDto = z.object({
  branchId: z.string().cuid('Invalid branch ID'),
  dayOfWeek: DayOfWeekEnum,
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:MM format'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:MM format'),
  className: z.string().min(1, 'Class name is required').max(50),
  sectionName: z.string().min(1, 'Section name is required').max(50),
  subject: z.string().min(1, 'Subject is required').max(100),
  teacherId: z.string().cuid('Invalid teacher ID').optional().nullable(),
  teacherUserId: z.string().cuid('Invalid teacher user ID').optional().nullable(),
});

export const CreateTimetableSlotDto = CreateTimetableSlotBaseDto.refine((data) => {
  const [startHour, startMin] = data.startTime.split(':').map(Number);
  const [endHour, endMin] = data.endTime.split(':').map(Number);
  const start = startHour * 60 + startMin;
  const end = endHour * 60 + endMin;
  return end > start;
}, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export const UpdateTimetableSlotDto = CreateTimetableSlotBaseDto.partial();

export const TimetableSlotQueryDto = z.object({
  branchId: z.string().cuid().optional(),
  dayOfWeek: DayOfWeekEnum.optional(),
  className: z.string().optional(),
  sectionName: z.string().optional(),
  teacherId: z.string().cuid().optional(),
  teacherUserId: z.string().cuid().optional(),
  studentUserId: z.string().cuid().optional(),
  subject: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const TimetableSlotIdParamDto = z.object({
  id: z.string().cuid('Invalid timetable slot ID'),
});

export type CreateTimetableSlotDtoType = z.infer<typeof CreateTimetableSlotDto>;
export type UpdateTimetableSlotDtoType = z.infer<typeof UpdateTimetableSlotDto>;
export type TimetableSlotQueryDtoType = z.infer<typeof TimetableSlotQueryDto>;
