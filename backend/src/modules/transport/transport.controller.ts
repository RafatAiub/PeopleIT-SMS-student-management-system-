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

export async function updateVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.updateVehicle(req.tenantId!, req.params.id, req.body);
    successResponse(res, result, 'Vehicle updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteVehicle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.deleteVehicle(req.tenantId!, req.params.id);
    successResponse(res, result, 'Vehicle deleted successfully');
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

export async function updateRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.updateRoute(req.tenantId!, req.params.id, req.body);
    successResponse(res, result, 'Route updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteRoute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.deleteRoute(req.tenantId!, req.params.id);
    successResponse(res, result, 'Route deleted successfully');
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

export async function getMyAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await transportService.getMyAssignment(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.query as any,
    );
    successResponse(res, result, 'Assignment fetched successfully', 200);
  } catch (error) {
    next(error);
  }
}

// ── Wave C ──────────────────────────────────────────────────────────────────
type Handler = (req: Request) => Promise<unknown>;
function handle(fn: Handler, message: string, status = 200) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      successResponse(res, await fn(req), message, status);
    } catch (error) {
      next(error);
    }
  };
}

export const updateAssignment = handle(
  (req) => transportService.updateAssignment(req.tenantId!, req.params.id, req.body),
  'Assignment updated successfully',
);
export const deleteAssignment = handle(
  (req) => transportService.deleteAssignment(req.tenantId!, req.params.id),
  'Assignment removed successfully',
);

export const listStops = handle((req) => transportService.listStops(req.tenantId!, req.params.id), 'Stops fetched successfully');
export const createStop = handle(
  (req) => transportService.createStop(req.tenantId!, req.params.id, req.body),
  'Stop created successfully',
  201,
);
export const reorderStops = handle(
  (req) => transportService.reorderStops(req.tenantId!, req.params.id, req.body.stopIds),
  'Stops reordered successfully',
);
export const updateStop = handle(
  (req) => transportService.updateStop(req.tenantId!, req.params.stopId, req.body),
  'Stop updated successfully',
);
export const deleteStop = handle((req) => transportService.deleteStop(req.tenantId!, req.params.stopId), 'Stop deleted successfully');

export const updateVehicleLocation = handle(
  (req) => transportService.updateVehicleLocation(req.tenantId!, req.params.id, req.body),
  'Vehicle location updated',
);
export const getLivePositions = handle((req) => transportService.getLivePositions(req.tenantId!), 'Vehicle positions fetched');

export const getRouteReport = handle((req) => transportService.getRouteReport(req.tenantId!), 'Route report generated');

export const previewTransportFees = handle(
  (req) => transportService.previewTransportFees(req.tenantId!, req.body),
  'Transport fee preview generated',
);
export const generateTransportFees = handle(
  (req) => transportService.generateTransportFees(req.tenantId!, req.body),
  'Transport fees generated',
  201,
);
