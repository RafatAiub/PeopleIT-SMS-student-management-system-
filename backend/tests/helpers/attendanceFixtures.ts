import { prisma } from './fixtures';

/** Creates a Branch/Class/Section tree plus `count` ACTIVE students in that
 * section, for a given institution. Returns everything needed to clean up. */
export async function createSectionWithStudents(institutionId: string, label: string, count = 3) {
  const branch = await prisma.branch.create({ data: { institutionId, name: `Branch-${label}` } });
  const classRow = await prisma.class.create({ data: { branchId: branch.id, name: `Class-${label}`, level: 5 } });
  const section = await prisma.section.create({ data: { classId: classRow.id, name: `Sec-${label}` } });

  const students = [];
  for (let i = 0; i < count; i++) {
    const student = await prisma.student.create({
      data: {
        institutionId,
        branchId: branch.id,
        classId: classRow.id,
        sectionId: section.id,
        studentId: `STU-${label}-${i}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        firstName: `Stu${i}`,
        lastName: label,
        rollNumber: String(i + 1),
        status: 'ACTIVE',
      },
    });
    students.push(student);
  }

  return { branch, classRow, section, students };
}

export async function cleanupSectionWithStudents(ctx: { branch: { id: string }; classRow: { id: string }; section: { id: string }; students: { id: string }[] }) {
  const studentIds = ctx.students.map((s) => s.id);
  await prisma.attendanceRecord.deleteMany({ where: { studentId: { in: studentIds } } });
  await prisma.attendanceRegister.deleteMany({ where: { sectionId: ctx.section.id } });
  await prisma.teacherSectionAssignment.deleteMany({ where: { sectionId: ctx.section.id } });
  await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  await prisma.section.deleteMany({ where: { id: ctx.section.id } });
  await prisma.class.deleteMany({ where: { id: ctx.classRow.id } });
  await prisma.branch.deleteMany({ where: { id: ctx.branch.id } });
}

/** Creates a Teacher profile for an existing User (e.g. the fixture's TEACHER-role user, or a brand new one). */
export async function createTeacherProfile(userId: string) {
  return prisma.teacher.create({ data: { userId } });
}

/** Creates a brand-new second TEACHER user (with Teacher profile) in the same institution, for
 * multi-teacher ownership tests. */
export async function createExtraTeacherUser(institutionId: string, label: string) {
  const bcrypt = await import('bcryptjs');
  const jwt = await import('jsonwebtoken');
  const { env } = await import('../../src/config/env');
  const passwordHash = await bcrypt.hash('Test1234!', 4);
  const user = await prisma.user.create({
    data: {
      institutionId,
      email: `teacher2.${label}.${Date.now()}@test.local`,
      passwordHash,
      role: 'TEACHER',
      firstName: 'Extra',
      lastName: 'Teacher',
    },
  });
  const teacher = await prisma.teacher.create({ data: { userId: user.id } });
  const token = jwt.sign(
    { sub: user.id, institutionId, role: 'TEACHER', email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any },
  );
  return { user, teacher, token };
}

export async function cleanupExtraTeacherUser(userId: string) {
  await prisma.teacher.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

export function dateOnlyUTC(isoDate: string): Date {
  return new Date(isoDate + 'T00:00:00.000Z');
}
