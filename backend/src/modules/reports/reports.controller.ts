import { Request, Response } from 'express';
import { reportsService } from './reports.service';

export class ReportsController {
  async getDashboard(req: Request, res: Response) {
    try {
      const institutionId = req.user!.institutionId || '';
      const stats = await reportsService.getDashboardStats(institutionId);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export const reportsController = new ReportsController();
