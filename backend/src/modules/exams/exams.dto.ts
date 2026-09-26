import { z } from 'zod';

// Empty-string select values from the UI ("--Select--") mean "none".
const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Exams ────────────────────────────────────────────────────────────────

export const CreateExamDto = z.object({
  name: z.string().trim().min(1, 'Exam name is required').max(100),
  academicYearId: z.string().min(1, 'Session year is required'),
  semesterId: optionalId,
  classIds: z.array(z.string().min(1)).nonempty('Select at least one class'),
  description: z.string().trim().max(500).optional().nullable(),
});

export const UpdateExamDto = CreateExamDto;

export const PublishExamDto = z.object({
  isPublished: z.boolean(),
});

export const ExamListQueryDto = z.object({
  search: z.string().optional(),
  academicYearId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
});

export const IdParamDto = z.object({
  id: z.string().min(1, 'Invalid ID'),
});

// ── Exam Timetable ───────────────────────────────────────────────────────

export const TimetableEntryDto = z
  .object({
    subjectId: z.string().min(1, 'Subject is required'),
    totalMarks: z.coerce.number().positive('Total marks must be greater than 0').max(1000),
    passingMarks: z.coerce.number().min(0, 'Passing marks cannot be negative').max(1000),
    date: z.coerce.date({ invalid_type_error: 'Date is required' }),
    startTime: z.string().regex(TIME_RE, 'Start time must be HH:mm'),
    endTime: z.string().regex(TIME_RE, 'End time must be HH:mm'),
  })
  .refine((e) => e.passingMarks <= e.totalMarks, {
    message: 'Passing marks cannot exceed total marks',
    path: ['passingMarks'],
  })
  // "HH:mm" strings compare correctly lexicographically.
  .refine((e) => e.endTime > e.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const CreateTimetableDto = z.object({
  examId: z.string().min(1, 'Exam is required'),
  classId: z.string().min(1, 'Class is required'),
  entries: z.array(TimetableEntryDto).nonempty('Add at least one subject'),
});

export const UpdateTimetableEntryDto = TimetableEntryDto;

export const TimetableQueryDto = z.object({
  examId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  academicYearId: z.string().min(1).optional(),
});

// ── Exam Grades ──────────────────────────────────────────────────────────

export const SaveGradesDto = z.object({
  grades: z
    .array(
      z
        .object({
          minPercent: z.coerce.number().min(0).max(100),
          maxPercent: z.coerce.number().min(0).max(100),
          grade: z.string().trim().min(1, 'Grade is required').max(10),
        })
        .refine((g) => g.maxPercent >= g.minPercent, {
          message: 'Ending range must be greater than or equal to starting range',
          path: ['maxPercent'],
        }),
    )
    .nonempty('Add at least one grade'),
});

// ── Exam Result (class summary) ──────────────────────────────────────────

export const ExamResultQueryDto = z.object({
  examId: z.string().min(1, 'Exam is required'),
  classId: z.string().min(1, 'Class is required'),
  sectionId: z.string().min(1).optional(),
});

export type CreateExamDtoType = z.infer<typeof CreateExamDto>;
export type UpdateExamDtoType = z.infer<typeof UpdateExamDto>;
export type ExamListQueryDtoType = z.infer<typeof ExamListQueryDto>;
export type TimetableEntryDtoType = z.infer<typeof TimetableEntryDto>;
export type CreateTimetableDtoType = z.infer<typeof CreateTimetableDto>;
export type TimetableQueryDtoType = z.infer<typeof TimetableQueryDto>;
export type SaveGradesDtoType = z.infer<typeof SaveGradesDto>;
export type ExamResultQueryDtoType = z.infer<typeof ExamResultQueryDto>;
