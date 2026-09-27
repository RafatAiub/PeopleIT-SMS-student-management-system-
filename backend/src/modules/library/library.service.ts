import * as libraryRepository from './library.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import {
  CreateLibraryBookInput,
  FineRuleInput,
  IssueBookInput,
  LibraryReportQuery,
  ReturnBookInput,
  UpdateLibraryBookInput,
} from './library.dto';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';
import { logger } from '../../utils/logger';
import { calculateFine, overdueDays, startOfDayAt, type FineRuleLike } from './library.logic';

export type RequestingUser = { sub: string; role: string };

export async function createBook(institutionId: string, data: CreateLibraryBookInput) {
  return libraryRepository.createBook(institutionId, data);
}

export async function getBooks(institutionId: string, query: any = {}) {
  return libraryRepository.findBooks(institutionId, query);
}

export async function updateBook(institutionId: string, bookId: string, data: UpdateLibraryBookInput) {
  const updated = await libraryRepository.updateBook(institutionId, bookId, data);
  if (!updated) throw new NotFoundError('Book not found');
  return updated;
}

export async function deleteBook(institutionId: string, bookId: string) {
  const book = await libraryRepository.findBookById(institutionId, bookId);
  if (!book) throw new NotFoundError('Book not found');

  const activeIssues = await libraryRepository.countActiveIssuesForBook(institutionId, bookId);
  if (activeIssues > 0) {
    throw new ConflictError('This book has active loans and cannot be deleted — wait until all copies are returned');
  }

  const result = await libraryRepository.deleteBook(institutionId, bookId);
  if (result.count === 0) throw new NotFoundError('Book not found');
  return { id: bookId };
}

export async function issueBook(institutionId: string, data: IssueBookInput) {
  // F3: studentId is client-supplied and must belong to this tenant.
  const student = await studentRepository.findById(institutionId, data.studentId);
  if (!student) {
    throw new BadRequestError('Student not found in your institution');
  }

  try {
    return await libraryRepository.issueBook(institutionId, data);
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to issue book', 400);
  }
}

export async function returnBook(institutionId: string, issueId: string, data: ReturnBookInput) {
  // Works for ISSUED and OVERDUE loans alike (only RETURNED is rejected in
  // the repository). When the caller omits fineAmount, the rule-based
  // suggestion is applied; an explicit amount (including 0) always wins.
  let suggestion: ReturnType<typeof calculateFine> | null = null;
  if (data.fineAmount === undefined) {
    const issue = await libraryRepository.findIssueById(institutionId, issueId);
    if (issue && issue.status !== 'RETURNED') {
      suggestion = calculateFine(issue.dueDate, new Date(), await getFineRuleSafe(institutionId));
    }
  }
  const fineAmount = data.fineAmount ?? suggestion?.suggestedFine ?? 0;
  try {
    const result = await libraryRepository.returnBook(institutionId, issueId, { fineAmount });
    return suggestion ? { ...result, fineSuggestion: suggestion } : result;
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to return book', 400);
  }
}

// ── Wave C: fine rule ───────────────────────────────────────────────────────
const toRuleLike = (r: { finePerDay: unknown; graceDays: number; maxFine: unknown | null }): FineRuleLike => ({
  finePerDay: Number(r.finePerDay),
  graceDays: r.graceDays,
  maxFine: r.maxFine === null || r.maxFine === undefined ? null : Number(r.maxFine),
});

/**
 * Never throws: before the Wave C migration creates LibraryFineRule, the
 * lookup fails and returns — so returning a book keeps working exactly as
 * before (fine defaults to 0) instead of erroring.
 */
async function getFineRuleSafe(institutionId: string): Promise<FineRuleLike | null> {
  try {
    const rule = await libraryRepository.findFineRule(institutionId);
    return rule ? toRuleLike(rule) : null;
  } catch (error) {
    logger.warn('Library fine rule lookup failed — defaulting to no rule', {
      institutionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getFineRule(institutionId: string) {
  const rule = await libraryRepository.findFineRule(institutionId);
  return rule ? { ...rule, ...toRuleLike(rule) } : null;
}

export async function saveFineRule(institutionId: string, data: FineRuleInput) {
  // maxFine null/omitted = no cap.
  const maxFine = data.maxFine ?? null;
  const rule = await libraryRepository.upsertFineRule(institutionId, {
    finePerDay: data.finePerDay,
    graceDays: data.graceDays,
    maxFine,
  });
  return { ...rule, ...toRuleLike(rule) };
}

export async function getFinePreview(institutionId: string, issueId: string) {
  const issue = await libraryRepository.findIssueById(institutionId, issueId);
  if (!issue) throw new NotFoundError('Issue record not found');
  const rule = await getFineRuleSafe(institutionId);
  const asOf = issue.returnDate ?? new Date();
  return {
    issueId: issue.id,
    status: issue.status,
    dueDate: issue.dueDate,
    asOf,
    rule,
    ...calculateFine(issue.dueDate, asOf, rule),
  };
}

// ── Wave C: OVERDUE sweep ───────────────────────────────────────────────────
export async function markOverdueLoans(opts: { institutionId?: string; now?: Date } = {}) {
  const cutoff = startOfDayAt(opts.now ?? new Date());
  const updated = await libraryRepository.markOverdueLoans(cutoff, opts.institutionId);
  if (updated > 0) logger.info('Library loans marked OVERDUE', { updated, institutionId: opts.institutionId ?? 'all' });
  return { cutoff: cutoff.toISOString(), updated };
}

// ── Wave C: reports ─────────────────────────────────────────────────────────
const bdMonthKey = (d: Date) => {
  const s = new Date(d.getTime() + 6 * 60 * 60 * 1000);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}`;
};

export async function getReports(institutionId: string, q: LibraryReportQuery) {
  const now = new Date();
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : now;
  const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 5, 1));
  if (from > to) throw new BadRequestError('"from" must be on or before "to"');
  const cutoff = startOfDayAt(now);

  const [summary, mostBorrowed, overdue, fines, rule] = await Promise.all([
    libraryRepository.librarySummary(institutionId, cutoff),
    libraryRepository.mostBorrowed(institutionId, from, to, q.limit),
    libraryRepository.overdueLoans(institutionId, cutoff),
    libraryRepository.returnedWithFines(institutionId, from, to),
    getFineRuleSafe(institutionId),
  ]);

  const byMonth = new Map<string, number>();
  let finesPaisa = 0;
  for (const f of fines) {
    const paisa = Math.round(Number(f.fineAmount) * 100);
    finesPaisa += paisa;
    if (f.returnDate) {
      const k = bdMonthKey(f.returnDate);
      byMonth.set(k, (byMonth.get(k) ?? 0) + paisa);
    }
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    summary,
    mostBorrowed,
    overdue: overdue.map((i) => ({
      ...i,
      daysOverdue: overdueDays(i.dueDate, now),
      suggestedFine: calculateFine(i.dueDate, now, rule).suggestedFine,
    })),
    finesCollected: {
      total: finesPaisa / 100,
      count: fines.length,
      byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, p]) => ({ period, amount: p / 100 })),
    },
  };
}

export async function getIssues(institutionId: string, query: any = {}) {
  return libraryRepository.getIssues(institutionId, query);
}

// Self-service scoping for STUDENT/GUARDIAN callers — never trust a
// client-supplied studentId for these roles; resolve ownership server-side.
export async function getMyIssues(
  institutionId: string,
  requester: RequestingUser,
  query: { page?: number; pageSize?: number; status?: string; studentId?: string } = {},
) {
  const { page, pageSize, status } = query;

  if (requester.role === UserRole.STUDENT) {
    const student = await studentRepository.findByUserId(institutionId, requester.sub);
    return libraryRepository.getIssues(institutionId, {
      page,
      pageSize,
      status,
      studentId: student?.id ?? '__no-match__',
    });
  }

  if (requester.role === UserRole.GUARDIAN) {
    const linkedStudentIds = await guardianRepository.findLinkedStudentIdsByUserId(institutionId, requester.sub);
    if (query.studentId) {
      if (!linkedStudentIds.includes(query.studentId)) {
        return libraryRepository.getIssues(institutionId, {
          page,
          pageSize,
          status,
          studentId: '__no-match__',
        });
      }
      return libraryRepository.getIssues(institutionId, {
        page,
        pageSize,
        status,
        studentId: query.studentId,
      });
    }
    return libraryRepository.getIssues(institutionId, {
      page,
      pageSize,
      status,
      studentIdIn: linkedStudentIds.length > 0 ? linkedStudentIds : ['__no-match__'],
    });
  }

  // Non-student/guardian roles have no self-service concept here; return empty.
  return { issues: [], total: 0 };
}
