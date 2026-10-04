import { z } from 'zod';

export const UsageSummaryQueryDto = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM')
    .optional(),
});

export type UsageSummaryQuery = z.infer<typeof UsageSummaryQueryDto>;
