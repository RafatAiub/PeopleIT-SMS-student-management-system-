import { Request, Response, NextFunction } from 'express';
import * as academicsService from './academics.service';
import { successResponse } from '../../utils/response';

// =============================================================================
// Academics Controller — thin layer, delegates to academics.service.ts
// =============================================================================

// ── Medium ──────────────────────────────────────────────────────────
export async function listMediums(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mediums = await academicsService.listMediums(req.tenantId!);
    successResponse(res, mediums);
  } catch (error) {
    next(error);
  }
}

export async function createMedium(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const medium = await academicsService.createMedium(req.tenantId!, req.body);
    successResponse(res, medium, 'Medium created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateMedium(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const medium = await academicsService.updateMedium(req.tenantId!, req.params.id, req.body);
    successResponse(res, medium, 'Medium updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteMedium(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await academicsService.deleteMedium(req.tenantId!, req.params.id);
    successResponse(res, null, 'Medium deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Stream ──────────────────────────────────────────────────────────
export async function listStreams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const streams = await academicsService.listStreams(req.tenantId!);
    successResponse(res, streams);
  } catch (error) {
    next(error);
  }
}

export async function createStream(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stream = await academicsService.createStream(req.tenantId!, req.body);
    successResponse(res, stream, 'Stream created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateStream(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stream = await academicsService.updateStream(req.tenantId!, req.params.id, req.body);
    successResponse(res, stream, 'Stream updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteStream(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await academicsService.deleteStream(req.tenantId!, req.params.id);
    successResponse(res, null, 'Stream deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Shift ───────────────────────────────────────────────────────────
export async function listShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shifts = await academicsService.listShifts(req.tenantId!);
    successResponse(res, shifts);
  } catch (error) {
    next(error);
  }
}

export async function createShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shift = await academicsService.createShift(req.tenantId!, req.body);
    successResponse(res, shift, 'Shift created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shift = await academicsService.updateShift(req.tenantId!, req.params.id, req.body);
    successResponse(res, shift, 'Shift updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteShift(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await academicsService.deleteShift(req.tenantId!, req.params.id);
    successResponse(res, null, 'Shift deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Semester ────────────────────────────────────────────────────────
export async function listSemesters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const semesters = await academicsService.listSemesters(req.tenantId!);
    successResponse(res, semesters);
  } catch (error) {
    next(error);
  }
}

export async function createSemester(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const semester = await academicsService.createSemester(req.tenantId!, req.body);
    successResponse(res, semester, 'Semester created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSemester(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const semester = await academicsService.updateSemester(req.tenantId!, req.params.id, req.body);
    successResponse(res, semester, 'Semester updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteSemester(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await academicsService.deleteSemester(req.tenantId!, req.params.id);
    successResponse(res, null, 'Semester deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Student Categories ──────────────────────────────────────────────
export async function listStudentCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await academicsService.listStudentCategories(req.tenantId!);
    successResponse(res, categories);
  } catch (error) {
    next(error);
  }
}

export async function createStudentCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await academicsService.createStudentCategory(req.tenantId!, req.body);
    successResponse(res, category, 'Student category created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateStudentCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await academicsService.updateStudentCategory(req.tenantId!, req.params.id, req.body);
    successResponse(res, category, 'Student category updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteStudentCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await academicsService.deleteStudentCategory(req.tenantId!, req.params.id);
    successResponse(res, null, 'Student category deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Class ───────────────────────────────────────────────────────────
export async function listClasses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const classes = await academicsService.listClasses(req.tenantId!);
    successResponse(res, classes);
  } catch (error) {
    next(error);
  }
}

export async function createClass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cls = await academicsService.createClass(req.tenantId!, req.body);
    successResponse(res, cls, 'Class created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateClass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cls = await academicsService.updateClass(req.tenantId!, req.params.id, req.body);
    successResponse(res, cls, 'Class updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteClass(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await academicsService.deleteClass(req.tenantId!, req.params.id);
    successResponse(res, null, 'Class deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Section ─────────────────────────────────────────────────────────
export async function listSections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { classId } = req.query as { classId?: string };
    const sections = await academicsService.listSections(req.tenantId!, classId);
    successResponse(res, sections);
  } catch (error) {
    next(error);
  }
}

export async function createSection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const section = await academicsService.createSection(req.tenantId!, req.body);
    successResponse(res, section, 'Section created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const section = await academicsService.updateSection(req.tenantId!, req.params.id, req.body);
    successResponse(res, section, 'Section updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteSection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await academicsService.deleteSection(req.tenantId!, req.params.id);
    successResponse(res, null, 'Section deleted successfully');
  } catch (error) {
    next(error);
  }
}
