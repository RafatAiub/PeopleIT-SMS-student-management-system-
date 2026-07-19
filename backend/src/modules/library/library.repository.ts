import prisma from '../../config/prisma';
import { CreateLibraryBookInput, IssueBookInput, ReturnBookInput } from './library.dto';

export async function createBook(institutionId: string, data: CreateLibraryBookInput) {
  return prisma.libraryBook.create({
    data: {
      institutionId,
      title: data.title,
      author: data.author,
      isbn: data.isbn,
      publisher: data.publisher,
      totalCopies: data.totalCopies,
      availableCopies: data.totalCopies,
    },
  });
}

export async function findBooks(
  institutionId: string,
  query: { page?: number; pageSize?: number; search?: string }
) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' as const } },
            { author: { contains: query.search, mode: 'insensitive' as const } },
            { isbn: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [books, total] = await prisma.$transaction([
    prisma.libraryBook.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.libraryBook.count({ where }),
  ]);

  return { books, total };
}

export async function findBookById(institutionId: string, bookId: string) {
  return prisma.libraryBook.findFirst({
    where: { id: bookId, institutionId },
  });
}

export async function issueBook(institutionId: string, data: IssueBookInput) {
  return prisma.$transaction(async (tx) => {
    const book = await tx.libraryBook.findFirst({
      where: { id: data.bookId, institutionId },
    });
    if (!book) throw new Error('Book not found');
    if (book.availableCopies <= 0) throw new Error('No available copies');

    await tx.libraryBook.update({
      where: { id: book.id },
      data: { availableCopies: book.availableCopies - 1 },
    });

    return tx.libraryIssue.create({
      data: {
        institutionId,
        bookId: data.bookId,
        studentId: data.studentId,
        dueDate: new Date(data.dueDate),
        status: 'ISSUED',
      },
    });
  });
}

export async function returnBook(institutionId: string, issueId: string, data: ReturnBookInput) {
  return prisma.$transaction(async (tx) => {
    const issue = await tx.libraryIssue.findFirst({
      where: { id: issueId, institutionId },
    });
    if (!issue) throw new Error('Issue record not found');
    if (issue.status === 'RETURNED') throw new Error('Book already returned');

    await tx.libraryBook.update({
      where: { id: issue.bookId },
      data: { availableCopies: { increment: 1 } },
    });

    return tx.libraryIssue.update({
      where: { id: issue.id },
      data: {
        status: 'RETURNED',
        returnDate: new Date(),
        fineAmount: data.fineAmount || 0,
      },
    });
  });
}

export async function getIssues(
  institutionId: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    studentId?: string;
    studentIdIn?: string[];
  }
) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(query.status ? { status: query.status as any } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.studentIdIn ? { studentId: { in: query.studentIdIn } } : {}),
    ...(query.search
      ? {
          OR: [
            {
              book: {
                title: { contains: query.search, mode: 'insensitive' as const },
              },
            },
            {
              student: {
                OR: [
                  { firstName: { contains: query.search, mode: 'insensitive' as const } },
                  { lastName: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [issues, total] = await prisma.$transaction([
    prisma.libraryIssue.findMany({
      where,
      skip,
      take: pageSize,
      include: {
        book: { select: { title: true, author: true, isbn: true } },
        student: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.libraryIssue.count({ where }),
  ]);

  return { issues, total };
}
