import { Request, Response, NextFunction } from 'express';
import * as transportService from './transport.service';
import { successResponse, paginatedResponse } from '../../utils/response';

export async function createVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.createVehicle(req.tenantId!, req.body);
    successResponse(res, result, 'Vehicle created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getVehicles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { vehicles, total } = await transportService.getVehicles(req.tenantId!, req.query);
    paginatedResponse(res, vehicles, total, page, pageSize, 'Vehicles fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function createRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.createRoute(req.tenantId!, req.body);
    successResponse(res, result, 'Route created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getRoutes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { routes, total } = await transportService.getRoutes(req.tenantId!, req.query);
    paginatedResponse(res, routes, total, page, pageSize, 'Routes fetched successfully');
  } catch (error) {
    next(error);
  }
}

export async function createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.createAssignment(req.tenantId!, req.body);
    successResponse(res, result, 'Assignment created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const { assignments, total } = await transportService.getAssignments(req.tenantId!, req.query);
    paginatedResponse(res, assignments, total, page, pageSize, 'Assignments fetched successfully');
  } catch (error) {
    next(error);
  }
}
