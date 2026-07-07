import { prisma } from '../../config/prisma';
import type { GenerateCommentDtoType } from './ai.dto';

/**
 * Simulates AI comment generator for student report cards based on subject, marks, and grade.
 */
export async function generateComment(data: GenerateCommentDtoType) {
  const { subject, marks, grade } = data;
  const upperGrade = grade.toUpperCase();

  let comment = `Good participation in ${subject}. Continue focusing on key concepts.`;

  if (['A+', 'A', 'A-'].includes(upperGrade) || marks >= 80) {
    comment = `Excellent work in ${subject}! The student demonstrates an outstanding understanding of concepts and excels in classroom activities.`;
  } else if (['B+', 'B', 'B-'].includes(upperGrade) || (marks >= 65 && marks < 80)) {
    comment = `Good effort in ${subject}, keep it up! Showed solid comprehension of the coursework and positive engagement.`;
  } else if (['C+', 'C', 'C-'].includes(upperGrade) || (marks >= 50 && marks < 65)) {
    comment = `Fair performance in ${subject}. The student understands the basics but would benefit from reviewing challenging topics regularly and seeking extra help.`;
  } else if (['D', 'F', 'E'].includes(upperGrade) || marks < 50) {
    comment = `The student is struggling in ${subject} and requires additional support. Targeted intervention and regular study habits are strongly advised.`;
  }

  return {
    subject,
    marks,
    grade,
    comment,
    generatedAt: new Date(),
  };
}

/**
 * Simulates Academic Risk Scoring.
 * Fetches students with attendance < 80% or grade averages < C and marks them as HIGH/MEDIUM risk.
 */
export async function getAcademicRiskScoring(institutionId: string) {
  const students = await prisma.student.findMany({
    where: { institutionId },
    include: {
      Attendance: true,
      ExamResult: true,
    },
  });

  const riskProfiles = students.map((student) => {
    // Attendance calculation
    const totalAttendance = student.Attendance.length;
    const presentCount = student.Attendance.filter(
      (a) => a.status === 'PRESENT' || a.status === 'LATE',
    ).length;
    const attendanceRate = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 100;

    // Exam grade average calculations
    const grades = student.ExamResult;
    const averageMarks =
      grades.length > 0
        ? grades.reduce((acc, curr) => acc + Number(curr.marksObtained), 0) / grades.length
        : 100;

    const hasLowGrades = grades.some((g) =>
      ['C', 'C-', 'D', 'F', 'E'].includes((g.grade || '').toUpperCase()),
    );
    const hasFailGrades = grades.some((g) =>
      ['D', 'F'].includes((g.grade || '').toUpperCase()),
    );

    let riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    let reason = 'Student is performing well with good attendance and grades.';

    if (attendanceRate < 75 || hasFailGrades) {
      riskLevel = 'HIGH';
      reason = `Critical risk: Attendance is at ${attendanceRate.toFixed(1)}% (below 80% threshold) or student has failing/poor grades (D/F).`;
    } else if (attendanceRate < 80 || hasLowGrades || averageMarks < 60) {
      riskLevel = 'MEDIUM';
      reason = `Medium risk: Attendance is at ${attendanceRate.toFixed(1)}% or student grade average is below C (Marks: ${averageMarks.toFixed(1)}%).`;
    }

    return {
      studentId: student.id,
      registrationNumber: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      attendanceRate,
      averageMarks,
      riskLevel,
      reason,
    };
  });

  // Filter or return all profiles
  return riskProfiles;
}

/**
 * Simulates Dashboard Insights.
 * Generates summary text of the institution's performance and billing status.
 */
export async function getDashboardInsights(institutionId: string) {
  // Query actual metric counts
  const studentCount = await prisma.student.count({
    where: { institutionId, status: 'ACTIVE' },
  });

  const staffCount = await prisma.staffProfile.count({
    where: { institutionId, status: 'ACTIVE' },
  });

  const unpaidInvoices = await prisma.invoice.findMany({
    where: {
      institutionId,
      status: { in: ['UNPAID', 'PARTIAL'] },
    },
    select: {
      dueAmount: true,
    },
  });

  const totalOutstandingDue = unpaidInvoices.reduce(
    (sum, inv) => sum + Number(inv.dueAmount),
    0,
  );

  const noticesCount = await prisma.notice.count({
    where: { institutionId, isActive: true },
  });

  const summary = `AI Executive Summary for Institution:
- Enrolled Active Students: ${studentCount}
- Active Staff Members: ${staffCount}
- Outstanding Collections: $${totalOutstandingDue.toFixed(2)} across ${unpaidInvoices.length} unpaid or partial invoices.
- Notice Board Activity: ${noticesCount} active announcements.

AI Recommendations:
1. Operational: There are ${unpaidInvoices.length} invoices overdue/unpaid. Trigger automated billing reminders to improve collection cycles.
2. Academic: Monitor students identified under high risk scoring to plan remediation classes before the next term exams.`;

  return {
    studentCount,
    staffCount,
    totalOutstandingDue,
    summary,
    generatedAt: new Date(),
  };
}
