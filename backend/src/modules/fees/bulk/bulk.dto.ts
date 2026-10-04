import { z } from 'zod';

export const BulkInvoiceDto = z
  .object({
    classId: z.string().min(1, 'Class is required'),
    sectionId: z.string().min(1).nullable().optional(),
    period: z
      .string()
      .trim()
      .min(1, 'Period is required')
      .max(40)
      .regex(/^[\p{L}\p{N} _\-/.]+$/u, 'Period may contain letters, numbers, spaces, - _ / .'),
    dueDate: z.string().datetime('Invalid due date format'),
    items: z
      .array(
        z.object({
          feeCategoryId: z.string().min(1),
          amount: z.number().positive('Amount must be greater than zero'),
          description: z.string().max(200).optional(),
        }),
      )
      .optional(),
    useFeeSchedule: z.boolean().optional(),
    applyConcessions: z.boolean().optional().default(true),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.useFeeSchedule || (d.items && d.items.length > 0), {
    message: 'Add at least one fee item or use the fee schedule',
    path: ['items'],
  });
export type BulkInvoiceDtoType = z.infer<typeof BulkInvoiceDto>;

export const ListBatchesQueryDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
