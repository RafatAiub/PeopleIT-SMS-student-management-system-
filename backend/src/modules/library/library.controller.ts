import { Request, Response, NextFunction } from 'express';
import * as libraryService from './library.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import type { LibraryReportQuery } from './library.dto';

export async function createBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await libraryService.createBook(req.tenantId!, req.body);
    successResponse(res, result, 'Book created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getBooks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { books, total } = await libraryService.getBooks(req.tenantId!, req.query);
    paginatedResponse(res, books, total, page, pageSize, 'Books fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await libraryService.updateBook(req.tenantId!, req.params.id, req.body);
    successResponse(res, result, 'Book updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await libraryService.deleteBook(req.tenantId!, req.params.id);
    successResponse(res, result, 'Book deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function issueBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await libraryService.issueBook(req.tenantId!, req.body);
    successResponse(res, result, 'Book issued successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function returnBook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { issueId } = req.params;
    const result = await libraryService.returnBook(req.tenantId!, issueId, req.body);
    successResponse(res, result, 'Book returned successfully', 200);
  } catch (error) {
    next(error);
  }
}

export async function getIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { issues, total } = await libraryService.getIssues(req.tenantId!, req.query);
    paginatedResponse(res, issues, total, page, pageSize, 'Issues fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function getMyIssues(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { issues, total } = await libraryService.getMyIssues(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.query as any,
    );
    paginatedResponse(res, issues, total, page, pageSize, 'Issues fetched successfully');
  } catch (error) {
    next(error);
  }
}

// ── Wave C ──────────────────────────────────────────────────────────────────
export async function getFineRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await libraryService.getFineRule(req.tenantId!), 'Fine rule fetched');
  } catch (error) {
    next(error);
  }
}

export async function saveFineRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await libraryService.saveFineRule(req.tenantId!, req.body), 'Fine rule saved');
  } catch (error) {
    next(error);
  }
}

export async function getFinePreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await libraryService.getFinePreview(req.tenantId!, req.params.issueId), 'Fine preview calculated');
  } catch (error) {
    next(error);
  }
}

export async function runOverdueSweep(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await libraryService.markOverdueLoans({ institutionId: req.tenantId! }), 'Overdue loans updated');
  } catch (error) {
    next(error);
  }
}

export async function getReports(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await libraryService.getReports(req.tenantId!, req.query as unknown as LibraryReportQuery), 'Library reports generated');
  } catch (error) {
    next(error);
  }
}
