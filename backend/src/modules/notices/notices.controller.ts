import { Request, Response, NextFunction } from 'express';
import * as noticesService from './notices.service';
import { successResponse, paginatedResponse } from '../../utils/response';

export async function createNotice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const notice = await noticesService.createNotice(req.tenantId!, req.body);
    successResponse(res, notice, 'Notice created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateNotice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const notice = await noticesService.updateNotice(req.tenantId!, req.params.id, req.body);
    successResponse(res, notice, 'Notice updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getNotice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const notice = await noticesService.getNotice(req.tenantId!, req.params.id);
    successResponse(res, notice);
  } catch (error) {
    next(error);
  }
}

export async function listNotices(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { notices, total } = await noticesService.listNotices(req.tenantId!, req.query as any);
    paginatedResponse(
      res,
      notices,
      total,
      Number(req.query.page) || 1,
      Number(req.query.pageSize) || 20,
    );
  } catch (error) {
    next(error);
  }
}

export async function deleteNotice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await noticesService.deleteNotice(req.tenantId!, req.params.id);
    successResponse(res, null, 'Notice deleted successfully');
  } catch (error) {
    next(error);
  }
}
