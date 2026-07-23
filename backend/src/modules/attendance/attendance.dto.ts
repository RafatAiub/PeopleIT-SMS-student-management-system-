import { z } from 'zod';

// =============================================================================
// Shared primitives
// =============================================================================

const AttendanceMarkEnum = z.enum([
  'PRESENT',
  'LATE',
  'ABSENT_EXCUSED',
  'ABSENT_UNEXCUSED',
  'LEAVE',
  'NOT_REQUIRED',
]);

const RegisterStatusEnum = z.enum([
  'NOT_OPENED',
  'IN_PROGRESS',
  'SUBMITTED',
  'LOCKED',
  'REOPENED',
]);

const AssignmentRoleEnum = z.enum(['PRIMARY', 'SUBSTITUTE']);

const dateOnly = z.string().transform((val) => new Date(val.split('T')[0] + 'T00:00:00.000Z'));

// =============================================================================
// Teacher-facing
// =============================================================================

export const RegistersTodayQueryDto = z.object({
  date: dateOnly.optional(),
});

export const RegistersRosterQueryDto = z.object({
  sectionId: z.string().min(1, 'sectionId is required'),
  date: dateOnly,
  subject: z.string().optional(),
});

const RecordInputDto = z.object({
  studentId: z.string().min(1),
  mark: AttendanceMarkEnum,
  reasonId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  minutesLate: z.number().int().nonnegative().optional().nullable(),
});

export const DraftSaveDto = z.object({
  version: z.number().int().nonnegative(),
  records: z.array(RecordInputDto).min(1),
});

export const TakeOnBehalfDto = DraftSaveDto.extend({
  attributedTeacherId: z.string().min(1, 'attributedTeacherId is required'),
});

export const SubmitRegisterDto = z.object({
  version: z.number().int().nonnegative(),
});

export const RegisterIdParamDto = z.object({
  registerId: z.string().min(1),
});

// =============================================================================
// Admin-facing
// =============================================================================

export const AdminRegisterQueryDto = z.object({
  date: dateOnly.optional(),
  branchId: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  status: RegisterStatusEnum.optional(),
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
  pageSize: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 20)),
});

export const ReopenRegisterDto = z.object({
  reason: z.string().min(1, 'reason is required'),
});

export const LockRegisterDto = z.object({
  version: z.number().int().nonnegative(),
});

export const PatchRecordDto = z.object({
  mark: AttendanceMarkEnum,
  reasonId: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  minutesLate: z.number().int().nonnegative().optional().nullable(),
  version: z.number().int().nonnegative(),
  correctionReason: z.string().min(1, 'correctionReason is required'),
});

export const RecordIdParamDto = z.object({
  recordId: z.string().min(1),
});

// =============================================================================
// Student / Guardian-facing
// =============================================================================

export const MyAttendanceQueryDto = z.object({
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  subject: z.string().optional(),
});

export const StudentIdParamDto = z.object({
  studentId: z.string().min(1),
});

export const ReportsSummaryQueryDto = z.object({
  branchId: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  startDate: dateOnly,
  endDate: dateOnly,
});

export const CreateCorrectionRequestDto = z.object({
  recordId: z.string().min(1),
  requestedMark: AttendanceMarkEnum,
  requestedReasonId: z.string().optional().nullable(),
  requestNote: z.string().min(1, 'requestNote is required'),
});

export const CorrectionRequestQueryDto = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']).optional(),
  studentId: z.string().optional(),
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)),
  pageSize: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 20)),
});

export const ResolveCorrectionRequestDto = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  resolutionNote: z.string().min(1, 'resolutionNote is required'),
});

export const IdParamDto = z.object({
  id: z.string().min(1),
});

// =============================================================================
// Teacher-assignment CRUD (Admin)
// =============================================================================

export const CreateAssignmentDto = z.object({
  teacherId: z.string().min(1),
  sectionId: z.string().min(1),
  subject: z.string().optional().nullable(),
  role: AssignmentRoleEnum.optional().default('PRIMARY'),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.optional().nullable(),
});

export const AssignmentQueryDto = z.object({
  sectionId: z.string().optional(),
  teacherId: z.string().optional(),
  activeOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export const UpdateAssignmentDto = z.object({
  effectiveFrom: dateOnly.optional(),
  effectiveTo: dateOnly.optional().nullable(),
});

// =============================================================================
// Inferred types
// =============================================================================

export type RegistersTodayQueryDtoType = z.infer<typeof RegistersTodayQueryDto>;
export type RegistersRosterQueryDtoType = z.infer<typeof RegistersRosterQueryDto>;
export type DraftSaveDtoType = z.infer<typeof DraftSaveDto>;
export type TakeOnBehalfDtoType = z.infer<typeof TakeOnBehalfDto>;
export type SubmitRegisterDtoType = z.infer<typeof SubmitRegisterDto>;
export type AdminRegisterQueryDtoType = z.infer<typeof AdminRegisterQueryDto>;
export type ReopenRegisterDtoType = z.infer<typeof ReopenRegisterDto>;
export type LockRegisterDtoType = z.infer<typeof LockRegisterDto>;
export type PatchRecordDtoType = z.infer<typeof PatchRecordDto>;
export type MyAttendanceQueryDtoType = z.infer<typeof MyAttendanceQueryDto>;
export type ReportsSummaryQueryDtoType = z.infer<typeof ReportsSummaryQueryDto>;
export type CreateCorrectionRequestDtoType = z.infer<typeof CreateCorrectionRequestDto>;
export type CorrectionRequestQueryDtoType = z.infer<typeof CorrectionRequestQueryDto>;
export type ResolveCorrectionRequestDtoType = z.infer<typeof ResolveCorrectionRequestDto>;
export type CreateAssignmentDtoType = z.infer<typeof CreateAssignmentDto>;
export type AssignmentQueryDtoType = z.infer<typeof AssignmentQueryDto>;
export type UpdateAssignmentDtoType = z.infer<typeof UpdateAssignmentDto>;
