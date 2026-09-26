import { Request, Response, NextFunction } from 'express';
import * as holidayService from './holiday.service';
import { successResponse } from '../../utils/response';

export async function listHolidays(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await holidayService.listHolidays(req.tenantId!, Number(req.query.year));
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function createHoliday(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await holidayService.createHoliday(req.tenantId!, req.body);
    const message = result.created === 1 ? 'Holiday created successfully' : `${result.created} holidays created successfully`;
    successResponse(res, result, message, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateHoliday(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const holiday = await holidayService.updateHoliday(req.tenantId!, req.params.id, req.body);
    successResponse(res, holiday, 'Holiday updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteHoliday(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await holidayService.deleteHoliday(req.tenantId!, req.params.id);
    successResponse(res, null, 'Holiday deleted successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateHolidaySettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await holidayService.updateHolidaySettings(req.tenantId!, Number(req.params.year), req.body);
    successResponse(res, result, 'Weekly holidays updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function restoreHolidayDefaults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await holidayService.restoreHolidayDefaults(req.tenantId!, Number(req.params.year), req.body);
    successResponse(res, result, `${result.added} default holiday${result.added === 1 ? '' : 's'} restored`);
  } catch (error) {
    next(error);
  }
}

export async function syncGovernmentHolidays(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await holidayService.syncGovernmentHolidays(req.tenantId!, Number(req.params.year), true);
    successResponse(res, result, 'Government holidays synced');
  } catch (error) {
    next(error);
  }
}
