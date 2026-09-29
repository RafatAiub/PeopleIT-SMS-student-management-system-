import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma';
import { CreateLibraryBookInput, IssueBookInput, ReturnBookInput } from './library.dto';
import { ACTIVE_LOAN_STATUSES, startOfDayAt } from './library.logic';

// '' → null so a cleared field is stored as "no value"; undefined → leave unchanged.
const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v && v.trim() ? v.trim() : null);

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
      category: blankToNull(data.category) ?? null,
      shelfLocation: blankToNull(data.shelfLocation) ?? null,
    },
  });
}

export async function findBooks(
  institutionId: string,
  query: { page?: number; pageSize?: number; search?: string; category?: string }
) {
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 20;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(typeof query.category === 'string' && query.category
      ? { category: { equals: query.category, mode: 'insensitive' as const } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' as const } },
            { author: { contains: query.search, mode: 'insensitive' as const } },
            { isbn: { contains: query.search, mode: 'insensitive' as const } },
            { category: { contains: query.search, mode: 'insensitive' as const } },
            { shelfLocation: { contains: query.search, mode: 'insensitive' as const } },
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

export async function updateBook(
  institutionId: string,
  bookId: string,
  data: {
    title?: string;
    author?: string;
    isbn?: string;
    publisher?: string;
    totalCopies?: number;
    category?: string | null;
    shelfLocation?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    const book = await tx.libraryBook.findFirst({ where: { id: bookId, institutionId } });
    if (!book) return null;

    let availableCopies = book.availableCopies;
    if (data.totalCopies !== undefined && data.totalCopies !== book.totalCopies) {
      const delta = data.totalCopies - book.totalCopies;
      availableCopies = Math.max(0, book.availableCopies + delta);
    }

    return tx.libraryBook.update({
      where: { id: bookId },
      data: {
        title: data.title,
        author: data.author,
        isbn: data.isbn,
        publisher: data.publisher,
        totalCopies: data.totalCopies,
        availableCopies,
        category: blankToNull(data.category),
        shelfLocation: blankToNull(data.shelfLocation),
      },
    });
  });
}

export async function countActiveIssuesForBook(institutionId: string, bookId: string) {
  return prisma.libraryIssue.count({
    // OVERDUE loans are still out — they block deletion just like ISSUED.
    where: { institutionId, bookId, status: { in: [...ACTIVE_LOAN_STATUSES] } },
  });
}

export async function deleteBook(institutionId: string, bookId: string) {
  return prisma.libraryBook.deleteMany({ where: { id: bookId, institutionId } });
}

export async function issueBook(institutionId: string, data: IssueBookInput) {
  return prisma.$transaction(async (tx) => {
    const book = await tx.libraryBook.findFirst({
      where: { id: data.bookId, institutionId },
    });
    if (!book) throw new Error('Book not found');

    // F10: atomic decrement guarded by availableCopies > 0 — two concurrent
    // issue requests for the last remaining copy must never both succeed.
    const updateResult = await tx.libraryBook.updateMany({
      where: { id: book.id, institutionId, availableCopies: { gt: 0 } },
      data: { availableCopies: { decrement: 1 } },
    });
    if (updateResult.count === 0) throw new Error('No available copies');

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

export async function findIssueById(institutionId: string, issueId: string) {
  return prisma.libraryIssue.findFirst({ where: { id: issueId, institutionId } });
}

/**
 * Status filter semantics (kept compatible with pre-Wave-C callers, which
 * only ever saw ISSUED/RETURNED stored):
 *   ISSUED   → every loan still out (stored ISSUED *or* OVERDUE), so
 *              dashboards asking for "currently borrowed" keep counting
 *              loans the daily sweep has flipped to OVERDUE.
 *   OVERDUE  → stored OVERDUE, plus ISSUED loans already past due that the
 *              daily sweep hasn't reached yet.
 *   anything else → exact match (e.g. RETURNED).
 */
export function issueStatusWhere(status: string | undefined, now = new Date()): Prisma.LibraryIssueWhereInput {
  if (!status) return {};
  if (status === 'ISSUED') return { status: { in: [...ACTIVE_LOAN_STATUSES] } };
  if (status === 'OVERDUE') {
    return { OR: [{ status: 'OVERDUE' }, { status: 'ISSUED', dueDate: { lt: startOfDayAt(now) } }] };
  }
  return { status };
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

  const statusWhere = issueStatusWhere(typeof query.status === 'string' ? query.status : undefined);
  const where: Prisma.LibraryIssueWhereInput = {
    institutionId,
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.studentIdIn ? { studentId: { in: query.studentIdIn } } : {}),
    // statusWhere may carry its own OR, so it's AND-ed rather than spread
    // (spreading would collide with the search OR below).
    ...(Object.keys(statusWhere).length > 0 ? { AND: [statusWhere] } : {}),
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
        book: { select: { title: true, author: true, isbn: true, category: true, shelfLocation: true } },
        student: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.libraryIssue.count({ where }),
  ]);

  return { issues, total };
}

// ── Wave C: fine rule ───────────────────────────────────────────────────────
export async function findFineRule(institutionId: string) {
  return prisma.libraryFineRule.findUnique({ where: { institutionId } });
}

export async function upsertFineRule(
  institutionId: string,
  data: { finePerDay: number; graceDays: number; maxFine: number | null },
) {
  return prisma.libraryFineRule.upsert({
    where: { institutionId },
    create: { institutionId, ...data },
    update: data,
  });
}

// ── Wave C: daily OVERDUE sweep ─────────────────────────────────────────────
/**
 * Flips ISSUED loans whose due date is before today (BD time) to OVERDUE.
 * The status is re-checked in the UPDATE itself, so a return landing
 * mid-run is never overwritten. availableCopies is untouched — an OVERDUE
 * loan still holds its copy until it is returned.
 */
export async function markOverdueLoans(cutoff: Date, institutionId?: string) {
  const where: Prisma.LibraryIssueWhereInput = {
    status: 'ISSUED',
    dueDate: { lt: cutoff },
    ...(institutionId ? { institutionId } : {}),
  };
  const res = await prisma.libraryIssue.updateMany({ where, data: { status: 'OVERDUE' } });
  return res.count;
}

// ── Wave C: reports ─────────────────────────────────────────────────────────
export async function mostBorrowed(institutionId: string, from: Date, to: Date, limit: number) {
  const groups = await prisma.libraryIssue.groupBy({
    by: ['bookId'],
    where: { institutionId, issueDate: { gte: from, lte: to } },
    _count: { _all: true },
    orderBy: { _count: { bookId: 'desc' } },
    take: limit,
  });
  const books = await prisma.libraryBook.findMany({
    where: { institutionId, id: { in: groups.map((g) => g.bookId) } },
    select: { id: true, title: true, author: true, category: true, totalCopies: true, availableCopies: true },
  });
  const byId = new Map(books.map((b) => [b.id, b]));
  return groups.map((g) => ({ bookId: g.bookId, count: g._count._all, book: byId.get(g.bookId) ?? null }));
}

export async function overdueLoans(institutionId: string, cutoff: Date, take = 200) {
  return prisma.libraryIssue.findMany({
    where: {
      institutionId,
      OR: [{ status: 'OVERDUE' }, { status: 'ISSUED', dueDate: { lt: cutoff } }],
    },
    orderBy: { dueDate: 'asc' },
    take,
    include: {
      book: { select: { id: true, title: true, author: true, shelfLocation: true } },
      student: {
        select: {
          id: true,
          studentId: true,
          firstName: true,
          lastName: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      },
    },
  });
}

export async function returnedWithFines(institutionId: string, from: Date, to: Date) {
  return prisma.libraryIssue.findMany({
    where: { institutionId, status: 'RETURNED', returnDate: { gte: from, lte: to }, fineAmount: { gt: 0 } },
    select: { returnDate: true, fineAmount: true },
  });
}

export async function librarySummary(institutionId: string, cutoff: Date) {
  const [bookAgg, activeLoans, overdue, titles] = await Promise.all([
    prisma.libraryBook.aggregate({ where: { institutionId }, _sum: { totalCopies: true, availableCopies: true } }),
    prisma.libraryIssue.count({ where: { institutionId, status: { in: [...ACTIVE_LOAN_STATUSES] } } }),
    prisma.libraryIssue.count({
      where: { institutionId, OR: [{ status: 'OVERDUE' }, { status: 'ISSUED', dueDate: { lt: cutoff } }] },
    }),
    prisma.libraryBook.count({ where: { institutionId } }),
  ]);
  return {
    titles,
    totalCopies: bookAgg._sum.totalCopies ?? 0,
    availableCopies: bookAgg._sum.availableCopies ?? 0,
    activeLoans,
    overdueLoans: overdue,
  };
}
