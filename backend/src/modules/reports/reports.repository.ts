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

    // Attendance rate — computed via DB-side counts rather than pulling the
    // entire attendance history into memory. Same all-time semantics as
    // before (no date bound), just computed without a findMany.
    const [totalAttendance, presentAttendance] = await Promise.all([
      prisma.attendance.count({ where: { institutionId } }),
      prisma.attendance.count({ where: { institutionId, status: 'PRESENT' } }),
    ]);

    let attendanceRate = 0;
    if (totalAttendance > 0) {
      attendanceRate = (presentAttendance / totalAttendance) * 100;
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

  /** Single-call aggregate powering the institution Admin's dashboard
   *  (KPI strip, fee/attendance/gender donuts, top performer, notices) —
   *  replaces the old 4-request client-side assembly. */
  async getAdminOverview(institutionId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const now = new Date();

    const [
      totalStudents,
      currentAcademicYear,
      totalTeachers,
      totalClasses,
      totalStreams,
      genderGroups,
      collectedAgg,
      overdueAgg,
      upcomingAgg,
      attendanceGroups,
      latestExam,
      recentNotices,
    ] = await Promise.all([
      prisma.student.count({ where: { institutionId, status: 'ACTIVE' } }),
      prisma.academicYear.findFirst({ where: { institutionId, isCurrent: true }, select: { id: true, label: true } }),
      prisma.user.count({ where: { institutionId, role: 'TEACHER', isActive: true } }),
      prisma.class.count({ where: { branch: { institutionId } } }),
      prisma.stream.count({ where: { institutionId } }),
      prisma.student.groupBy({
        by: ['gender'],
        where: { institutionId, status: 'ACTIVE' },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({ where: { institutionId }, _sum: { paidAmount: true } }),
      prisma.invoice.aggregate({
        where: {
          institutionId,
          OR: [
            { status: 'OVERDUE' },
            { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: now } },
          ],
        },
        _sum: { dueAmount: true },
      }),
      prisma.invoice.aggregate({
        where: { institutionId, status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { gte: now } },
        _sum: { dueAmount: true },
      }),
      prisma.attendance.groupBy({
        by: ['status'],
        where: { institutionId, date: { gte: todayStart, lte: todayEnd } },
        _count: { _all: true },
      }),
      prisma.exam.findFirst({ where: { institutionId }, orderBy: { endDate: 'desc' } }),
      prisma.notice.findMany({
        where: { institutionId, isActive: true },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, content: true, audience: true, publishedAt: true },
      }),
    ]);

    const sessionCount = currentAcademicYear
      ? await prisma.student.count({
          where: { institutionId, status: 'ACTIVE', academicYearId: currentAcademicYear.id },
        })
      : 0;
    // Many institutions don't consistently set Student.academicYearId — fall
    // back to the total so the KPI never shows a misleading 0.
    const sessionStudents = sessionCount > 0 ? sessionCount : totalStudents;

    const genderCounts = { male: 0, female: 0, other: 0 };
    for (const g of genderGroups) {
      const count = g._count._all;
      if (g.gender === 'MALE') genderCounts.male += count;
      else if (g.gender === 'FEMALE') genderCounts.female += count;
      else genderCounts.other += count;
    }

    const attendanceCounts = { present: 0, absent: 0, late: 0, halfDay: 0 };
    for (const a of attendanceGroups) {
      const count = a._count._all;
      if (a.status === 'PRESENT') attendanceCounts.present += count;
      else if (a.status === 'ABSENT') attendanceCounts.absent += count;
      else if (a.status === 'LATE') attendanceCounts.late += count;
      else if (a.status === 'HALF_DAY') attendanceCounts.halfDay += count;
    }
    const totalMarked = attendanceCounts.present + attendanceCounts.absent + attendanceCounts.late + attendanceCounts.halfDay;
    const percentPresent = totalMarked > 0
      ? Math.round(((attendanceCounts.present + attendanceCounts.late) / totalMarked) * 100)
      : 0;

    let topPerformers: Array<{ studentId: string; name: string; className: string | null; percentage: number }> = [];
    if (latestExam) {
      const resultRows = await prisma.examResult.groupBy({
        by: ['studentId'],
        where: { institutionId, examId: latestExam.id },
        _sum: { marksObtained: true, maxMarks: true },
      });

      const ranked = resultRows
        .map((r) => {
          const obtained = Number(r._sum.marksObtained || 0);
          const max = Number(r._sum.maxMarks || 0);
          return { studentId: r.studentId, percentage: max > 0 ? (obtained / max) * 100 : 0 };
        })
        .filter((r) => r.percentage > 0)
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 5);

      if (ranked.length > 0) {
        const students = await prisma.student.findMany({
          where: { id: { in: ranked.map((r) => r.studentId) } },
          select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
        });
        const byId = new Map(students.map((s) => [s.id, s]));
        topPerformers = ranked
          .map((r) => {
            const student = byId.get(r.studentId);
            if (!student) return null;
            return {
              studentId: r.studentId,
              name: `${student.firstName} ${student.lastName}`,
              className: student.class?.name ?? null,
              percentage: Math.round(r.percentage * 100) / 100,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
      }
    }

    return {
      counts: {
        totalStudents,
        sessionStudents,
        totalTeachers,
        totalClasses,
        totalStreams,
      },
      fees: {
        collected: Number(collectedAgg._sum.paidAmount || 0),
        upcomingDues: Number(upcomingAgg._sum.dueAmount || 0),
        overdue: Number(overdueAgg._sum.dueAmount || 0),
      },
      attendanceToday: {
        ...attendanceCounts,
        totalMarked,
        percentPresent,
      },
      genderBreakdown: genderCounts,
      topPerformers,
      recentNotices,
    };
  }
}

export const reportsRepository = new ReportsRepository();
