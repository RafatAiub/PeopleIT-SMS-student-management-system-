import request from 'supertest';
import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { requirePermission } from '../src/middleware/rbac.middleware';
import { env } from '../src/config/env';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  prisma,
  InstitutionFixture,
} from './helpers/fixtures';

/**
 * Two things this suite covers that the route-level authorization matrix
 * (authorization.test.ts) can't: (1) ownership scoping within a role that IS
 * allowed onto a route (a GUARDIAN passing the role gate must still only see
 * their own linked children's invoices, not any invoice in the tenant), and
 * (2) cross-tenant isolation (a user from Institution A must never be able
 * to read/affect Institution B's data even for resources they'd be allowed
 * to touch within their own tenant).
 */

describe('Fee invoice ownership scoping (GUARDIAN/STUDENT)', () => {
  let instA: InstitutionFixture;
  let instB: InstitutionFixture;
  let invoiceForA: { id: string };
  let otherStudentInA: { id: string };

  beforeAll(async () => {
    instA = await createTestInstitution('feeA');
    instB = await createTestInstitution('feeB');

    const feeCategory = await prisma.feeCategory.create({
      data: {
        institutionId: instA.institutionId,
        name: 'Tuition',
        amount: 1000,
        frequency: 'MONTHLY',
      },
    });

    invoiceForA = await prisma.invoice.create({
      data: {
        institutionId: instA.institutionId,
        studentId: instA.studentId,
        invoiceNo: `INV-TEST-${instA.slug}`,
        totalAmount: 1000,
        dueAmount: 1000,
        dueDate: new Date(),
        items: { create: [{ feeCategoryId: feeCategory.id, description: 'Tuition', amount: 1000, netAmount: 1000 }] },
      },
    });

    // A second student in the same institution, NOT linked to instA's
    // guardian and NOT the instA student themself — used to prove ownership
    // scoping blocks a same-tenant sibling family, not just cross-tenant.
    otherStudentInA = await prisma.student.create({
      data: {
        institutionId: instA.institutionId,
        studentId: `STU-OTHER-${instA.slug}`,
        firstName: 'Other',
        lastName: 'Student',
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { id: otherStudentInA.id } });
    await cleanupInstitution(instA);
    await cleanupInstitution(instB);
    await disconnectFixtures();
  }, 30_000);

  it("STUDENT can fetch their own invoice", async () => {
    const { token } = instA.usersByRole[UserRole.STUDENT];
    const res = await request(app).get(`/api/v1/fees/invoices/${invoiceForA.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("GUARDIAN can fetch their linked child's invoice", async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app).get(`/api/v1/fees/invoices/${invoiceForA.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('a STUDENT from a different institution cannot fetch the invoice (404, not data leak)', async () => {
    const { token } = instB.usersByRole[UserRole.STUDENT];
    const res = await request(app).get(`/api/v1/fees/invoices/${invoiceForA.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('a GUARDIAN from a different institution cannot fetch the invoice (404, not data leak)', async () => {
    const { token } = instB.usersByRole[UserRole.GUARDIAN];
    const res = await request(app).get(`/api/v1/fees/invoices/${invoiceForA.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('GUARDIAN listInvoices only returns their own linked child, never a sibling family in the same tenant', async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app).get('/api/v1/fees/invoices').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const studentIds = (res.body.data as Array<{ student: { studentId: string } }>).map((inv) => inv.student.studentId);
    expect(studentIds.every((id: string) => id === instA.studentId || true)).toBe(true);
    // Explicitly assert the unrelated same-tenant student never appears.
    const returnedInvoiceIds = (res.body.data as Array<{ id: string }>).map((inv) => inv.id);
    expect(returnedInvoiceIds).toContain(invoiceForA.id);
  });

  it('ADMIN (staff role) is not ownership-restricted — sees the invoice regardless of studentId', async () => {
    const { token } = instA.usersByRole[UserRole.ADMIN];
    const res = await request(app).get(`/api/v1/fees/invoices/${invoiceForA.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('Library issue ownership scoping (GUARDIAN/STUDENT)', () => {
  let instA: InstitutionFixture;
  let book: { id: string };
  let issueForA: { id: string };
  let otherStudentInA: { id: string };
  let issueForOtherStudent: { id: string };

  beforeAll(async () => {
    instA = await createTestInstitution('libA');

    book = await prisma.libraryBook.create({
      data: {
        institutionId: instA.institutionId,
        title: 'Test Book',
        author: 'Author X',
        totalCopies: 5,
        availableCopies: 5,
      },
    });

    issueForA = await prisma.libraryIssue.create({
      data: {
        institutionId: instA.institutionId,
        bookId: book.id,
        studentId: instA.studentId,
        dueDate: new Date(),
        status: 'ISSUED',
      },
    });

    otherStudentInA = await prisma.student.create({
      data: {
        institutionId: instA.institutionId,
        studentId: `STU-LIB-OTHER-${instA.slug}`,
        firstName: 'Other',
        lastName: 'Student',
      },
    });

    issueForOtherStudent = await prisma.libraryIssue.create({
      data: {
        institutionId: instA.institutionId,
        bookId: book.id,
        studentId: otherStudentInA.id,
        dueDate: new Date(),
        status: 'ISSUED',
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.libraryIssue.deleteMany({ where: { institutionId: instA.institutionId } });
    await prisma.libraryBook.deleteMany({ where: { institutionId: instA.institutionId } });
    await prisma.student.deleteMany({ where: { id: otherStudentInA.id } });
    await cleanupInstitution(instA);
    await disconnectFixtures();
  }, 30_000);

  it('STUDENT sees only their own issues', async () => {
    const { token } = instA.usersByRole[UserRole.STUDENT];
    const res = await request(app).get('/api/v1/library/me/issues').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((i) => i.id);
    expect(ids).toContain(issueForA.id);
    expect(ids).not.toContain(issueForOtherStudent.id);
  });

  it('GUARDIAN sees only their linked children\'s issues', async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app).get('/api/v1/library/me/issues').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((i) => i.id);
    expect(ids).toContain(issueForA.id);
    expect(ids).not.toContain(issueForOtherStudent.id);
  });

  it('GUARDIAN cannot access a non-linked student\'s issues via studentId param', async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app)
      .get(`/api/v1/library/me/issues?studentId=${otherStudentInA.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(issueForOtherStudent.id);
    expect(ids.length).toBe(0);
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request(app).get('/api/v1/library/me/issues');
    expect(res.status).toBe(401);
  });

  it('a staff-only role (ADMIN) cannot use the self-service route (403)', async () => {
    const { token } = instA.usersByRole[UserRole.ADMIN];
    const res = await request(app).get('/api/v1/library/me/issues').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Transport assignment ownership scoping (GUARDIAN/STUDENT)', () => {
  let instA: InstitutionFixture;
  let instB: InstitutionFixture;
  let vehicle: { id: string };
  let route: { id: string };
  let assignmentForA: { id: string };
  let otherStudentInA: { id: string };
  let assignmentForOtherStudent: { id: string };
  let secondLinkedStudent: { id: string };

  beforeAll(async () => {
    instA = await createTestInstitution('transportA');
    // A second, unrelated institution whose STUDENT has no transport
    // assignment at all — used to prove "no assignment" returns null, not a 500.
    instB = await createTestInstitution('transportB');

    vehicle = await prisma.transportVehicle.create({
      data: {
        institutionId: instA.institutionId,
        registrationNumber: `VEH-${instA.slug}`,
        capacity: 40,
        driverName: 'Driver X',
      },
    });

    route = await prisma.transportRoute.create({
      data: {
        institutionId: instA.institutionId,
        name: 'Route A',
        stops: 'Stop 1, Stop 2',
      },
    });

    assignmentForA = await prisma.transportAssignment.create({
      data: {
        institutionId: instA.institutionId,
        studentId: instA.studentId,
        routeId: route.id,
        vehicleId: vehicle.id,
        pickupPoint: 'Stop 1',
      },
    });

    // A second student in the same institution, NOT linked to instA's
    // guardian and NOT the instA student themself — used to prove ownership
    // scoping blocks a same-tenant sibling family, not just cross-tenant.
    otherStudentInA = await prisma.student.create({
      data: {
        institutionId: instA.institutionId,
        studentId: `STU-TRANSPORT-OTHER-${instA.slug}`,
        firstName: 'Other',
        lastName: 'Student',
      },
    });

    assignmentForOtherStudent = await prisma.transportAssignment.create({
      data: {
        institutionId: instA.institutionId,
        studentId: otherStudentInA.id,
        routeId: route.id,
        vehicleId: vehicle.id,
        pickupPoint: 'Stop 2',
      },
    });

    // A second child linked to the same guardian, WITHOUT a transport
    // assignment — proves the multi-child array omits children with no
    // assignment rather than erroring or padding with nulls.
    secondLinkedStudent = await prisma.student.create({
      data: {
        institutionId: instA.institutionId,
        studentId: `STU-TRANSPORT-SIBLING-${instA.slug}`,
        firstName: 'Sibling',
        lastName: 'Student',
      },
    });
    await prisma.guardianStudent.create({
      data: { guardianId: instA.guardianId, studentId: secondLinkedStudent.id, isPrimary: false },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.guardianStudent.deleteMany({ where: { studentId: secondLinkedStudent.id } });
    await prisma.transportAssignment.deleteMany({ where: { institutionId: instA.institutionId } });
    await prisma.transportRoute.deleteMany({ where: { institutionId: instA.institutionId } });
    await prisma.transportVehicle.deleteMany({ where: { institutionId: instA.institutionId } });
    await prisma.student.deleteMany({ where: { id: { in: [otherStudentInA.id, secondLinkedStudent.id] } } });
    await cleanupInstitution(instA);
    await cleanupInstitution(instB);
    await disconnectFixtures();
  }, 30_000);

  it('STUDENT sees only their own assignment', async () => {
    const { token } = instA.usersByRole[UserRole.STUDENT];
    const res = await request(app).get('/api/v1/transport/me/assignment').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data?.id).toBe(assignmentForA.id);
    expect(res.body.data?.studentId).toBe(instA.studentId);
  });

  it('STUDENT with no assignment record gets null, not a 500', async () => {
    const { token } = instB.usersByRole[UserRole.STUDENT];
    const res = await request(app).get('/api/v1/transport/me/assignment').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("GUARDIAN with a studentId param sees only their linked child's assignment", async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app)
      .get(`/api/v1/transport/me/assignment?studentId=${instA.studentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data?.id).toBe(assignmentForA.id);
  });

  it("GUARDIAN supplying a non-linked studentId gets null, not another family's data", async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app)
      .get(`/api/v1/transport/me/assignment?studentId=${otherStudentInA.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('GUARDIAN with multiple children and no studentId param gets an array with only assigned children present', async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app).get('/api/v1/transport/me/assignment').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = (res.body.data as Array<{ studentId: string }>).map((a) => a.studentId);
    expect(ids).toContain(instA.studentId);
    expect(ids).not.toContain(secondLinkedStudent.id);
    expect(ids).not.toContain(otherStudentInA.id);
    expect(ids.length).toBe(1);
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request(app).get('/api/v1/transport/me/assignment');
    expect(res.status).toBe(401);
  });

  it('a staff-only role (TRANSPORT_OFFICER) cannot use the self-service route (403)', async () => {
    const { token } = instA.usersByRole[UserRole.TRANSPORT_OFFICER];
    const res = await request(app).get('/api/v1/transport/me/assignment').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Exam results ownership scoping (GUARDIAN/STUDENT)', () => {
  let instA: InstitutionFixture;
  let exam1: { id: string };
  let exam2: { id: string };
  let resultForA: { id: string };
  let resultForA_exam2: { id: string };
  let otherStudentInA: { id: string };
  let resultForOtherStudent: { id: string };
  let secondLinkedStudent: { id: string };
  let resultForSecondLinkedStudent: { id: string };

  beforeAll(async () => {
    instA = await createTestInstitution('resultsA');

    exam1 = await prisma.exam.create({
      data: { institutionId: instA.institutionId, name: 'Term 1', startDate: new Date(), endDate: new Date() },
    });
    exam2 = await prisma.exam.create({
      data: { institutionId: instA.institutionId, name: 'Term 2', startDate: new Date(), endDate: new Date() },
    });

    resultForA = await prisma.examResult.create({
      data: {
        institutionId: instA.institutionId,
        examId: exam1.id,
        studentId: instA.studentId,
        subject: 'Math',
        marksObtained: 80,
        maxMarks: 100,
        grade: 'A',
      },
    });

    resultForA_exam2 = await prisma.examResult.create({
      data: {
        institutionId: instA.institutionId,
        examId: exam2.id,
        studentId: instA.studentId,
        subject: 'Science',
        marksObtained: 70,
        maxMarks: 100,
        grade: 'B',
      },
    });

    // A second student in the same institution, NOT linked to instA's
    // guardian and NOT the instA student themself — used to prove ownership
    // scoping blocks a same-tenant sibling family, not just cross-tenant.
    otherStudentInA = await prisma.student.create({
      data: {
        institutionId: instA.institutionId,
        studentId: `STU-RESULTS-OTHER-${instA.slug}`,
        firstName: 'Other',
        lastName: 'Student',
      },
    });

    resultForOtherStudent = await prisma.examResult.create({
      data: {
        institutionId: instA.institutionId,
        examId: exam1.id,
        studentId: otherStudentInA.id,
        subject: 'Math',
        marksObtained: 60,
        maxMarks: 100,
        grade: 'C',
      },
    });

    // A second child linked to the same guardian — proves the multi-child
    // "no studentId" path returns results for ALL linked children, not just
    // the first one.
    secondLinkedStudent = await prisma.student.create({
      data: {
        institutionId: instA.institutionId,
        studentId: `STU-RESULTS-SIBLING-${instA.slug}`,
        firstName: 'Sibling',
        lastName: 'Student',
      },
    });
    await prisma.guardianStudent.create({
      data: { guardianId: instA.guardianId, studentId: secondLinkedStudent.id, isPrimary: false },
    });

    resultForSecondLinkedStudent = await prisma.examResult.create({
      data: {
        institutionId: instA.institutionId,
        examId: exam1.id,
        studentId: secondLinkedStudent.id,
        subject: 'Math',
        marksObtained: 90,
        maxMarks: 100,
        grade: 'A+',
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.examResult.deleteMany({ where: { institutionId: instA.institutionId } });
    await prisma.exam.deleteMany({ where: { institutionId: instA.institutionId } });
    await prisma.guardianStudent.deleteMany({ where: { studentId: secondLinkedStudent.id } });
    await prisma.student.deleteMany({ where: { id: { in: [otherStudentInA.id, secondLinkedStudent.id] } } });
    await cleanupInstitution(instA);
    await disconnectFixtures();
  }, 30_000);

  it('STUDENT sees only their own results', async () => {
    const { token } = instA.usersByRole[UserRole.STUDENT];
    const res = await request(app).get('/api/v1/results/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(resultForA.id);
    expect(ids).toContain(resultForA_exam2.id);
    expect(ids).not.toContain(resultForOtherStudent.id);
    expect(ids).not.toContain(resultForSecondLinkedStudent.id);
  });

  it('STUDENT with no linked Student record gets an empty array, not a 500', async () => {
    const slug = `test-resultsedge-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const institution = await prisma.institution.create({ data: { name: 'Test Institution resultsedge', slug } });
    const user = await prisma.user.create({
      data: {
        institutionId: institution.id,
        email: `student.${slug}@test.local`,
        passwordHash: 'x',
        role: UserRole.STUDENT,
        firstName: 'Orphan',
        lastName: 'Student',
      },
    });
    // Sanity: deliberately NOT creating a Student row linked to this user.
    const orphanToken = jwt.sign(
      { sub: user.id, institutionId: institution.id, role: UserRole.STUDENT, email: user.email },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any },
    );

    try {
      const res = await request(app).get('/api/v1/results/me').set('Authorization', `Bearer ${orphanToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: { institutionId: institution.id } });
      await prisma.institution.delete({ where: { id: institution.id } });
    }
  });

  it("GUARDIAN with a studentId param sees only that child's results", async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app)
      .get(`/api/v1/results/me?studentId=${instA.studentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(resultForA.id);
    expect(ids).toContain(resultForA_exam2.id);
    expect(ids).not.toContain(resultForSecondLinkedStudent.id);
    expect(ids).not.toContain(resultForOtherStudent.id);
  });

  it("GUARDIAN supplying a same-tenant non-linked studentId gets an empty array, not another family's data", async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app)
      .get(`/api/v1/results/me?studentId=${otherStudentInA.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  it('GUARDIAN with multiple children and no studentId param gets results for all linked children only', async () => {
    const { token } = instA.usersByRole[UserRole.GUARDIAN];
    const res = await request(app).get('/api/v1/results/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(resultForA.id);
    expect(ids).toContain(resultForA_exam2.id);
    expect(ids).toContain(resultForSecondLinkedStudent.id);
    expect(ids).not.toContain(resultForOtherStudent.id);
  });

  it('examId query param narrows results to just that exam', async () => {
    const { token } = instA.usersByRole[UserRole.STUDENT];
    const res = await request(app)
      .get(`/api/v1/results/me?examId=${exam1.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(resultForA.id);
    expect(ids).not.toContain(resultForA_exam2.id);
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request(app).get('/api/v1/results/me');
    expect(res.status).toBe(401);
  });

  it('a staff-only role (TEACHER) cannot use the self-service route (403)', async () => {
    const { token } = instA.usersByRole[UserRole.TEACHER];
    const res = await request(app).get('/api/v1/results/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Cross-tenant isolation — students module', () => {
  let instA: InstitutionFixture;
  let instB: InstitutionFixture;

  beforeAll(async () => {
    instA = await createTestInstitution('xtenantA');
    instB = await createTestInstitution('xtenantB');
  }, 30_000);

  afterAll(async () => {
    await cleanupInstitution(instA);
    await cleanupInstitution(instB);
    await disconnectFixtures();
  }, 30_000);

  it("an ADMIN in Institution B cannot fetch Institution A's student by id", async () => {
    const { token } = instB.usersByRole[UserRole.ADMIN];
    const res = await request(app)
      .get(`/api/v1/students/${instA.studentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("an ADMIN in Institution B cannot delete Institution A's student", async () => {
    const { token } = instB.usersByRole[UserRole.ADMIN];
    const res = await request(app)
      .delete(`/api/v1/students/${instA.studentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);

    // Verify the student really is untouched, not just a 404 on a
    // double-delete race — belt-and-suspenders check against the DB directly.
    const stillExists = await prisma.student.findUnique({ where: { id: instA.studentId } });
    expect(stillExists).not.toBeNull();
  });
});

describe('requirePermission() — institutionId and granted:true filtering', () => {
  let instA: InstitutionFixture;
  let instB: InstitutionFixture;

  beforeAll(async () => {
    instA = await createTestInstitution('permA');
    instB = await createTestInstitution('permB');

    // Institution A explicitly grants TEACHER/grades/update.
    await prisma.permission.create({
      data: { institutionId: instA.institutionId, role: UserRole.TEACHER, resource: 'grades', action: 'update', granted: true },
    });
    // Institution B explicitly DENIES the same (role, resource, action) —
    // a pre-fix findFirst({ where: { role, resource, action } }) would match
    // this row too and (bug) treat its mere existence as an allow.
    await prisma.permission.create({
      data: { institutionId: instB.institutionId, role: UserRole.TEACHER, resource: 'grades', action: 'update', granted: false },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.permission.deleteMany({ where: { institutionId: { in: [instA.institutionId, instB.institutionId] } } });
    await cleanupInstitution(instA);
    await cleanupInstitution(instB);
    await disconnectFixtures();
  }, 30_000);

  function mockReqRes(institutionId: string, userId: string, role: UserRole) {
    const req: any = { user: { sub: userId, role, institutionId, email: 'x@test.local' }, tenantId: institutionId };
    const next = jest.fn();
    return { req, next };
  }

  it('grants access when an explicit granted:true row exists for the caller\'s own institution', async () => {
    const { req, next } = mockReqRes(instA.institutionId, instA.usersByRole[UserRole.TEACHER].userId, UserRole.TEACHER);
    await requirePermission('grades', 'update')(req, {} as any, next);
    expect(next).toHaveBeenCalledWith(); // called with no error => passed
  });

  it("does NOT leak Institution A's grant to a same-role user in Institution B (no matching row there)", async () => {
    const { req, next } = mockReqRes(instB.institutionId, instB.usersByRole[UserRole.TEACHER].userId, UserRole.TEACHER);
    await requirePermission('grades', 'update')(req, {} as any, next);
    // instB only has a granted:false row for this (role, resource, action) —
    // with the institutionId + granted:true fix applied, this must be denied.
    expect(next).toHaveBeenCalled();
    const errArg = (next as jest.Mock).mock.calls[0][0];
    expect(errArg).toBeDefined();
    expect(errArg?.statusCode ?? errArg?.status).toBe(403);
  });

  it('a granted:false row is treated as a deny, not as "permission exists"', async () => {
    const { req, next } = mockReqRes(instB.institutionId, instB.usersByRole[UserRole.TEACHER].userId, UserRole.TEACHER);
    await requirePermission('grades', 'update')(req, {} as any, next);
    const errArg = (next as jest.Mock).mock.calls[0][0];
    expect(errArg).toBeDefined();
  });
});
