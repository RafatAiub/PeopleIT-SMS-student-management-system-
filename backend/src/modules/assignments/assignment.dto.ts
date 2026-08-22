import { z } from 'zod';

export const AssignmentResourceTypeEnum = z.enum(['NOTE', 'SLIDE', 'VIDEO', 'PDF', 'LINK', 'IMAGE']);

// branchId/className/sectionName are optional at the schema level because a
// STUDENT caller never supplies them — the service resolves them from the
// student's own profile server-side, mirroring lecture.dto.ts. Required for
// a TEACHER caller, enforced in assignment.service.ts.
export const CreateAssignmentDto = z.object({
  branchId: z.string().min(1).optional(),
  className: z.string().min(1).max(50).optional(),
  sectionName: z.string().min(1).max(50).optional(),
  subject: z.string().min(1, 'Subject is required').max(100),
  title: z.string().min(1, 'Title is required').max(200),
  instructions: z.string().max(4000).optional().nullable(),
  resourceType: AssignmentResourceTypeEnum.optional().nullable(),
  fileUrl: z.string().url('Must be a valid URL').optional().nullable(),
  dueDate: z.string().datetime().or(z.date()),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentDto>;

export const UpdateAssignmentDto = CreateAssignmentDto.partial();
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentDto>;

export const AssignmentQueryDto = z.object({
  branchId: z.string().min(1).optional(),
  className: z.string().optional(),
  sectionName: z.string().optional(),
  subject: z.string().optional(),
  createdByUserId: z.string().min(1).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type AssignmentQueryDtoType = z.infer<typeof AssignmentQueryDto>;

export const AssignmentIdParamDto = z.object({
  id: z.string().min(1, 'Invalid assignment ID'),
});
