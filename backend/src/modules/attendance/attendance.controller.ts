import { Request, Response, NextFunction } from 'express';
import * as attendanceService from './attendance.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import { BadRequestError } from '../../utils/AppError';
import { UpdateAssignmentDto } from './attendance.dto';

// =============================================================================
// Teacher-facing
// =============================================================================

export async function getRegistersToday(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { date } = req.query as any;
    const result = await attendanceService.getRegistersToday(req.tenantId!, req.user!.sub, date);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getRosterBySectionDate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sectionId, date, subject } = req.query as any;
    const result = await attendanceService.getRosterBySectionDate(
      req.tenantId!,
      req.user!.role,
      req.user!.sub,
      sectionId,
      date,
      subject,
    );
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function saveDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.saveDraft(
      req.tenantId!,
      req.user!.role,
      req.user!.sub,
      req.params.registerId,
      req.body,
    );
    successResponse(res, result, 'Draft saved');
  } catch (error) {
    next(error);
  }
}

export async function takeOnBehalf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.takeOnBehalf(
      req.tenantId!,
      req.params.registerId,
      req.body,
      req.user!.sub,
    );
    successResponse(res, result, 'Attendance recorded on behalf of teacher');
  } catch (error) {
    next(error);
  }
}

export async function submitRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.submitRegister(
      req.tenantId!,
      req.user!.role,
      req.user!.sub,
      req.params.registerId,
      req.body,
    );
    successResponse(res, result, 'Register submitted');
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Admin-facing
// =============================================================================

export async function listAdminRegisters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { registers, total } = await attendanceService.listAdminRegisters(req.tenantId!, req.query as any);
    paginatedResponse(res, registers, total, (req.query as any).page, (req.query as any).pageSize);
  } catch (error) {
    next(error);
  }
}

export async function reopenRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.reopenRegister(req.tenantId!, req.params.registerId, req.body, req.user!.sub);
    successResponse(res, result, 'Register reopened');
  } catch (error) {
    next(error);
  }
}

export async function lockRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.lockRegister(req.tenantId!, req.params.registerId, req.body, req.user!.sub);
    successResponse(res, result, 'Register locked');
  } catch (error) {
    next(error);
  }
}

export async function patchRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.patchRecord(req.tenantId!, req.params.recordId, req.body, req.user!.sub);
    successResponse(res, result, 'Record updated');
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Student / Guardian-facing
// =============================================================================

export async function getMyAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.getMyAttendance(req.tenantId!, req.user!.sub, req.query as any);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getChildAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.getChildAttendance(
      req.tenantId!,
      req.params.studentId,
      req.user!.sub,
      req.query as any,
    );
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getReportsSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.getReportsSummary(
      req.tenantId!,
      req.user!.role,
      req.user!.sub,
      req.query as any,
    );
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Correction requests
// =============================================================================

export async function createCorrectionRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.createCorrectionRequest(
      req.tenantId!,
      req.user!.role,
      req.user!.sub,
      req.body,
    );
    successResponse(res, result, 'Correction request submitted', 201);
  } catch (error) {
    next(error);
  }
}

export async function listCorrectionRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { requests, total } = await attendanceService.listCorrectionRequests(
      req.tenantId!,
      req.user!.role,
      req.user!.sub,
      req.query as any,
    );
    paginatedResponse(res, requests, total, (req.query as any).page, (req.query as any).pageSize);
  } catch (error) {
    next(error);
  }
}

export async function resolveCorrectionRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.resolveCorrectionRequest(
      req.tenantId!,
      req.params.id,
      req.body,
      req.user!.sub,
    );
    successResponse(res, result, 'Correction request resolved');
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Teacher-assignment CRUD
// =============================================================================

export async function createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.createAssignment(req.tenantId!, req.body, req.user!.sub);
    successResponse(res, result, 'Assignment created', 201);
  } catch (error) {
    next(error);
  }
}

export async function listAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await attendanceService.listAssignments(req.tenantId!, req.query as any);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function updateAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if ('teacherId' in req.body || 'sectionId' in req.body || 'subject' in req.body) {
      throw new BadRequestError(
        'teacherId, sectionId, and subject cannot be changed on an existing assignment — create a new assignment and end-date the old one instead',
      );
    }
    const validated = UpdateAssignmentDto.parse(req.body);
    const result = await attendanceService.updateAssignment(req.tenantId!, req.params.id, validated);
    successResponse(res, result, 'Assignment updated');
  } catch (error) {
    next(error);
  }
}

export async function deleteAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await attendanceService.deleteAssignment(req.tenantId!, req.params.id);
    successResponse(res, null, 'Assignment deleted');
  } catch (error) {
    next(error);
  }
}
