import { Request, Response, NextFunction } from 'express';
import * as transportService from './transport.service';
import { successResponse } from '../../utils/response';

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
    const result = await transportService.getVehicles(req.tenantId!);
    successResponse(res, result, 'Vehicles fetched successfully', 200);
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
    const result = await transportService.getRoutes(req.tenantId!);
    successResponse(res, result, 'Routes fetched successfully', 200);
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
    const result = await transportService.getAssignments(req.tenantId!);
    successResponse(res, result, 'Assignments fetched successfully', 200);
  } catch (error) {
    next(error);
  }
}
