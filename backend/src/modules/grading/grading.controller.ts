import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import * as gradingService from './grading.service';
import type { GradingScaleQueryDtoType } from './grading.dto';

export async function listScales(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await gradingService.listScales(req.tenantId!, req.query as unknown as GradingScaleQueryDtoType);
    successResponse(res, data, 'Grading scales retrieved');
  } catch (error) {
    next(error);
  }
}

export async function getEffectiveScale(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await gradingService.getEffectiveScale(req.tenantId!));
  } catch (error) {
    next(error);
  }
}

export async function getScale(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await gradingService.getScale(req.tenantId!, req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function createScale(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await gradingService.createScale(req.tenantId!, req.body), 'Grading scale created', 201);
  } catch (error) {
    next(error);
  }
}

export async function seedBangladesh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await gradingService.seedBangladeshStandard(req.tenantId!, req.body), 'Bangladesh standard scale created', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateScale(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await gradingService.updateScale(req.tenantId!, req.params.id, req.body), 'Grading scale updated');
  } catch (error) {
    next(error);
  }
}

export async function setDefault(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await gradingService.setDefaultScale(req.tenantId!, req.params.id), 'Default grading scale set');
  } catch (error) {
    next(error);
  }
}

export async function deleteScale(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await gradingService.deleteScale(req.tenantId!, req.params.id);
    successResponse(res, null, 'Grading scale deleted');
  } catch (error) {
    next(error);
  }
}
