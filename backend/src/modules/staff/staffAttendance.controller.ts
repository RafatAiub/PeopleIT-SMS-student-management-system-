import { Request, Response, NextFunction } from 'express';
import * as staffAttendanceService from './staffAttendance.service';
import { successResponse } from '../../utils/response';

export async function getDailyAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { date } = req.query as unknown as { date: Date };
    successResponse(res, await staffAttendanceService.getDailyAttendance(req.tenantId!, date));
  } catch (error) {
    next(error);
  }
}

export async function bulkMark(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    successResponse(res, await staffAttendanceService.bulkMark(req.tenantId!, req.body), 'Attendance marked successfully');
  } catch (error) {
    next(error);
  }
}
