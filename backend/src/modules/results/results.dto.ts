import { z } from 'zod';

export const CreateExamBaseDto = z.object({
  name: z.string().min(1, 'Exam name is required').max(100),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isActive: z.boolean().default(true),
});

export const CreateExamDto = CreateExamBaseDto.refine((data) => {
  return data.endDate >= data.startDate;
}, {
  message: 'End date must be greater than or equal to start date',
  path: ['endDate'],
});

export const UpdateExamDto = CreateExamBaseDto.partial();

export const ExamQueryDto = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const SingleExamResultEntryDto = z.object({
  studentId: z.string().cuid('Invalid student ID'),
  subject: z.string().min(1, 'Subject is required').max(100),
  marksObtained: z.number().min(0, 'Marks cannot be negative').max(1000),
  maxMarks: z.number().min(1, 'Max marks must be at least 1').max(1000).default(100),
  // grade is always server-computed from marks — see computeGrade() in
  // utils/grading.ts — never accepted as client input.
  remarks: z.string().max(200).optional().nullable(),
}).refine((data) => {
  return data.marksObtained <= data.maxMarks;
}, {
  message: 'Marks obtained cannot exceed max marks',
  path: ['marksObtained'],
});

export const SubmitExamResultsDto = z.object({
  examId: z.string().cuid('Invalid exam ID'),
  results: z.array(SingleExamResultEntryDto).nonempty('At least one result record is required'),
});

export const ExamResultQueryDto = z.object({
  examId: z.string().cuid().optional(),
  studentId: z.string().cuid().optional(),
  subject: z.string().optional(),
  classId: z.string().cuid().optional(),
  sectionId: z.string().cuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// Staff-facing class/section marksheet (distinct from the STUDENT/GUARDIAN
// self-service GET /results/me). classId/sectionId (not className/sectionName)
// to match ExamResultQueryDto's existing convention above — Student's
// classId/sectionId are real cuid FKs, not free-text names.
export const MarksheetQueryDto = z.object({
  examId: z.string().cuid('Invalid exam ID'),
  classId: z.string().cuid('Invalid class ID'),
  sectionId: z.string().cuid('Invalid section ID').optional(),
});

export const ExamIdParamDto = z.object({
  id: z.string().cuid('Invalid exam ID'),
});

export const ResultIdParamDto = z.object({
  id: z.string().cuid('Invalid result ID'),
});

export type CreateExamDtoType = z.infer<typeof CreateExamDto>;
export type UpdateExamDtoType = z.infer<typeof UpdateExamDto>;
export type ExamQueryDtoType = z.infer<typeof ExamQueryDto>;
export type SingleExamResultEntryDtoType = z.infer<typeof SingleExamResultEntryDto>;
export type SubmitExamResultsDtoType = z.infer<typeof SubmitExamResultsDto>;
export type ExamResultQueryDtoType = z.infer<typeof ExamResultQueryDto>;
export type MarksheetQueryDtoType = z.infer<typeof MarksheetQueryDto>;
