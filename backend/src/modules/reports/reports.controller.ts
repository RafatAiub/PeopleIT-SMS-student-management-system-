import { Request, Response, NextFunction } from 'express';
import { reportsService } from './reports.service';
import { successResponse } from '../../utils/response';

export class ReportsController {
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const institutionId = req.tenantId || req.user!.institutionId || '';
      const stats = await reportsService.getDashboardStats(institutionId);
      return successResponse(res, stats, 'Dashboard stats retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getAdminOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const institutionId = req.tenantId || req.user!.institutionId || '';
      const overview = await reportsService.getAdminOverview(institutionId);
      return successResponse(res, overview, 'Admin overview retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const reportsController = new ReportsController();
