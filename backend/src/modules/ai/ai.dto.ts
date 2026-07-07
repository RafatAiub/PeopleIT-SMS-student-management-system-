import { z } from 'zod';

export const GenerateCommentDto = z.object({
  subject: z.string().min(1, 'Subject is required'),
  marks: z.number().nonnegative(),
  grade: z.string().min(1, 'Grade is required'),
});

export type GenerateCommentDtoType = z.infer<typeof GenerateCommentDto>;
