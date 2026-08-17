import { z } from 'zod';

export const ResourceTypeEnum = z.enum(['NOTE', 'SLIDE', 'VIDEO', 'PDF', 'LINK']);

// branchId/className/sectionName are optional at the schema level because a
// STUDENT caller never supplies them — the service resolves them from the
// student's own profile server-side. They ARE required for a TEACHER
// caller, enforced in lecture.service.ts (never trust client input for a
// student's own class/section, but a teacher must say which class this is for).
export const CreateLectureMaterialDto = z.object({
  branchId: z.string().min(1).optional(),
  className: z.string().min(1).max(50).optional(),
  sectionName: z.string().min(1).max(50).optional(),
  subject: z.string().min(1, 'Subject is required').max(100),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  resourceType: ResourceTypeEnum.default('NOTE'),
  fileUrl: z.string().url('Must be a valid URL'),
});
export type CreateLectureMaterialInput = z.infer<typeof CreateLectureMaterialDto>;

export const UpdateLectureMaterialDto = CreateLectureMaterialDto.partial();
export type UpdateLectureMaterialInput = z.infer<typeof UpdateLectureMaterialDto>;

export const LectureMaterialQueryDto = z.object({
  branchId: z.string().min(1).optional(),
  className: z.string().optional(),
  sectionName: z.string().optional(),
  subject: z.string().optional(),
  uploadedByUserId: z.string().min(1).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type LectureMaterialQueryDtoType = z.infer<typeof LectureMaterialQueryDto>;

export const LectureMaterialIdParamDto = z.object({
  id: z.string().min(1, 'Invalid lecture material ID'),
});

export const CreateCommentDto = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(2000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentDto>;

export const CommentIdParamDto = z.object({
  id: z.string().min(1, 'Invalid lecture material ID'),
  commentId: z.string().min(1, 'Invalid comment ID'),
});
