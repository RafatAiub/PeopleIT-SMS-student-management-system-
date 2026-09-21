import { Request, Response, NextFunction } from 'express';
import * as curriculumService from './curriculum.service';
import { successResponse } from '../../utils/response';
import { StudentGroup } from '@prisma/client';

export async function listSubjectOfferings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { className, group } = req.query as { className: string; group?: StudentGroup };
    const offerings = await curriculumService.getSubjectOfferings(req.tenantId!, className, group);
    successResponse(res, offerings);
  } catch (error) {
    next(error);
  }
}

export async function listSubjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subjects = await curriculumService.listSubjects(req.tenantId!);
    successResponse(res, subjects);
  } catch (error) {
    next(error);
  }
}

export async function createSubject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subject = await curriculumService.createSubject(req.tenantId!, req.body);
    successResponse(res, subject, 'Subject created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSubject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const subject = await curriculumService.updateSubject(req.tenantId!, req.params.id, req.body);
    successResponse(res, subject, 'Subject updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteSubject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await curriculumService.deleteSubject(req.tenantId!, req.params.id);
    successResponse(res, null, 'Subject deleted successfully');
  } catch (error) {
    next(error);
  }
}
