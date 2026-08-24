import { z } from 'zod';

export const AssignmentResourceTypeEnum = z.enum(['NOTE', 'SLIDE', 'VIDEO', 'PDF', 'LINK', 'IMAGE']);

// branchId/className/sectionName are optional at the schema level because a
// STUDENT caller never supplies them — the service resolves them from the
// student's own profile server-side, mirroring lecture.dto.ts. Required for
// a TEACHER caller, enforced in assignment.service.ts.
//
// dueDate is likewise optional at the schema level: a TEACHER is assigning a
// task and must give a due date (enforced in assignment.service.ts); a
// STUDENT is submitting their own work and never has one — the service
// forces it to null for that role regardless of what's sent.
//
// parentAssignmentId: required for a STUDENT (their submission must answer a
// specific Teacher-created assignment); must be absent for a TEACHER (their
// assignment is always top-level). Enforced in assignment.service.ts, which
// also checks the parent is real, top-level, and for the student's own
// class, and that they haven't already submitted to it.
export const CreateAssignmentDto = z.object({
  branchId: z.string().min(1).optional(),
  className: z.string().min(1).max(50).optional(),
  sectionName: z.string().min(1).max(50).optional(),
  subject: z.string().min(1, 'Subject is required').max(100),
  title: z.string().min(1, 'Title is required').max(200),
  instructions: z.string().max(4000).optional().nullable(),
  resourceType: AssignmentResourceTypeEnum.optional().nullable(),
  fileUrl: z.string().url('Must be a valid URL').optional().nullable(),
  dueDate: z.string().datetime().or(z.date()).optional().nullable(),
  parentAssignmentId: z.string().min(1).optional().nullable(),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentDto>;

export const UpdateAssignmentDto = CreateAssignmentDto.partial();
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentDto>;

// parentAssignmentId, when supplied, switches the listing from "top-level
// assignments" to "submissions for this one assignment" — see
// assignment.repository.ts#findAll. Omitted means top-level only.
export const AssignmentQueryDto = z.object({
  branchId: z.string().min(1).optional(),
  className: z.string().optional(),
  sectionName: z.string().optional(),
  subject: z.string().optional(),
  createdByUserId: z.string().min(1).optional(),
  parentAssignmentId: z.string().min(1).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type AssignmentQueryDtoType = z.infer<typeof AssignmentQueryDto>;

export const AssignmentIdParamDto = z.object({
  id: z.string().min(1, 'Invalid assignment ID'),
});
