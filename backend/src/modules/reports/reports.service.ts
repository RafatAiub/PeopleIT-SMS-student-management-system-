import { reportsRepository } from './reports.repository';

export class ReportsService {
  async getDashboardStats(institutionId: string) {
    return reportsRepository.getDashboardStats(institutionId);
  }

  async getAdminOverview(institutionId: string) {
    return reportsRepository.getAdminOverview(institutionId);
  }
}

export const reportsService = new ReportsService();
