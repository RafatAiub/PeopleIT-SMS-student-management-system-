import { z } from 'zod';

const emptyToNull = (v: unknown) => (v === '' ? null : v);

export const NoticeAudienceEnum = z.enum(['ALL', 'TEACHERS', 'GUARDIANS', 'STUDENTS']);

export const CreateNoticeDto = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  audience: NoticeAudienceEnum,
  isActive: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
  // Optional targeting — a notice with neither stays visible to its whole
  // audience, exactly as before. A section implies its class.
  classId: z.preprocess(emptyToNull, z.string().min(1).optional().nullable()),
  sectionId: z.preprocess(emptyToNull, z.string().min(1).optional().nullable()),
  // Hidden from non-staff until this moment; publishedAt follows it.
  scheduledAt: z.preprocess(emptyToNull, z.coerce.date().optional().nullable()),
});

export const UpdateNoticeDto = CreateNoticeDto.partial();

export const NoticeQueryDto = z.object({
  search: z.string().optional(),
  audience: NoticeAudienceEnum.optional(),
  isActive: z.coerce.boolean().optional(),
  classId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  /** Staff filter: 'scheduled' = not yet visible to students/guardians. */
  visibility: z.enum(['scheduled', 'published']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const NoticeIdParamDto = z.object({
  id: z.string().min(1, 'Invalid notice ID'),
});

export type CreateNoticeDtoType = z.infer<typeof CreateNoticeDto>;
export type UpdateNoticeDtoType = z.infer<typeof UpdateNoticeDto>;
export type NoticeQueryDtoType = z.infer<typeof NoticeQueryDto>;
