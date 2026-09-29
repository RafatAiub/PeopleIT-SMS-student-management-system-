import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/AppError';
import * as service from './payroll-components.service';
import type { ComponentQueryDtoType } from './payroll-components.dto';

function tenantOf(req: Request): string {
  if (!req.tenantId) throw new BadRequestError('Select an institution first (X-Institution-Id header)');
  return req.tenantId;
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.list(tenantOf(req), req.query as unknown as ComponentQueryDtoType));
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.create(tenantOf(req), req.body), 'Salary component created', 201);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.update(tenantOf(req), req.params.id, req.body), 'Salary component updated');
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.remove(tenantOf(req), req.params.id), 'Salary component deleted');
  } catch (error) {
    next(error);
  }
}

export async function getStaffComponents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.getStaffComponents(tenantOf(req), req.params.staffId));
  } catch (error) {
    next(error);
  }
}

export async function assignStaffComponents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(
      res,
      await service.assignStaffComponents(tenantOf(req), req.params.staffId, req.body),
      'Salary components updated',
    );
  } catch (error) {
    next(error);
  }
}
