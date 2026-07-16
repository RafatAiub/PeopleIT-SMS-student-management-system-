import { Request, Response, NextFunction } from 'express';
import * as guardianService from './guardian.service';
import { successResponse, paginatedResponse } from '../../utils/response';

// =============================================================================
// Guardian Controller
// =============================================================================

export async function listGuardians(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guardians, total } = await guardianService.listGuardians(req.tenantId!, req.query as never);
    paginatedResponse(res, guardians, total, Number(req.query.page) || 1, Number(req.query.pageSize) || 20);
  } catch (error) { next(error); }
}

export async function getGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guardian = await guardianService.getGuardian(req.tenantId!, req.params.id);
    successResponse(res, guardian);
  } catch (error) { next(error); }
}

export async function createGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guardian = await guardianService.createGuardian(req.tenantId!, req.body);
    successResponse(res, guardian, 'Guardian created successfully', 201);
  } catch (error) { next(error); }
}

export async function updateGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guardian = await guardianService.updateGuardian(req.tenantId!, req.params.id, req.body);
    successResponse(res, guardian, 'Guardian updated successfully');
  } catch (error) { next(error); }
}

export async function deleteGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await guardianService.deleteGuardian(req.tenantId!, req.params.id);
    successResponse(res, null, 'Guardian deleted successfully');
  } catch (error) { next(error); }
}

export async function linkGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const link = await guardianService.linkGuardianToStudent(req.tenantId!, req.params.studentId, req.body);
    successResponse(res, link, 'Guardian linked to student', 201);
  } catch (error) { next(error); }
}

export async function getMyStudents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const students = await guardianService.getMyLinkedStudentSummaries(req.tenantId!, req.user!.sub);
    successResponse(res, students);
  } catch (error) { next(error); }
}

export async function unlinkGuardian(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await guardianService.unlinkGuardianFromStudent(req.tenantId!, req.params.studentId, req.params.guardianId);
    successResponse(res, null, 'Guardian unlinked from student');
  } catch (error) { next(error); }
}
