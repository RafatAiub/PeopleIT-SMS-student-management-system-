import * as libraryRepository from './library.repository';
import * as studentRepository from '../students/student.repository';
import * as guardianRepository from '../guardians/guardian.repository';
import { CreateLibraryBookInput, IssueBookInput, ReturnBookInput, UpdateLibraryBookInput } from './library.dto';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../../utils/AppError';
import { UserRole } from '@prisma/client';

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
  try {
    return await libraryRepository.returnBook(institutionId, issueId, data);
  } catch (error: any) {
    throw new AppError(error.message || 'Failed to return book', 400);
  }
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
