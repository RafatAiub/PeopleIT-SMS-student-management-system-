import { Request, Response, NextFunction } from 'express';
import * as assignmentService from './assignment.service';
import { successResponse, paginatedResponse } from '../../utils/response';

export async function createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await assignmentService.createAssignment(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.body,
    );
    successResponse(res, result, 'Assignment created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await assignmentService.updateAssignment(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.params.id,
      req.body,
    );
    successResponse(res, result, 'Assignment updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await assignmentService.deleteAssignment(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.params.id,
    );
    successResponse(res, null, 'Assignment deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function getAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await assignmentService.getAssignment(req.tenantId!, req.params.id);
    successResponse(res, result, 'Assignment fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function listAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as any;
    const { assignments, total } = await assignmentService.listAssignments(req.tenantId!, query);
    paginatedResponse(res, assignments, total, query.page, query.pageSize, 'Assignments fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function getMyAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { assignments, total } = await assignmentService.getMyAssignments(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      { ...req.query, page, pageSize } as any,
    );
    paginatedResponse(res, assignments, total, page, pageSize, 'Assignments fetched successfully');
  } catch (error) {
    next(error);
  }
}
