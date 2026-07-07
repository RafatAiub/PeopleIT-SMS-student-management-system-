import { z } from 'zod';

export const NoticeAudienceEnum = z.enum(['ALL', 'TEACHERS', 'GUARDIANS', 'STUDENTS']);

export const CreateNoticeDto = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
  audience: NoticeAudienceEnum,
  isActive: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
});

export const UpdateNoticeDto = CreateNoticeDto.partial();

export const NoticeQueryDto = z.object({
  search: z.string().optional(),
  audience: NoticeAudienceEnum.optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const NoticeIdParamDto = z.object({
  id: z.string().cuid('Invalid notice ID'),
});

export type CreateNoticeDtoType = z.infer<typeof CreateNoticeDto>;
export type UpdateNoticeDtoType = z.infer<typeof UpdateNoticeDto>;
export type NoticeQueryDtoType = z.infer<typeof NoticeQueryDto>;
