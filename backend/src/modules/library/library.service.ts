import * as libraryRepository from './library.repository';
import { CreateLibraryBookInput, IssueBookInput, ReturnBookInput } from './library.dto';
import { AppError } from '../../utils/AppError';

export async function createBook(institutionId: string, data: CreateLibraryBookInput) {
  return libraryRepository.createBook(institutionId, data);
}

export async function getBooks(institutionId: string, query: any = {}) {
  return libraryRepository.findBooks(institutionId, query);
}

export async function issueBook(institutionId: string, data: IssueBookInput) {
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
