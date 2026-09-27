import { z } from 'zod';

// ── Shared ──────────────────────────────────────────────────────────────────

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const boolQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')
  .optional();
const id = z.string().min(1).max(64);

export const IdParamDto = z.object({ id });
export const StudentIdParamDto = z.object({ studentId: id });

export const LanguageDto = z.enum(['en', 'bn']).default('en');
export const ToneDto = z.enum(['formal', 'friendly', 'urgent']).default('formal');

// ── 1. Report-card comments ─────────────────────────────────────────────────

// Original shape (subject/marks/grade) is unchanged — MarksEntry sends exactly
// these three. The optional fields are additive.
export const GenerateCommentDto = z.object({
  subject: z.string().min(1, 'Subject is required'),
  marks: z.number().nonnegative(),
  grade: z.string().min(1, 'Grade is required'),
  maxMarks: z.number().positive().optional(),
  language: z.enum(['en', 'bn']).optional(),
});
export type GenerateCommentDtoType = z.infer<typeof GenerateCommentDto>;

export const BulkCommentsDto = z.object({
  examId: id,
  classId: id,
  sectionId: id.optional(),
  subject: z.string().min(1).max(100).optional(),
  /** Also draft comments for results that already have remarks. */
  overwrite: z.boolean().default(false),
  language: LanguageDto,
});
export type BulkCommentsDtoType = z.infer<typeof BulkCommentsDto>;

// ── AiDraft review queue ────────────────────────────────────────────────────

export const DraftQueryDto = z.object({
  page,
  pageSize,
  status: z.enum(['DRAFT', 'APPROVED', 'REJECTED', 'PUBLISHED']).optional(),
  feature: z.string().max(50).optional(),
});
export type DraftQueryDtoType = z.infer<typeof DraftQueryDto>;

export const EditDraftDto = z.object({ content: z.string().trim().min(1).max(5000) });
export const ApproveDraftDto = z.object({ content: z.string().trim().min(1).max(5000).optional() });
export const RejectDraftDto = z.object({ reason: z.string().trim().max(500).optional() });

// ── 2. Risk scoring ─────────────────────────────────────────────────────────

export const RiskQueryDto = z.object({
  page,
  pageSize,
  level: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  classId: id.optional(),
  sectionId: id.optional(),
  search: z.string().trim().max(100).optional(),
  /** Look-back window for attendance/assignments, in days. */
  days: z.coerce.number().int().min(14).max(365).default(120),
});
export type RiskQueryDtoType = z.infer<typeof RiskQueryDto>;

// ── 3. Attendance patterns ──────────────────────────────────────────────────

export const AttendancePatternQueryDto = z.object({
  page,
  pageSize,
  classId: id.optional(),
  type: z.enum(['CONSECUTIVE', 'DROP']).optional(),
  summary: boolQuery,
});
export type AttendancePatternQueryDtoType = z.infer<typeof AttendancePatternQueryDto>;

// ── 4. Fee risk ─────────────────────────────────────────────────────────────

export const FeeRiskQueryDto = z.object({
  page,
  pageSize,
  level: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  classId: id.optional(),
  search: z.string().trim().max(100).optional(),
});
export type FeeRiskQueryDtoType = z.infer<typeof FeeRiskQueryDto>;

export const FeeReminderDto = z.object({ language: LanguageDto, tone: ToneDto });

// ── 5. Communication drafting ───────────────────────────────────────────────

export const DraftMessageDto = z.object({
  channel: z.enum(['SMS', 'EMAIL', 'NOTICE']),
  purpose: z.string().trim().min(3).max(300),
  audience: z.string().trim().min(2).max(100),
  language: LanguageDto,
  tone: ToneDto,
  details: z.string().trim().max(1000).optional(),
});
export type DraftMessageDtoType = z.infer<typeof DraftMessageDto>;

// ── 6/7/8. Insights ─────────────────────────────────────────────────────────

export const DashboardInsightQueryDto = z.object({ refresh: boolQuery });

export const WorkloadQueryDto = z.object({
  page,
  pageSize,
  examId: id.optional(),
  summary: boolQuery,
});
export type WorkloadQueryDtoType = z.infer<typeof WorkloadQueryDto>;

export const ForecastQueryDto = z.object({ narrative: boolQuery });

// ── 9. Knowledge base ───────────────────────────────────────────────────────

export const KnowledgeQueryDto = z.object({
  page,
  pageSize,
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  isActive: boolQuery,
});
export type KnowledgeQueryDtoType = z.infer<typeof KnowledgeQueryDto>;

export const CreateKnowledgeDto = z.object({
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(10).max(50_000),
  category: z.string().trim().max(50).optional().nullable(),
  isActive: z.boolean().default(true),
});
export const UpdateKnowledgeDto = CreateKnowledgeDto.partial();

export const AskDto = z.object({ question: z.string().trim().min(3).max(500) });

// ── 10. Guardian chat ───────────────────────────────────────────────────────

export const GuardianChatDto = z.object({
  message: z.string().trim().min(2).max(500),
  studentId: id.optional(),
});

// ── 11. Admission assistant (public) ────────────────────────────────────────

export const AdmissionAssistantDto = z.object({
  slug: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(500),
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  childName: z.string().trim().max(100).optional(),
  childAge: z.coerce.number().int().min(2).max(20).optional(),
  /** Honeypot — real users never fill this. */
  website: z.string().max(200).optional(),
});
export type AdmissionAssistantDtoType = z.infer<typeof AdmissionAssistantDto>;

// ── 12. Data clean-up ───────────────────────────────────────────────────────

export const CleanupQueryDto = z.object({ page, pageSize });
