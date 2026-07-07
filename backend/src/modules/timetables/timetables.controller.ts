import { Request, Response, NextFunction } from 'express';
import * as timetablesService from './timetables.service';
import { successResponse, paginatedResponse } from '../../utils/response';

export async function createSlot(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slot = await timetablesService.createSlot(req.tenantId!, req.body);
    successResponse(res, slot, 'Timetable slot created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSlot(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slot = await timetablesService.updateSlot(req.tenantId!, req.params.id, req.body);
    successResponse(res, slot, 'Timetable slot updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSlot(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slot = await timetablesService.getSlot(req.tenantId!, req.params.id);
    successResponse(res, slot);
  } catch (error) {
    next(error);
  }
}

export async function listSlots(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slots, total } = await timetablesService.listSlots(req.tenantId!, req.query as any);
    paginatedResponse(
      res,
      slots,
      total,
      Number(req.query.page) || 1,
      Number(req.query.pageSize) || 20,
    );
  } catch (error) {
    next(error);
  }
}

export async function deleteSlot(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await timetablesService.deleteSlot(req.tenantId!, req.params.id);
    successResponse(res, null, 'Timetable slot deleted successfully');
  } catch (error) {
    next(error);
  }
}
