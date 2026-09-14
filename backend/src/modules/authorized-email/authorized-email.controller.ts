import { Request, Response, NextFunction } from 'express';
import * as authorizedEmailService from './authorized-email.service';
import { successResponse } from '../../utils/response';

export async function addAuthorizedEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await authorizedEmailService.addAuthorizedEmail(req.body, req.user!.sub);
    successResponse(res, result, 'Email authorized successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listAuthorizedEmails(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await authorizedEmailService.listAuthorizedEmails();
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function removeAuthorizedEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authorizedEmailService.removeAuthorizedEmail(req.params.id);
    successResponse(res, null, 'Email removed from authorized list');
  } catch (error) {
    next(error);
  }
}
