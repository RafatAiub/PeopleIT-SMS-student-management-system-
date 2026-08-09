import { z } from 'zod';

export const SubjectOfferingQueryDto = z.object({
  className: z.string().min(1, 'className is required'),
  group: z.enum(['NONE', 'SCIENCE', 'COMMERCE', 'ARTS']).optional(),
});

export type SubjectOfferingQueryDtoType = z.infer<typeof SubjectOfferingQueryDto>;
