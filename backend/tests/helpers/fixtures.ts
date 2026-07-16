import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

// Dedicated Prisma client for test setup/teardown — the app under test uses
// its own client instance (src/config/prisma.ts), this one is purely for
// fixture management so tests don't depend on app internals.
export const prisma = new PrismaClient();

const TENANT_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
  UserRole.TRANSPORT_OFFICER,
  UserRole.GUARDIAN,
  UserRole.STUDENT,
  UserRole.MANAGEMENT,
];

export interface RoleFixture {
  userId: string;
  token: string;
}

export interface InstitutionFixture {
  institutionId: string;
  slug: string;
  usersByRole: Record<UserRole, RoleFixture>;
  studentId: string; // the Prisma Student.id linked to the STUDENT-role user
  studentUserId: string; // the User.id of the STUDENT-role user (== usersByRole.STUDENT.userId)
  guardianId: string; // the Prisma Guardian.id linked to the GUARDIAN-role user, pre-linked to studentId
}

function signAccessToken(payload: { sub: string; institutionId: string | null; role: UserRole; email: string }) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any });
}

/**
 * Creates a fully-seeded test institution: one User per tenant role (plus a
 * SUPER_ADMIN with no institution), a Student profile for the STUDENT user,
 * a Guardian profile for the GUARDIAN user pre-linked to that student, and
 * signed access tokens for every role — everything an authorization test
 * needs without touching real/dev data. Call cleanupInstitution() in
 * afterAll to remove it.
 */
export async function createTestInstitution(labelSuffix: string): Promise<InstitutionFixture> {
  const slug = `test-${labelSuffix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const institution = await prisma.institution.create({
    data: { name: `Test Institution ${labelSuffix}`, slug },
  });

  // Low bcrypt cost — these are throwaway test credentials, never used for
  // real login, and low cost keeps the suite fast.
  const passwordHash = await bcrypt.hash('Test1234!', 4);

  const usersByRole = {} as Record<UserRole, RoleFixture>;

  for (const role of TENANT_ROLES) {
    const user = await prisma.user.create({
      data: {
        institutionId: institution.id,
        email: `${role.toLowerCase()}.${slug}@test.local`,
        passwordHash,
        role,
        firstName: 'Test',
        lastName: role,
      },
    });
    usersByRole[role] = {
      userId: user.id,
      token: signAccessToken({ sub: user.id, institutionId: institution.id, role, email: user.email }),
    };
  }

  const superAdminUser = await prisma.user.create({
    data: {
      institutionId: null,
      email: `super_admin.${slug}@test.local`,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      firstName: 'Test',
      lastName: 'SuperAdmin',
    },
  });
  usersByRole[UserRole.SUPER_ADMIN] = {
    userId: superAdminUser.id,
    token: signAccessToken({
      sub: superAdminUser.id,
      institutionId: null,
      role: UserRole.SUPER_ADMIN,
      email: superAdminUser.email,
    }),
  };

  // Student profile for the STUDENT-role user, so self-service/ownership
  // routes (e.g. GET /students/me, fee ownership scoping) have something real.
  const student = await prisma.student.create({
    data: {
      institutionId: institution.id,
      userId: usersByRole[UserRole.STUDENT].userId,
      studentId: `STU-${slug}`,
      firstName: 'Test',
      lastName: 'Student',
    },
  });

  // Guardian profile for the GUARDIAN-role user, pre-linked to the student
  // above, so guardian ownership-scoping tests have a real linkage to assert.
  const guardian = await prisma.guardian.create({
    data: {
      institutionId: institution.id,
      userId: usersByRole[UserRole.GUARDIAN].userId,
      relationship: 'FATHER',
      firstName: 'Test',
      lastName: 'Guardian',
      phone: '0000000000',
    },
  });
  await prisma.guardianStudent.create({
    data: { guardianId: guardian.id, studentId: student.id, isPrimary: true },
  });

  return {
    institutionId: institution.id,
    slug,
    usersByRole,
    studentId: student.id,
    studentUserId: usersByRole[UserRole.STUDENT].userId,
    guardianId: guardian.id,
  };
}

/** Removes everything created by createTestInstitution() for a given fixture. */
export async function cleanupInstitution(fixture: InstitutionFixture) {
  const { institutionId } = fixture;
  // Delete children before parents to satisfy FK constraints. Wrapped in
  // try/catch per step so a partial-failure test run still cleans up as
  // much as possible rather than leaking fixture data on every future run.
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.guardianStudent.deleteMany({ where: { studentId: fixture.studentId } }),
    () => prisma.guardian.deleteMany({ where: { institutionId } }),
    () => prisma.invoiceItem.deleteMany({ where: { invoice: { institutionId } } }),
    () => prisma.payment.deleteMany({ where: { invoice: { institutionId } } }),
    () => prisma.invoice.deleteMany({ where: { institutionId } }),
    () => prisma.feeCategory.deleteMany({ where: { institutionId } }),
    () => prisma.student.deleteMany({ where: { institutionId } }),
    () => prisma.auditLog.deleteMany({ where: { institutionId } }),
    // The authorization-matrix suite exercises real POST routes (e.g.
    // library/transport create endpoints), which write real rows against
    // this institution — clean those up too or the institution delete below
    // fails on a dangling FK.
    () => prisma.libraryIssue.deleteMany({ where: { institutionId } }),
    () => prisma.libraryBook.deleteMany({ where: { institutionId } }),
    () => prisma.transportAssignment.deleteMany({ where: { institutionId } }),
    () => prisma.transportRoute.deleteMany({ where: { institutionId } }),
    () => prisma.transportVehicle.deleteMany({ where: { institutionId } }),
    () => prisma.timetableSlot.deleteMany({ where: { institutionId } }),
    () => prisma.notice.deleteMany({ where: { institutionId } }),
    () => prisma.permission.deleteMany({ where: { institutionId } }),
    () => prisma.user.deleteMany({ where: { institutionId } }),
    () =>
      prisma.user.deleteMany({
        where: { email: { contains: `.${fixture.slug}@test.local` }, institutionId: null },
      }),
    () => prisma.institution.delete({ where: { id: institutionId } }),
  ];
  for (const step of steps) {
    await step().catch((err: Error) => {
      // Best-effort cleanup, but don't fail silently — a leftover row here
      // means real dev-DB junk, not just a test artifact.
      // eslint-disable-next-line no-console
      console.warn(`[fixtures] cleanup step failed for institution ${institutionId}: ${err.message}`);
    });
  }
}

export async function disconnectFixtures() {
  await prisma.$disconnect();
}
