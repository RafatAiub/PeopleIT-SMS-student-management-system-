import { Request, Response, NextFunction } from 'express';
import * as resultsService from './results.service';
import { successResponse, paginatedResponse } from '../../utils/response';

// ── Exam Controller Actions ─────────────────────────────────────────────────

export async function createExam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const exam = await resultsService.createExam(req.tenantId!, req.body);
    successResponse(res, exam, 'Exam created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function updateExam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const exam = await resultsService.updateExam(req.tenantId!, req.params.id, req.body);
    successResponse(res, exam, 'Exam updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getExam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const exam = await resultsService.getExam(req.tenantId!, req.params.id);
    successResponse(res, exam);
  } catch (error) {
    next(error);
  }
}

export async function listExams(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { exams, total } = await resultsService.listExams(req.tenantId!, req.query as any);
    paginatedResponse(
      res,
      exams,
      total,
      Number(req.query.page) || 1,
      Number(req.query.pageSize) || 20,
    );
  } catch (error) {
    next(error);
  }
}

export async function deleteExam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await resultsService.deleteExam(req.tenantId!, req.params.id);
    successResponse(res, null, 'Exam deleted successfully');
  } catch (error) {
    next(error);
  }
}

// ── Exam Result Controller Actions ──────────────────────────────────────────

export async function submitResults(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const records = await resultsService.submitExamResults(req.tenantId!, req.body);
    successResponse(res, { count: records.length }, 'Exam results submitted successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function listResults(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { records, total } = await resultsService.listResults(req.tenantId!, req.query as any);
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

export async function getMarksheet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const marksheet = await resultsService.getMarksheet(req.tenantId!, req.query as any);
    successResponse(res, marksheet);
  } catch (error) {
    next(error);
  }
}

export async function getMyResults(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const records = await resultsService.getMyResults(
      req.tenantId!,
      { sub: req.user!.sub, role: req.user!.role },
      req.query as any,
    );
    successResponse(res, records);
  } catch (error) {
    next(error);
  }
}

export async function getReportCard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const examId = req.query.examId as string;
    if (!examId) {
      res.status(400).json({ success: false, message: 'examId query parameter is required' });
      return;
    }
    const pdf = await resultsService.generateReportCard(req.tenantId!, req.params.studentId, examId, req.user!);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report-card-${req.params.studentId}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
}

export async function deleteResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await resultsService.deleteResult(req.tenantId!, req.params.id);
    successResponse(res, null, 'Exam result deleted successfully');
  } catch (error) {
    next(error);
  }
}
