import { Request, Response, NextFunction } from 'express';
import * as sessionYearService from './session-year.service';
import { successResponse } from '../../utils/response';

export async function listSessionYears(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const years = await sessionYearService.listSessionYears(req.tenantId!);
    successResponse(res, years);
  } catch (error) {
    next(error);
  }
}

export async function createSessionYear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = await sessionYearService.createSessionYear(req.tenantId!, req.body);
    successResponse(res, year, 'Session year created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSessionYear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = await sessionYearService.updateSessionYear(req.tenantId!, req.params.id, req.body);
    successResponse(res, year, 'Session year updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function setDefaultSessionYear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const year = await sessionYearService.setDefaultSessionYear(req.tenantId!, req.params.id);
    successResponse(res, year, `'${year.label}' is now the default session year`);
  } catch (error) {
    next(error);
  }
}

export async function deleteSessionYear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await sessionYearService.deleteSessionYear(req.tenantId!, req.params.id);
    successResponse(res, null, 'Session year deleted successfully');
  } catch (error) {
    next(error);
  }
}
