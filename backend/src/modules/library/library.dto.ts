import { z } from 'zod';

export const CreateLibraryBookDto = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
  isbn: z.string().optional(),
  publisher: z.string().optional(),
  totalCopies: z.number().int().min(1, 'Total copies must be at least 1').default(1),
  // Wave C — optional catalogue metadata. Empty string / null clears it.
  category: z.string().trim().max(100).optional().nullable(),
  shelfLocation: z.string().trim().max(100).optional().nullable(),
});
export type CreateLibraryBookInput = z.infer<typeof CreateLibraryBookDto>;

export const UpdateLibraryBookDto = CreateLibraryBookDto.partial();
export type UpdateLibraryBookInput = z.infer<typeof UpdateLibraryBookDto>;

export const IssueBookDto = z.object({
  bookId: z.string().min(1, 'Book ID is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  dueDate: z.string().datetime().or(z.date()),
});
export type IssueBookInput = z.infer<typeof IssueBookDto>;

export const ReturnBookDto = z.object({
  // Staff-entered fine. When omitted, the suggested fine from the tenant's
  // LibraryFineRule is applied (0 when no rule is configured — identical to
  // the pre-Wave-C behaviour).
  fineAmount: z.number().min(0).optional(),
});
export type ReturnBookInput = z.infer<typeof ReturnBookDto>;

// ── Wave C: fine rule ───────────────────────────────────────────────────────
const money = z.coerce.number().min(0, 'Amount cannot be negative').max(1_000_000, 'Amount is too large');

export const FineRuleDto = z.object({
  finePerDay: money,
  graceDays: z.coerce.number().int().min(0, 'Grace days cannot be negative').max(365).default(0),
  maxFine: money.optional().nullable(),
});
export type FineRuleInput = z.infer<typeof FineRuleDto>;

export const IssueIdParamDto = z.object({ issueId: z.string().min(1, 'Invalid issue ID') });

const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const LibraryReportQueryDto = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type LibraryReportQuery = z.infer<typeof LibraryReportQueryDto>;
