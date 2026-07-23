import request from 'supertest';
import { UserRole } from '@prisma/client';
import app from '../src/app';
import {
  createTestInstitution,
  cleanupInstitution,
  disconnectFixtures,
  InstitutionFixture,
} from './helpers/fixtures';

/**
 * Authorization matrix tests for the seven route files that previously had
 * NO role checks at all (students, results, hr, notices, library, transport,
 * timetables), plus the attendance.routes.ts gaps closed alongside them.
 *
 * Each case asserts a route responds with an *allowed* status (200/201/204,
 * or a 4xx that indicates the request reached business logic — e.g. 404 for
 * a made-up id — for roles that should pass the gate) vs. exactly 403 for
 * roles that must be blocked before business logic ever runs. We only care
 * about the authorization boundary here, not full functional correctness.
 */

const ALL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.TEACHER,
  UserRole.ACCOUNTANT,
  UserRole.LIBRARIAN,
  UserRole.TRANSPORT_OFFICER,
  UserRole.GUARDIAN,
  UserRole.STUDENT,
  UserRole.MANAGEMENT,
];

interface RouteCase {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  body?: Record<string, unknown>;
  allowedRoles: UserRole[];
  label: string;
}

// SUPER_ADMIN has no institutionId, so it is deliberately excluded from
// these tenant-scoped route cases — it's covered separately where relevant
// (institution-management routes are out of scope for this suite).
const TENANT_ROLES = ALL_ROLES.filter((r) => r !== UserRole.SUPER_ADMIN);

function forbiddenRoles(allowed: UserRole[]): UserRole[] {
  return TENANT_ROLES.filter((r) => !allowed.includes(r));
}

describe('Authorization matrix — previously-unprotected routes', () => {
  let fixture: InstitutionFixture;

  beforeAll(async () => {
    fixture = await createTestInstitution('authz');
  }, 30_000);

  afterAll(async () => {
    await cleanupInstitution(fixture);
    await disconnectFixtures();
  }, 30_000);

  const STAFF_RW: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER];
  const STAFF_RO_PLUS: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT, UserRole.LIBRARIAN];
  const ADMIN_ONLY: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
  const ADMIN_ACCOUNTANT: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT];
  const LIBRARY_STAFF: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LIBRARIAN];
  const TRANSPORT_STAFF: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.TRANSPORT_OFFICER];

  const cases: RouteCase[] = [
    // --- students ---
    { method: 'get', path: '/api/v1/students', allowedRoles: STAFF_RO_PLUS, label: 'GET /students (list)' },
    {
      method: 'get',
      path: '/api/v1/students/does-not-exist',
      allowedRoles: STAFF_RO_PLUS,
      label: 'GET /students/:id (arbitrary id)',
    },
    {
      method: 'delete',
      path: '/api/v1/students/does-not-exist',
      allowedRoles: STAFF_RW,
      label: 'DELETE /students/:id',
    },

    // --- results ---
    {
      method: 'get',
      path: '/api/v1/results',
      allowedRoles: STAFF_RW.concat(UserRole.STUDENT, UserRole.GUARDIAN),
      label: 'GET /results (list exams — readable by everyone, no marks data)',
    },
    {
      method: 'delete',
      path: '/api/v1/results/results-list/does-not-exist',
      allowedRoles: STAFF_RW,
      label: 'DELETE /results/results-list/:id',
    },
    {
      method: 'get',
      path: '/api/v1/results/me',
      allowedRoles: [UserRole.STUDENT, UserRole.GUARDIAN],
      label: 'GET /results/me (self-service)',
    },

    // --- hr (staff + payroll) ---
    { method: 'get', path: '/api/v1/hr/staff', allowedRoles: ADMIN_ACCOUNTANT, label: 'GET /hr/staff' },
    { method: 'get', path: '/api/v1/hr/payroll', allowedRoles: ADMIN_ACCOUNTANT, label: 'GET /hr/payroll' },
    {
      method: 'post',
      path: '/api/v1/hr/payroll/does-not-exist/pay',
      allowedRoles: ADMIN_ONLY,
      label: 'POST /hr/payroll/:id/pay',
    },

    // --- notices (reads open to everyone, writes locked down) ---
    { method: 'get', path: '/api/v1/notices', allowedRoles: TENANT_ROLES, label: 'GET /notices (everyone reads)' },
    {
      method: 'delete',
      path: '/api/v1/notices/does-not-exist',
      allowedRoles: STAFF_RW,
      label: 'DELETE /notices/:id',
    },

    // --- library ---
    { method: 'get', path: '/api/v1/library/books', allowedRoles: LIBRARY_STAFF, label: 'GET /library/books' },
    {
      method: 'post',
      path: '/api/v1/library/books',
      body: { title: 'x', author: 'x' },
      allowedRoles: LIBRARY_STAFF,
      label: 'POST /library/books',
    },
    {
      method: 'get',
      path: '/api/v1/library/me/issues',
      allowedRoles: [UserRole.STUDENT, UserRole.GUARDIAN],
      label: 'GET /library/me/issues (self-service)',
    },

    // --- transport ---
    { method: 'get', path: '/api/v1/transport/vehicles', allowedRoles: TRANSPORT_STAFF, label: 'GET /transport/vehicles' },
    {
      method: 'post',
      path: '/api/v1/transport/vehicles',
      body: { registrationNumber: 'x', capacity: 1, driverName: 'x' },
      allowedRoles: TRANSPORT_STAFF,
      label: 'POST /transport/vehicles',
    },
    {
      method: 'get',
      path: '/api/v1/transport/me/assignment',
      allowedRoles: [UserRole.STUDENT, UserRole.GUARDIAN],
      label: 'GET /transport/me/assignment (self-service)',
    },

    // --- timetables (reads open, writes locked down) ---
    { method: 'get', path: '/api/v1/timetables', allowedRoles: TENANT_ROLES, label: 'GET /timetables (everyone reads)' },
    {
      method: 'delete',
      path: '/api/v1/timetables/does-not-exist',
      allowedRoles: ADMIN_ONLY,
      label: 'DELETE /timetables/:id',
    },

    // --- institution profile (GET open for branding/contact reads e.g.
    // GuardianDashboard's "school contact" card; PUT is Admin-only — was
    // previously wide open to every tenant role, a live privilege-escalation
    // bug proven by a tester on the STUDENT role) ---
    {
      method: 'get',
      path: '/api/v1/institution/website',
      allowedRoles: TENANT_ROLES,
      label: 'GET /institution/website (everyone reads school profile/contact info)',
    },
    {
      method: 'put',
      path: '/api/v1/institution/website',
      body: { name: 'Authz Matrix Attempted Rename' },
      allowedRoles: ADMIN_ONLY,
      label: 'PUT /institution/website (Admin-only — closes STUDENT/GUARDIAN privilege escalation)',
    },

    // --- attendance (register-lifecycle model — replaces the old className/sectionName sheet route) ---
    {
      method: 'get',
      path: '/api/v1/attendance/registers/today',
      allowedRoles: [UserRole.TEACHER],
      label: "GET /attendance/registers/today (teacher's own required registers)",
    },
    {
      method: 'get',
      path: '/api/v1/attendance/admin/registers',
      allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGEMENT],
      label: 'GET /attendance/admin/registers (register monitor)',
    },
  ];

  for (const { method, path, body, allowedRoles, label } of cases) {
    describe(label, () => {
      for (const role of allowedRoles) {
        it(`allows ${role} past the authorization gate`, async () => {
          const { token } = fixture.usersByRole[role];
          const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
          const res = body ? await req.send(body) : await req;
          expect(res.status).not.toBe(403);
        });
      }

      for (const role of forbiddenRoles(allowedRoles)) {
        it(`blocks ${role} with 403`, async () => {
          const { token } = fixture.usersByRole[role];
          const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
          const res = body ? await req.send(body) : await req;
          expect(res.status).toBe(403);
        });
      }
    });
  }

  it('rejects requests with no token at all (401, not a silent pass)', async () => {
    const res = await request(app).get('/api/v1/students');
    expect(res.status).toBe(401);
  });
});
