import { z } from 'zod';

export const CreateLibraryBookDto = z.object({
  title: z.string().min(1, 'Title is required'),
  author: z.string().min(1, 'Author is required'),
  isbn: z.string().optional(),
  publisher: z.string().optional(),
  totalCopies: z.number().int().min(1, 'Total copies must be at least 1').default(1),
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
  fineAmount: z.number().min(0).optional(),
});
export type ReturnBookInput = z.infer<typeof ReturnBookDto>;
