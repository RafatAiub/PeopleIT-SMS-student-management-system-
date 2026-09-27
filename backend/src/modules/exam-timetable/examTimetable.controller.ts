import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import * as service from './examTimetable.service';
import type { SlotQueryDtoType } from './examTimetable.dto';

export async function listSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.listSlots(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.query as unknown as SlotQueryDtoType,
    );
    successResponse(res, data, 'Exam timetable retrieved');
  } catch (error) {
    next(error);
  }
}

export async function checkConflicts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.checkConflicts(req.tenantId!, req.body));
  } catch (error) {
    next(error);
  }
}

export async function createSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.createSlot(req.tenantId!, req.body), 'Exam slot created', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await service.updateSlot(req.tenantId!, req.params.id, req.body), 'Exam slot updated');
  } catch (error) {
    next(error);
  }
}

export async function deleteSlot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteSlot(req.tenantId!, req.params.id);
    successResponse(res, null, 'Exam slot deleted');
  } catch (error) {
    next(error);
  }
}
