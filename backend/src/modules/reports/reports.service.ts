import { reportsRepository } from './reports.repository';

export class ReportsService {
  async getDashboardStats(institutionId: string) {
    return reportsRepository.getDashboardStats(institutionId);
  }
}

export const reportsService = new ReportsService();
