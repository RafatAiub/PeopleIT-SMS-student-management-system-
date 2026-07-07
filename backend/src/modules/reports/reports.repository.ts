import prisma from '../../config/prisma';

export class ReportsRepository {
  async getDashboardStats(institutionId: string) {
    const totalStudents = await prisma.student.count({
      where: { institutionId, status: 'ACTIVE' },
    });

    const totalTeachers = await prisma.staffProfile.count({
      where: { institutionId, designation: 'TEACHER', status: 'ACTIVE' },
    });

    // We can't sum directly if revenue is from invoices
    const invoices = await prisma.invoice.aggregate({
      where: { institutionId, status: 'PAID' },
      _sum: {
        paidAmount: true,
      },
    });

    const totalRevenue = invoices._sum.paidAmount || 0;

    // Attendance rate
    const attendances = await prisma.attendance.findMany({
      where: { institutionId },
    });

    let attendanceRate = 0;
    if (attendances.length > 0) {
      const presentCount = attendances.filter(a => a.status === 'PRESENT').length;
      attendanceRate = (presentCount / attendances.length) * 100;
    }

    return {
      totalStudents,
      totalTeachers,
      totalRevenue,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
    };
  }
}

export const reportsRepository = new ReportsRepository();
