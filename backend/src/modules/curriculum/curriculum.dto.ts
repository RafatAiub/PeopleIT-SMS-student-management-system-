import { z } from 'zod';

export const SubjectOfferingQueryDto = z.object({
  className: z.string().min(1, 'className is required'),
  group: z.enum(['NONE', 'SCIENCE', 'COMMERCE', 'ARTS']).optional(),
});

export type SubjectOfferingQueryDtoType = z.infer<typeof SubjectOfferingQueryDto>;

// ── Subject CRUD (SubjectOffering — the class↔subject link — stays
// read-only; only the Subject catalogue itself is admin-manageable here) ──
export const CreateSubjectDto = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});
export type CreateSubjectDtoType = z.infer<typeof CreateSubjectDto>;

export const UpdateSubjectDto = CreateSubjectDto.partial();
export type UpdateSubjectDtoType = z.infer<typeof UpdateSubjectDto>;

export const SubjectIdParamDto = z.object({
  id: z.string().min(1, 'Invalid subject ID'),
});
export type SubjectIdParamDtoType = z.infer<typeof SubjectIdParamDto>;
