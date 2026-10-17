import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../src/app';
import { creditFamilyPayment } from '../src/modules/families/families.payments';
import { createTestInstitution, cleanupInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';

// =============================================================================
// T3 family profile — API + DB behaviour on a real Postgres copy. Run with:
//   DATABASE_URL=…/sms_track_t2 BREVO_API_KEY= EMAIL_ENABLED=false SMS_ENABLED=false \
//   SSLCOMMERZ_ENABLED=false BKASH_ENABLED=false NAGAD_ENABLED=false npx jest tests/family.test.ts
// =============================================================================

// Force demo checkout regardless of .env (gateway config is read at call time).
for (const k of ['SSLCOMMERZ_STORE_ID', 'SSLCOMMERZ_STORE_PASSWORD', 'BKASH_APP_KEY', 'BKASH_APP_SECRET', 'NAGAD_MERCHANT_ID']) delete process.env[k];
process.env.FEE_DEMO_PAYMENTS_ENABLED = 'true';

type Role = keyof InstitutionFixture['usersByRole'];

/** The backfill statements of the T3 migration, run verbatim. */
function backfillStatements(): string[] {
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261016120000_t3_family/migration.sql'), 'utf8');
  const tail = sql.slice(sql.indexOf('-- Backfill'));
  return tail
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);
}

describe('T3 family profile', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;
  let g1: string; // fixture guardian (has GUARDIAN login), primary of s1 + s2
  let g2: string; // mother, no login, secondary on s1
  let g3: string; // other household
  let s1: string;
  let s2: string;
  let s3: string;
  let s4: string; // linked after the backfill → lazy sync
  let famA: string;
  let famOther: string;
  let teacherRowId: string;
  let sectionId: string;
  let concessionId: string;
  const invoices: Record<string, string> = {};

  const auth = (f: InstitutionFixture, role: Role = 'ADMIN') => ({ Authorization: `Bearer ${f.usersByRole[role].token}` });
  const api = {
    get: (f: InstitutionFixture, p: string, role: Role = 'ADMIN') => request(app).get(`/api/v1/families${p}`).set(auth(f, role)),
    post: (f: InstitutionFixture, p: string, body: object, role: Role = 'ADMIN') => request(app).post(`/api/v1/families${p}`).set(auth(f, role)).send(body),
    put: (f: InstitutionFixture, p: string, body: object, role: Role = 'ADMIN') => request(app).put(`/api/v1/families${p}`).set(auth(f, role)).send(body),
    del: (f: InstitutionFixture, p: string, role: Role = 'ADMIN') => request(app).delete(`/api/v1/families${p}`).set(auth(f, role)),
  };
  const mkInvoice = async (studentId: string, key: string, due: number, dueDate: string) => {
    const i = await prisma.invoice.create({
      data: { institutionId: a.institutionId, studentId, invoiceNo: `INV-${key}-${a.slug}`.slice(0, 60), totalAmount: due, dueAmount: due, dueDate: new Date(dueDate) },
    });
    invoices[key] = i.id;
    return i.id;
  };

  beforeAll(async () => {
    a = await createTestInstitution('fam-a');
    b = await createTestInstitution('fam-b');
    g1 = a.guardianId;
    s1 = a.studentId;
    await prisma.student.update({ where: { id: s1 }, data: { firstName: 'Ayesha', lastName: 'Karim' } });
    await prisma.guardian.update({ where: { id: g1 }, data: { firstName: 'Abdul', lastName: 'Karim', phone: '01711000001' } });
    s2 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S2-${a.slug}`, firstName: 'Bilal', lastName: 'Karim' } })).id;
    s3 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S3-${a.slug}`, firstName: 'Other', lastName: 'Child' } })).id;
    g2 = (await prisma.guardian.create({ data: { institutionId: a.institutionId, relationship: 'MOTHER', firstName: 'Fatima', lastName: 'Karim', phone: '01711000002' } })).id;
    g3 = (await prisma.guardian.create({ data: { institutionId: a.institutionId, relationship: 'FATHER', firstName: 'Other', lastName: 'Parent', phone: '01711000003' } })).id;
    await prisma.guardianStudent.createMany({
      data: [
        { guardianId: g1, studentId: s2, isPrimary: true },
        { guardianId: g2, studentId: s1, isPrimary: false },
        { guardianId: g3, studentId: s3, isPrimary: true },
      ],
    });
    // Teacher of s1's section (read-only teacher view).
    const branch = await prisma.branch.create({ data: { institutionId: a.institutionId, name: 'Main' } });
    const cls = await prisma.class.create({ data: { branchId: branch.id, name: 'Class 3', level: 3 } });
    teacherRowId = (await prisma.teacher.create({ data: { userId: a.usersByRole.TEACHER.userId } })).id;
    sectionId = (await prisma.section.create({ data: { classId: cls.id, name: 'A', classTeacherId: teacherRowId } })).id;
    await prisma.student.update({ where: { id: s1 }, data: { classId: cls.id, sectionId } });
  }, 60_000);

  afterAll(async () => {
    const where = { institutionId: a.institutionId };
    await prisma.studentConcession.deleteMany({ where }).catch(() => undefined);
    await prisma.concession.deleteMany({ where }).catch(() => undefined);
    await prisma.guardianStudent.deleteMany({ where: { studentId: { in: [s2, s3, s4].filter(Boolean) } } }).catch(() => undefined);
    await prisma.guardianStudent.deleteMany({ where: { guardianId: { in: [g2, g3] } } }).catch(() => undefined);
    for (const f of [a, b]) await prisma.familyPayment.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
    for (const f of [a, b]) await prisma.family.deleteMany({ where: { institutionId: f.institutionId } }).catch(() => undefined);
    await prisma.section.updateMany({ where: { id: sectionId }, data: { classTeacherId: null } }).catch(() => undefined);
    await prisma.teacher.deleteMany({ where: { id: teacherRowId } }).catch(() => undefined);
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  });

  it('migration backfill: one family per primary guardian, other guardians attached, tenants never mixed', async () => {
    for (const stmt of backfillStatements()) await prisma.$executeRawUnsafe(stmt);
    const m1 = await prisma.familyStudent.findUnique({ where: { studentId: s1 } });
    const m2 = await prisma.familyStudent.findUnique({ where: { studentId: s2 } });
    const m3 = await prisma.familyStudent.findUnique({ where: { studentId: s3 } });
    expect(m1?.familyId).toBeDefined();
    expect(m2?.familyId).toBe(m1?.familyId);
    expect(m3?.familyId).not.toBe(m1?.familyId);
    famA = m1!.familyId;
    famOther = m3!.familyId;
    const fam = await prisma.family.findUnique({ where: { id: famA }, include: { guardians: true } });
    expect(fam?.institutionId).toBe(a.institutionId);
    expect(fam?.name).toBe('Abdul Karim family');
    expect(fam?.primaryGuardianId).toBe(g1);
    expect(fam?.guardians.map((g) => g.guardianId).sort()).toEqual([g1, g2].sort());
    // B's fixture got its own family, in B.
    const famB = await prisma.familyStudent.findUnique({ where: { studentId: b.studentId }, include: { family: true } });
    expect(famB?.family.institutionId).toBe(b.institutionId);
    // Re-running the backfill is a no-op.
    for (const stmt of backfillStatements()) await prisma.$executeRawUnsafe(stmt);
    expect(await prisma.family.count({ where: { institutionId: a.institutionId } })).toBe(2);
  });

  it('groups children linked later (lazy sync) into the same family', async () => {
    s4 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S4-${a.slug}`, firstName: 'Zaid', lastName: 'Karim' } })).id;
    await prisma.guardianStudent.create({ data: { guardianId: g1, studentId: s4, isPrimary: true } });
    const res = await api.get(a, `/by-student/${s4}`);
    expect(res.status).toBe(200);
    expect(res.body.data.familyId).toBe(famA);
    expect((await api.get(a, `/by-guardian/${g2}`)).body.data.familyId).toBe(famA);
  });

  it('staff profile: guardians, children, fees per child + family total', async () => {
    await mkInvoice(s1, 'a1', 100, '2026-01-10');
    await mkInvoice(s2, 'b1', 250, '2026-02-10');
    await mkInvoice(s4, 'd1', 50.5, '2026-03-10');
    const res = await api.get(a, `/${famA}`, 'ACCOUNTANT');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.view).toBe('staff');
    expect(d.children.map((c: { id: string }) => c.id).sort()).toEqual([s1, s2, s4].sort());
    expect(d.guardians.find((g: { id: string }) => g.id === g1).isPrimary).toBe(true);
    expect(d.fees.due).toBe(400.5);
    expect(d.children.find((c: { id: string }) => c.id === s2).fees.unpaid[0].dueAmount).toBe(250);
    expect(d.permissions.canPayOffline).toBe(true);
  });

  it('notes are staff-only; guardians only see their own family; teachers are read-only and scoped', async () => {
    expect((await api.post(a, `/${famA}/notes`, { body: 'Prefers calls after 5pm' }, 'ACCOUNTANT')).status).toBe(201);
    expect((await api.post(a, `/${famA}/notes`, { body: 'x' }, 'GUARDIAN')).status).toBe(403);
    expect((await api.post(a, `/${famA}/notes`, { body: 'x' }, 'TEACHER')).status).toBe(403);

    const mine = await api.get(a, '/mine', 'GUARDIAN');
    expect(mine.status).toBe(200);
    expect(mine.body.data.family.id).toBe(famA);
    expect(mine.body.data.view).toBe('guardian');
    expect(mine.body.data.notes).toEqual([]);
    expect(mine.body.data.fees.due).toBe(400.5);
    expect((await api.get(a, `/${famOther}`, 'GUARDIAN')).status).toBe(404);
    expect((await api.get(a, '/', 'GUARDIAN')).status).toBe(403);
    expect((await api.get(a, '/search?q=Karim', 'GUARDIAN')).status).toBe(403);

    const tv = await api.get(a, `/${famA}`, 'TEACHER');
    expect(tv.status).toBe(200);
    expect(tv.body.data.view).toBe('teacher');
    expect(tv.body.data.fees).toBeNull();
    expect(tv.body.data.notes).toEqual([]);
    expect(tv.body.data.recentPayments).toEqual([]);
    expect((await api.get(a, `/${famOther}`, 'TEACHER')).status).toBe(404); // no child in their section
    expect((await api.get(a, `/${famA}`, 'STUDENT')).status).toBe(403);
  });

  it('is tenant-isolated', async () => {
    expect((await api.get(b, `/${famA}`)).status).toBe(404);
    expect((await api.get(b, `/by-student/${s1}`)).status).toBe(404);
    const list = await api.get(b, '/');
    expect(list.body.data.every((f: { institutionId: string }) => f.institutionId === b.institutionId)).toBe(true);
    expect((await api.post(b, `/${famA}/notes`, { body: 'x' })).status).toBe(404);
    expect((await api.post(b, '/', { name: 'Steal', studentIds: [s1] })).status).toBe(404);
  });

  it('search finds a family by a child name; list paginates', async () => {
    const r = await api.get(a, '/search?q=Bilal');
    expect(r.status).toBe(200);
    expect(r.body.data.map((f: { id: string }) => f.id)).toContain(famA);
    const list = await api.get(a, '/?q=Karim');
    expect(list.body.data.map((f: { id: string }) => f.id)).toEqual([famA]);
  });

  let payId: string;

  it('pay all online (demo): one transaction credits every invoice, idempotently', async () => {
    expect((await api.post(a, `/${famA}/pay-online`, { method: 'BKASH' }, 'ACCOUNTANT')).status).toBe(403);
    expect((await api.post(a, `/${famOther}/pay-online`, { method: 'BKASH' }, 'GUARDIAN')).status).toBe(404);
    const start = await api.post(a, `/${famA}/pay-online`, { method: 'BKASH' }, 'GUARDIAN');
    expect(start.status).toBe(201);
    expect(start.body.data.demo).toBe(true);
    expect(start.body.data.amount).toBe(400.5);
    expect(start.body.data.invoiceCount).toBe(3);
    payId = start.body.data.paymentId;

    // Two confirmations racing: exactly one set of Payments.
    const [c1, c2] = await Promise.all([
      api.post(a, `/payments/${payId}/demo-confirm`, { outcome: 'success' }, 'GUARDIAN'),
      api.post(a, `/payments/${payId}/demo-confirm`, { outcome: 'success' }, 'GUARDIAN'),
    ]);
    expect([c1.status, c2.status]).toEqual([200, 200]);
    const payments = await prisma.payment.findMany({ where: { invoiceId: { in: [invoices.a1, invoices.b1, invoices.d1] } } });
    expect(payments).toHaveLength(3);
    expect(new Set(payments.map((p) => p.receiptNo)).size).toBe(3);
    const after = await prisma.invoice.findMany({ where: { id: { in: [invoices.a1, invoices.b1, invoices.d1] } } });
    expect(after.every((i) => i.status === 'PAID' && Number(i.dueAmount) === 0)).toBe(true);

    // A third confirm and a direct re-credit change nothing.
    expect((await api.post(a, `/payments/${payId}/demo-confirm`, { outcome: 'success' }, 'GUARDIAN')).body.data.alreadyProcessed).toBe(true);
    expect((await creditFamilyPayment(payId, { gatewayRef: 'whatever', raw: {} })).credited).toBe(false);
    expect(await prisma.payment.count({ where: { invoiceId: { in: [invoices.a1, invoices.b1, invoices.d1] } } })).toBe(3);

    const status = await api.get(a, `/payments/${payId}`, 'GUARDIAN');
    expect(status.body.data.status).toBe('SUCCESS');
    expect(status.body.data.allocations.every((x: { receiptNo: string | null }) => Boolean(x.receiptNo))).toBe(true);
    expect((await api.get(b, `/payments/${payId}`)).status).toBe(404);

    // Nothing left to pay.
    expect((await api.post(a, `/${famA}/pay-online`, { method: 'BKASH' }, 'GUARDIAN')).status).toBe(400);
  });

  it('rejects a replayed gateway reference on another family payment', async () => {
    await mkInvoice(s2, 'b2', 80, '2026-04-10');
    const start = await api.post(a, `/${famA}/pay-online`, { method: 'NAGAD' }, 'GUARDIAN');
    const fresh = start.body.data.paymentId;
    const usedRef = (await prisma.familyPayment.findUnique({ where: { id: payId } }))!.gatewayValId!;
    expect((await creditFamilyPayment(fresh, { gatewayRef: usedRef, raw: {} })).credited).toBe(false);
    expect((await prisma.familyPayment.findUnique({ where: { id: fresh } }))!.status).not.toBe('SUCCESS');
    // A failure outcome closes it; it cannot be confirmed afterwards.
    expect((await api.post(a, `/payments/${fresh}/demo-confirm`, { outcome: 'failure' }, 'GUARDIAN')).body.data.status).toBe('FAILED');
    expect((await api.post(a, `/payments/${fresh}/demo-confirm`, { outcome: 'success' }, 'GUARDIAN')).status).toBe(400);
  });

  it('staff record one offline payment split across children (oldest first or explicit)', async () => {
    await mkInvoice(s1, 'a2', 60, '2026-04-01'); // older than b2 (04-10)
    expect((await api.post(a, `/${famA}/payments/offline`, { amount: 100, method: 'CASH' }, 'TEACHER')).status).toBe(403);
    expect((await api.post(a, `/${famA}/payments/offline`, { amount: 500, method: 'CASH' }, 'ACCOUNTANT')).status).toBe(422);
    expect((await api.post(a, `/${famA}/payments/offline`, { amount: 100, method: 'CASH', allocations: [{ invoiceId: invoices.a2, amount: 60 }] }, 'ACCOUNTANT')).status).toBe(422);
    expect((await api.post(a, `/${famA}/payments/offline`, { amount: 10, method: 'CASH', allocations: [{ invoiceId: invoices.a1, amount: 10 }] }, 'ACCOUNTANT')).status).toBe(422); // already paid

    const res = await api.post(a, `/${famA}/payments/offline`, { amount: 100, method: 'CASH', transactionRef: 'CASH-1' }, 'ACCOUNTANT');
    expect(res.status).toBe(201);
    expect(res.body.data.payments.map((p: { invoiceId: string; amount: number }) => [p.invoiceId, p.amount])).toEqual([
      [invoices.a2, 60],
      [invoices.b2, 40],
    ]);
    const [ia2, ib2] = await Promise.all([prisma.invoice.findUnique({ where: { id: invoices.a2 } }), prisma.invoice.findUnique({ where: { id: invoices.b2 } })]);
    expect(ia2?.status).toBe('PAID');
    expect(ib2?.status).toBe('PARTIAL');
    expect(Number(ib2?.dueAmount)).toBe(40);
    const prof = (await api.get(a, `/${famA}`)).body.data;
    expect(prof.fees.due).toBe(40);
    expect(prof.familyPayments.some((p: { source: string }) => p.source === 'OFFLINE')).toBe(true);
  });

  it('sibling concession quick action uses the existing concessions (ADMIN only)', async () => {
    concessionId = (await prisma.concession.create({ data: { institutionId: a.institutionId, name: 'Sibling 10%', type: 'PERCENT', value: 10 } })).id;
    expect((await api.post(a, `/${famA}/sibling-concession`, { concessionId, studentIds: [s2, s4] }, 'ACCOUNTANT')).status).toBe(403);
    expect((await api.post(a, `/${famA}/sibling-concession`, { concessionId, studentIds: [s3] })).status).toBe(422);
    const r = await api.post(a, `/${famA}/sibling-concession`, { concessionId, studentIds: [s2, s4] });
    expect(r.status).toBe(200);
    expect(await prisma.studentConcession.count({ where: { concessionId } })).toBe(2);
  });

  it('explicit grouping: ungroup sticks (sync never pulls back), merge brings members, notes and payments', async () => {
    const un = await api.del(a, `/${famA}/students/${s4}`);
    expect(un.status).toBe(200);
    const solo = un.body.data.familyId;
    expect(solo).not.toBe(famA);
    await api.get(a, `/by-student/${s4}`); // triggers sync
    expect((await prisma.familyStudent.findUnique({ where: { studentId: s4 } }))?.familyId).toBe(solo);

    expect((await api.post(a, `/${famA}/merge`, { otherFamilyId: solo }, 'MANAGEMENT')).status).toBe(200);
    expect((await prisma.familyStudent.findUnique({ where: { studentId: s4 } }))?.familyId).toBe(famA);
    expect(await prisma.family.findUnique({ where: { id: solo } })).toBeNull();

    // Remove the mother, then set her back via members.
    expect((await api.del(a, `/${famA}/guardians/${g2}`)).status).toBe(200);
    expect((await api.post(a, `/${famA}/members`, { guardianIds: [g2] })).status).toBe(200);
    expect((await api.put(a, `/${famA}`, { primaryGuardianId: g3 })).status).toBe(422); // not a member
    expect((await api.put(a, `/${famA}`, { name: 'Karim household' })).body.data.name).toBe('Karim household');
    expect((await api.post(a, `/${famA}/merge`, { otherFamilyId: famA })).status).toBe(400);
  });

  it('shows character per child only while that module is on', async () => {
    expect((await api.get(a, `/${famA}`)).body.data.children[0].character).toBeNull();
    await request(app).put('/api/v1/institution/modules').set(auth(a)).send({ modules: { 'islamic.character': true } });
    const on = (await api.get(a, `/${famA}`)).body.data.children;
    expect(on.every((c: { character: { points: number } | null }) => c.character && c.character.points === 0)).toBe(true);
    await request(app).put('/api/v1/institution/modules').set(auth(a)).send({ modules: { 'islamic.character': false } });
  });
});
