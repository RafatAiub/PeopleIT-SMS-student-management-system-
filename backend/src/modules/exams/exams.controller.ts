import { Request, Response, NextFunction } from 'express';
import * as examsService from './exams.service';
import { successResponse } from '../../utils/response';

type Handler = (req: Request, res: Response) => Promise<void>;

// Every action here is "call the service, send the result" — this wrapper
// keeps the try/next(error) boilerplate in one place.
const handle = (fn: Handler) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};

// ── Lookups ──────────────────────────────────────────────────────────────

export const listSessionYears = handle(async (req, res) => {
  successResponse(res, await examsService.listSessionYears(req.tenantId!));
});

// ── Exams ────────────────────────────────────────────────────────────────

export const listExams = handle(async (req, res) => {
  successResponse(res, await examsService.listExams(req.tenantId!, req.query as any));
});

export const createExam = handle(async (req, res) => {
  const exam = await examsService.createExam(req.tenantId!, req.body);
  successResponse(res, exam, 'Exam created successfully', 201);
});

export const updateExam = handle(async (req, res) => {
  const exam = await examsService.updateExam(req.tenantId!, req.params.id, req.body);
  successResponse(res, exam, 'Exam updated successfully');
});

export const setExamPublished = handle(async (req, res) => {
  const exam = await examsService.setExamPublished(req.tenantId!, req.params.id, req.body.isPublished);
  successResponse(res, exam, req.body.isPublished ? 'Exam published' : 'Exam unpublished');
});

export const deleteExam = handle(async (req, res) => {
  await examsService.deleteExam(req.tenantId!, req.params.id);
  successResponse(res, null, 'Exam deleted successfully');
});

// ── Exam Timetable ───────────────────────────────────────────────────────

export const listTimetable = handle(async (req, res) => {
  successResponse(res, await examsService.listTimetable(req.tenantId!, req.query as any));
});

export const createTimetable = handle(async (req, res) => {
  const rows = await examsService.createTimetable(req.tenantId!, req.body);
  successResponse(res, rows, 'Exam timetable saved successfully', 201);
});

export const updateTimetableEntry = handle(async (req, res) => {
  const row = await examsService.updateTimetableEntry(req.tenantId!, req.params.id, req.body);
  successResponse(res, row, 'Timetable entry updated successfully');
});

export const deleteTimetableEntry = handle(async (req, res) => {
  await examsService.deleteTimetableEntry(req.tenantId!, req.params.id);
  successResponse(res, null, 'Timetable entry deleted successfully');
});

// ── Exam Grades ──────────────────────────────────────────────────────────

export const listGrades = handle(async (req, res) => {
  successResponse(res, await examsService.listGrades(req.tenantId!));
});

export const saveGrades = handle(async (req, res) => {
  const grades = await examsService.saveGrades(req.tenantId!, req.body);
  successResponse(res, grades, 'Grades saved successfully');
});

// ── Exam Result ──────────────────────────────────────────────────────────

export const getClassResults = handle(async (req, res) => {
  successResponse(res, await examsService.getClassResults(req.tenantId!, req.query as any));
});
