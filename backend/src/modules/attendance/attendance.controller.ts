import { Request, Response, NextFunction } from 'express';
import * as attendanceService from './attendance.service';
import { successResponse, paginatedResponse } from '../../utils/response';
import { AssignTeacherDto, AttendanceSheetQueryDto } from './attendance.dto';

export async function submitAttendance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await attendanceService.submitBulkAttendance(req.tenantId!, req.body);
    successResponse(res, { count: result.length }, 'Attendance records saved successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getAttendanceList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { records, total } = await attendanceService.listAttendance(
      req.tenantId!,
      req.query as any,
    );
    paginatedResponse(
      res,
      records,
      total,
      Number(req.query.page) || 1,
      Number(req.query.pageSize) || 20,
    );
  } catch (error) {
    next(error);
  }
}

export async function assignTeacherToSection(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = AssignTeacherDto.parse(req.body);
    const result = await attendanceService.assignTeacherToSection(req.tenantId!, validated);
    successResponse(res, result, 'Teacher assigned to section successfully');
  } catch (error) {
    next(error);
  }
}

export async function listAssignments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await attendanceService.listAssignments(req.tenantId!);
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function listTeacherSections(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const list = await attendanceService.listTeacherSections(req.user!.sub, req.tenantId!);
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function getAttendanceSheet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query = AttendanceSheetQueryDto.parse(req.query);
    const list = await attendanceService.getAttendanceSheet(req.tenantId!, query);
    successResponse(res, list);
  } catch (error) {
    next(error);
  }
}

export async function getStudentAttendanceHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await attendanceService.getStudentAttendanceHistory(req.user!.sub, req.tenantId!);
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getChildAttendanceHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await attendanceService.getChildAttendanceHistory(
      req.tenantId!,
      req.params.studentId,
      req.user!.sub,
    );
    successResponse(res, result);
  } catch (error) {
    next(error);
  }
}
