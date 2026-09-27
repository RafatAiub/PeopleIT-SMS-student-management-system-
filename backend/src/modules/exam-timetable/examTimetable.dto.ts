import { z } from 'zod';
import { isValidTime, toMinutes } from './examTimetable.logic';

const time = z.string().trim().refine(isValidTime, 'Time must be HH:mm (24-hour)');
const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const SlotFields = z.object({
  examId: z.string().min(1, 'Exam is required'),
  className: z.string().trim().min(1, 'Class is required').max(100),
  sectionName: z.string().trim().max(50).optional().nullable(),
  subjectName: z.string().trim().min(1, 'Subject is required').max(150),
  date: dateOnly,
  startTime: time,
  endTime: time,
  room: z.string().trim().max(50).optional().nullable(),
});

const endAfterStart = (d: { startTime?: string; endTime?: string }) =>
  !d.startTime || !d.endTime || toMinutes(d.endTime) > toMinutes(d.startTime);
const endAfterStartMsg = { message: 'End time must be after start time', path: ['endTime'] };

export const CreateSlotDto = SlotFields.refine(endAfterStart, endAfterStartMsg);
export const UpdateSlotDto = SlotFields.partial().refine(endAfterStart, endAfterStartMsg);
export const CheckConflictsDto = SlotFields.extend({ id: z.string().min(1).optional() }).refine(endAfterStart, endAfterStartMsg);

export const SlotQueryDto = z.object({
  examId: z.string().min(1).optional(),
  className: z.string().trim().min(1).optional(),
  sectionName: z.string().trim().min(1).optional(),
  // GUARDIAN: restrict to one linked child.
  studentId: z.string().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(100),
});

export const SlotIdParamDto = z.object({ id: z.string().min(1, 'Invalid slot ID') });

export type CreateSlotDtoType = z.infer<typeof CreateSlotDto>;
export type UpdateSlotDtoType = z.infer<typeof UpdateSlotDto>;
export type CheckConflictsDtoType = z.infer<typeof CheckConflictsDto>;
export type SlotQueryDtoType = z.infer<typeof SlotQueryDto>;
