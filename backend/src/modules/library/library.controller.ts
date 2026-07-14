import { Request, Response, NextFunction } from 'express';
import * as libraryService from './library.service';
import { successResponse, paginatedResponse } from '../../utils/response';

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
