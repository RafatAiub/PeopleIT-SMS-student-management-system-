import { Request, Response, NextFunction } from 'express';
import * as aiService from './ai.service';
import { successResponse } from '../../utils/response';

export async function generateComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await aiService.generateComment(req.body);
    successResponse(res, result, 'AI comment generated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getAcademicRiskScoring(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const riskScores = await aiService.getAcademicRiskScoring(req.tenantId!);
    successResponse(res, riskScores, 'Academic risk scores retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getDashboardInsights(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const insights = await aiService.getDashboardInsights(req.tenantId!);
    successResponse(res, insights, 'Dashboard insights generated successfully');
  } catch (error) {
    next(error);
  }
}
