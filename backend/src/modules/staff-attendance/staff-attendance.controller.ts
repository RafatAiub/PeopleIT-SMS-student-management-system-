import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/AppError';
import * as service from './staff-attendance.service';

/** Never let an undefined tenant (SUPER_ADMIN without X-Institution-Id) reach a query. */
function tenantOf(req: Request): string {
  if (!req.tenantId) throw new BadRequestError('Select an institution first (X-Institution-Id header)');
  return req.tenantId;
}

export async function getRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getRegister(tenantOf(req), String(req.query.date)));
  } catch (error) {
    next(error);
  }
}

export async function submitBulk(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await service.submitBulk(tenantOf(req), req.user!.sub, req.body);
    successResponse(res, result, 'Staff attendance saved', 201);
  } catch (error) {
    next(error);
  }
}

export async function getMonthlyReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getMonthlyReport(tenantOf(req), String(req.query.month)));
  } catch (error) {
    next(error);
  }
}

export async function getStaffDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(
      res,
      await service.getStaffDetail(tenantOf(req), req.params.staffUserId, String(req.query.month)),
    );
  } catch (error) {
    next(error);
  }
}

export async function getMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getMine(tenantOf(req), req.user!.sub, String(req.query.month)));
  } catch (error) {
    next(error);
  }
}
