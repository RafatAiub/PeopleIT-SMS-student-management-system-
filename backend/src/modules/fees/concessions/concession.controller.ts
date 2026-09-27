import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../../utils/response';
import * as service from './concession.service';

export async function listConcessions(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as unknown as { page: number; pageSize: number; search?: string; includeInactive?: boolean };
    return successResponse(res, await service.listConcessions(req.tenantId!, q), 'Concessions retrieved');
  } catch (error) {
    next(error);
  }
}

export async function createConcession(req: Request, res: Response, next: NextFunction) {
  try {
    return successResponse(res, await service.createConcession(req.tenantId!, req.body), 'Concession created', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateConcession(req: Request, res: Response, next: NextFunction) {
  try {
    return successResponse(res, await service.updateConcession(req.tenantId!, req.params.id, req.body), 'Concession updated');
  } catch (error) {
    next(error);
  }
}

export async function deleteConcession(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteConcession(req.tenantId!, req.params.id);
    return successResponse(res, null, 'Concession deleted');
  } catch (error) {
    next(error);
  }
}

export async function listAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as unknown as { page: number; pageSize: number; studentId?: string; concessionId?: string; search?: string };
    return successResponse(res, await service.listAssignments(req.tenantId!, q), 'Concession assignments retrieved');
  } catch (error) {
    next(error);
  }
}

export async function assignConcession(req: Request, res: Response, next: NextFunction) {
  try {
    return successResponse(res, await service.assignConcession(req.tenantId!, req.body), 'Concession assigned', 201);
  } catch (error) {
    next(error);
  }
}

export async function unassignConcession(req: Request, res: Response, next: NextFunction) {
  try {
    await service.unassignConcession(req.tenantId!, req.params.id);
    return successResponse(res, null, 'Concession unassigned');
  } catch (error) {
    next(error);
  }
}

export async function getStudentActiveConcessions(req: Request, res: Response, next: NextFunction) {
  try {
    return successResponse(
      res,
      await service.getStudentActiveConcessions(req.tenantId!, req.params.studentId),
      'Active concessions retrieved',
    );
  } catch (error) {
    next(error);
  }
}
