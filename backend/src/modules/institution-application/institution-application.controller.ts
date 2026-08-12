import { Request, Response, NextFunction } from 'express';
import * as applicationService from './institution-application.service';
import { successResponse } from '../../utils/response';

export async function submitApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const application = await applicationService.submitApplication(req.body);
    successResponse(res, application, 'Application submitted successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listApplications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await applicationService.listApplications(req.query.status as string | undefined);
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function getApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const application = await applicationService.getApplication(req.params.id);
    successResponse(res, application);
  } catch (error) {
    next(error);
  }
}

export async function approveApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await applicationService.approveApplication(req.params.id, req.user!.sub);
    successResponse(res, result, 'Institution application approved and Admin account created', 201);
  } catch (error) {
    next(error);
  }
}

export async function rejectApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reason } = req.body;
    const result = await applicationService.rejectApplication(req.params.id, reason, req.user!.sub);
    successResponse(res, result, 'Institution application rejected');
  } catch (error) {
    next(error);
  }
}
