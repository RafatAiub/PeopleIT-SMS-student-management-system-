import { z } from 'zod';

// =============================================================================
// T4 Admissions CRM DTOs — /api/v1/crm
// =============================================================================

const emptyToNull = (v: unknown) => (v === '' ? null : v);
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).optional().nullable());
const id = z.string().min(1).max(60);
const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #3b82f6');
const statusEnum = z.enum(['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST']);

export const IdParamDto = z.object({ id });

// ── Stages ──────────────────────────────────────────────────────────────────

export const StageInputDto = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, 'Stage name is required').max(60),
  nameBn: optionalText(60),
  color: hex.default('#64748b'),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
  /** Legacy status an open stage counts as (won/lost stages ignore this). */
  status: statusEnum.optional(),
});

export const SaveStagesDto = z.object({
  /** The full ordered list; stages missing from it are deleted. */
  stages: z.array(StageInputDto).min(3).max(20),
  /** For deleted stages that still hold enquiries: { deletedStageId: targetStageId }. */
  reassign: z.record(id, id).optional(),
});

// ── Board / move ────────────────────────────────────────────────────────────

export const BoardFiltersDto = z.object({
  search: z.string().trim().max(100).optional(),
  assignedToUserId: z.string().min(1).optional(),
  mine: z.enum(['true', 'false']).optional(),
  due: z.enum(['overdue', 'today']).optional(),
  source: z.string().trim().max(60).optional(),
  classInterested: z.string().trim().max(100).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH']).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export const MoveStageDto = z.object({
  stageId: id,
  lostReason: optionalText(300),
  note: optionalText(1000),
});

// ── Activities ──────────────────────────────────────────────────────────────

export const MANUAL_ACTIVITY_TYPES = ['NOTE', 'CALL', 'SMS', 'EMAIL', 'MEETING'] as const;

export const LogActivityDto = z.object({
  type: z.enum(MANUAL_ACTIVITY_TYPES),
  body: z.string().trim().min(1, 'Write what happened').max(5000),
  /** When it happened (defaults to now; may not be in the future). */
  at: z.preprocess(emptyToNull, z.coerce.date().optional().nullable()),
});

// ── Tasks ───────────────────────────────────────────────────────────────────

export const TaskQueryDto = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  enquiryId: id.optional(),
  assigneeUserId: id.optional(),
  status: z.enum(['open', 'done', 'overdue', 'today', 'all']).default('open'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const CreateTaskDto = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200),
  notes: optionalText(5000),
  dueAt: z.preprocess(emptyToNull, z.coerce.date().optional().nullable()),
  assigneeUserId: z.preprocess(emptyToNull, id.optional().nullable()),
  enquiryId: z.preprocess(emptyToNull, id.optional().nullable()),
});

export const UpdateTaskDto = CreateTaskDto.omit({ enquiryId: true }).partial().extend({ done: z.boolean().optional() });

// ── Contacts ────────────────────────────────────────────────────────────────

export const CONTACT_TYPES = ['ENQUIRER', 'VOLUNTEER', 'DONOR', 'OTHER'] as const;

const tags = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((t) => [...new Set(t.map((x) => x.toLowerCase()))]);

export const ContactQueryDto = z.object({
  type: z.enum(CONTACT_TYPES).optional(),
  tag: z.string().trim().max(40).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const CreateContactDto = z
  .object({
    type: z.enum(CONTACT_TYPES).default('OTHER'),
    name: z.string().trim().min(1, 'Name is required').max(150),
    phone: optionalText(20),
    email: z.preprocess(emptyToNull, z.string().trim().email('Invalid email').max(200).optional().nullable()),
    address: optionalText(300),
    organisation: optionalText(150),
    tags: tags.default([]),
    notes: optionalText(5000),
    ownerUserId: z.preprocess(emptyToNull, id.optional().nullable()),
    enquiryId: z.preprocess(emptyToNull, id.optional().nullable()),
    donorId: z.preprocess(emptyToNull, id.optional().nullable()),
  })
  .refine((c) => !!(c.phone || c.email), { message: 'Give a phone number or an email', path: ['phone'] });

export const UpdateContactDto = z.object({
  type: z.enum(CONTACT_TYPES).optional(),
  name: z.string().trim().min(1).max(150).optional(),
  phone: optionalText(20),
  email: z.preprocess(emptyToNull, z.string().trim().email('Invalid email').max(200).optional().nullable()),
  address: optionalText(300),
  organisation: optionalText(150),
  tags: tags.optional(),
  notes: optionalText(5000),
  ownerUserId: z.preprocess(emptyToNull, id.optional().nullable()),
  enquiryId: z.preprocess(emptyToNull, id.optional().nullable()),
  donorId: z.preprocess(emptyToNull, id.optional().nullable()),
});

// ── Duplicates & merge ──────────────────────────────────────────────────────

export const DuplicateCheckDto = z.object({
  studentName: z.string().trim().max(150).default(''),
  guardianName: optionalText(150),
  phone: optionalText(20),
  email: optionalText(200),
  excludeId: id.optional(),
});

export const MergeDto = z
  .object({ keepId: id, dropId: id })
  .refine((m) => m.keepId !== m.dropId, { message: 'Pick two different enquiries', path: ['dropId'] });

// ── Report ──────────────────────────────────────────────────────────────────

export const ReportQueryDto = z
  .object({
    from: z.preprocess(emptyToNull, z.coerce.date().optional().nullable()),
    to: z.preprocess(emptyToNull, z.coerce.date().optional().nullable()),
    groupBy: z.enum(['source', 'class', 'owner', 'month']).default('source'),
  })
  .refine((r) => !(r.from && r.to && r.from > r.to), { message: '"from" must be before "to"', path: ['from'] });

export type SaveStagesDtoType = z.infer<typeof SaveStagesDto>;
export type BoardFiltersDtoType = z.infer<typeof BoardFiltersDto>;
export type MoveStageDtoType = z.infer<typeof MoveStageDto>;
export type LogActivityDtoType = z.infer<typeof LogActivityDto>;
export type TaskQueryDtoType = z.infer<typeof TaskQueryDto>;
export type CreateTaskDtoType = z.infer<typeof CreateTaskDto>;
export type UpdateTaskDtoType = z.infer<typeof UpdateTaskDto>;
export type ContactQueryDtoType = z.infer<typeof ContactQueryDto>;
export type CreateContactDtoType = z.infer<typeof CreateContactDto>;
export type UpdateContactDtoType = z.infer<typeof UpdateContactDto>;
export type DuplicateCheckDtoType = z.infer<typeof DuplicateCheckDto>;
export type ReportQueryDtoType = z.infer<typeof ReportQueryDto>;
