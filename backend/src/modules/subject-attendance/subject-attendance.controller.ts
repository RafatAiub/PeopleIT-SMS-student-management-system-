import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/AppError';
import * as service from './subject-attendance.service';
import type {
  SubjectMyQueryDtoType,
  SubjectReportQueryDtoType,
  SubjectSheetQueryDtoType,
} from './subject-attendance.dto';

function tenantOf(req: Request): string {
  if (!req.tenantId) throw new BadRequestError('Select an institution first (X-Institution-Id header)');
  return req.tenantId;
}

const actorOf = (req: Request) => ({ userId: req.user!.sub, role: req.user!.role });

export async function getOptions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { className, sectionName } = req.query as { className: string; sectionName: string };
    successResponse(res, await service.getOptions(tenantOf(req), actorOf(req), className, sectionName));
  } catch (error) {
    next(error);
  }
}

export async function getSheet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getSheet(tenantOf(req), actorOf(req), req.query as unknown as SubjectSheetQueryDtoType));
  } catch (error) {
    next(error);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.submit(tenantOf(req), actorOf(req), req.body), 'Subject attendance saved', 201);
  } catch (error) {
    next(error);
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getReport(tenantOf(req), actorOf(req), req.query as unknown as SubjectReportQueryDtoType));
  } catch (error) {
    next(error);
  }
}

export async function getMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getMine(tenantOf(req), req.user!.sub, req.query as unknown as SubjectMyQueryDtoType));
  } catch (error) {
    next(error);
  }
}

export async function getChild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(
      res,
      await service.getChild(tenantOf(req), req.user!.sub, req.params.studentId, req.query as unknown as SubjectMyQueryDtoType),
    );
  } catch (error) {
    next(error);
  }
}

export async function getTeacherClasses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getTeacherClasses(tenantOf(req), req.user!.sub));
  } catch (error) {
    next(error);
  }
}
