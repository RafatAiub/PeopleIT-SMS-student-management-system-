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

    // Last-7-days trend data for the dashboard charts (real data, not a
    // hardcoded placeholder array).
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [recentAttendance, recentPayments] = await Promise.all([
      prisma.attendance.findMany({
        where: { institutionId, date: { gte: sevenDaysAgo } },
        select: { date: true, status: true },
      }),
      prisma.payment.findMany({
        where: { invoice: { institutionId }, status: 'COMPLETED', paidAt: { gte: sevenDaysAgo } },
        select: { paidAt: true, amount: true },
      }),
    ]);

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const attendanceTrend: number[] = [];
    const feeTrend: number[] = [];

    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      const key = dayKey(day);

      const dayAttendance = recentAttendance.filter((a) => dayKey(a.date) === key);
      attendanceTrend.push(
        dayAttendance.length > 0
          ? Math.round((dayAttendance.filter((a) => a.status === 'PRESENT').length / dayAttendance.length) * 100)
          : 0,
      );

      const dayFees = recentPayments
        .filter((p) => dayKey(p.paidAt) === key)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      feeTrend.push(dayFees);
    }

    return {
      totalStudents,
      totalTeachers,
      totalRevenue,
      attendanceRate: Math.round(attendanceRate * 100) / 100,
      attendanceTrend,
      feeTrend,
    };
  }
}

export const reportsRepository = new ReportsRepository();
