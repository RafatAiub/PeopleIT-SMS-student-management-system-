import { z } from 'zod';

export const ListExportsQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ExportIdParamDto = z.object({ id: z.string().min(1).max(64) });

export type ListExportsQuery = z.infer<typeof ListExportsQueryDto>;
