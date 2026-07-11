import { Request, Response, NextFunction } from 'express';
import * as institutionService from './institution.service';
import { successResponse } from '../../utils/response';

export async function getWebsiteConfig(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const config = await institutionService.getWebsiteConfig(req.tenantId!);
    successResponse(res, config);
  } catch (error) {
    next(error);
  }
}

export async function updateWebsiteConfig(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const config = await institutionService.updateWebsiteConfig(req.tenantId!, req.body);
    successResponse(res, config, 'Website configuration updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function createInstitution(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await institutionService.createInstitution(req.body);
    successResponse(res, result, 'Institution and Admin user created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listInstitutions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await institutionService.listInstitutions();
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function updateInstitutionAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const admin = await institutionService.updateInstitutionAdmin(id, req.body);
    successResponse(res, admin, 'Administrator credentials updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function listPublicInstitutions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await institutionService.listPublicInstitutions();
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}
