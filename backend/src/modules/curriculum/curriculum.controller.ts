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
