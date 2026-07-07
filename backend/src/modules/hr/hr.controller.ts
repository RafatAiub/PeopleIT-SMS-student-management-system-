import { Request, Response, NextFunction } from 'express';
import * as hrService from './hr.service';
import { successResponse, paginatedResponse } from '../../utils/response';

export async function createStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const staff = await hrService.createStaff(req.tenantId!, req.body);
    successResponse(res, staff, 'Staff profile created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const staff = await hrService.getStaff(req.tenantId!, req.params.id);
    successResponse(res, staff);
  } catch (error) {
    next(error);
  }
}

export async function listStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { staff, total } = await hrService.listStaff(req.tenantId!, req.query as any);
    paginatedResponse(res, staff, total, page, pageSize);
  } catch (error) {
    next(error);
  }
}

export async function processPayroll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payroll = await hrService.processPayroll(req.tenantId!, req.body);
    successResponse(res, payroll, 'Payroll processed successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getPayroll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payroll = await hrService.getPayroll(req.tenantId!, req.params.id);
    successResponse(res, payroll);
  } catch (error) {
    next(error);
  }
}

export async function listPayrolls(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { payrolls, total } = await hrService.listPayrolls(req.tenantId!, req.query as any);
    paginatedResponse(res, payrolls, total, page, pageSize);
  } catch (error) {
    next(error);
  }
}

export async function payPayroll(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const payroll = await hrService.payPayroll(req.tenantId!, req.params.id);
    successResponse(res, payroll, 'Payroll marked as paid successfully');
  } catch (error) {
    next(error);
  }
}
