import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../src/app';
import { buildDigest, sendDigestForInstitution } from '../src/modules/crm/crm.digest';
import { DEFAULT_STAGES } from '../src/modules/crm/crm.logic';
import { defaultStageId } from '../src/modules/crm/crm.stages';
import { createTestInstitution, cleanupInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';

// =============================================================================
// T4 Admissions CRM — API + DB behaviour on a real Postgres copy. Run with:
//   DATABASE_URL=…/sms_track_t4 BREVO_API_KEY= EMAIL_ENABLED=false SMS_ENABLED=false \
//   SSLCOMMERZ_ENABLED=false BKASH_ENABLED=false NAGAD_ENABLED=false npx jest tests/crm.test.ts
// =============================================================================

type Role = keyof InstitutionFixture['usersByRole'];

/** The backfill statements of the T4 migration, run verbatim. */
function backfillStatements(): string[] {
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261017090000_t4_crm/migration.sql'), 'utf8');
  const tail = sql.slice(sql.indexOf('-- Backfill'));
  return tail
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);
}

async function cleanupCrm(f: InstitutionFixture) {
  await prisma.crmActivity.deleteMany({ where: { institutionId: f.institutionId } });
  await prisma.crmTask.deleteMany({ where: { institutionId: f.institutionId } });
  await prisma.crmContact.deleteMany({ where: { institutionId: f.institutionId } });
  await prisma.admissionEnquiry.deleteMany({ where: { institutionId: f.institutionId } });
  await prisma.crmStage.deleteMany({ where: { institutionId: f.institutionId } });
  await prisma.donor.deleteMany({ where: { institutionId: f.institutionId } });
}

describe('T4 admissions CRM', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;
  const auth = (f: InstitutionFixture, role: Role = 'ADMIN') => ({ Authorization: `Bearer ${f.usersByRole[role].token}` });
  const api = {
    get: (f: InstitutionFixture, p: string, role: Role = 'ADMIN') => request(app).get(`/api/v1${p}`).set(auth(f, role)),
    post: (f: InstitutionFixture, p: string, body: object, role: Role = 'ADMIN') => request(app).post(`/api/v1${p}`).set(auth(f, role)).send(body),
    put: (f: InstitutionFixture, p: string, body: object, role: Role = 'ADMIN') => request(app).put(`/api/v1${p}`).set(auth(f, role)).send(body),
    patch: (f: InstitutionFixture, p: string, body: object, role: Role = 'ADMIN') => request(app).patch(`/api/v1${p}`).set(auth(f, role)).send(body),
    del: (f: InstitutionFixture, p: string, role: Role = 'ADMIN') => request(app).delete(`/api/v1${p}`).set(auth(f, role)),
  };
  const stageByName = async (f: InstitutionFixture, name: string) => {
    const s = await prisma.crmStage.findFirst({ where: { institutionId: f.institutionId, name } });
    if (!s) throw new Error(`no stage ${name}`);
    return s;
  };
  const newEnquiry = async (f: InstitutionFixture, body: Record<string, unknown> = {}) => {
    const res = await api.post(f, '/enquiries', { studentName: 'Ayesha Karim', phone: '01711000001', ...body });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; stageId: string; status: string };
  };

  beforeAll(async () => {
    a = await createTestInstitution('crm-a');
    b = await createTestInstitution('crm-b');
  });

  afterAll(async () => {
    for (const f of [a, b]) {
      if (!f) continue;
      await cleanupCrm(f);
      await cleanupInstitution(f);
    }
    await disconnectFixtures();
  });

  it('migration backfill: seeds default stages and maps every legacy status, safely re-runnable', async () => {
    const statuses = ['NEW', 'CONTACTED', 'VISITED', 'APPLIED', 'ENROLLED', 'LOST'] as const;
    // Enquiries as they existed before T4: no stage.
    await prisma.admissionEnquiry.createMany({
      data: statuses.map((status) => ({ institutionId: a.institutionId, studentName: `Legacy ${status}`, phone: '01800000000', status })),
    });
    for (const stmt of backfillStatements()) await prisma.$executeRawUnsafe(stmt);

    const stages = await prisma.crmStage.findMany({ where: { institutionId: a.institutionId }, orderBy: { order: 'asc' } });
    expect(stages.map((s) => [s.id, s.name, s.nameBn, s.color, s.order, s.isWon, s.isLost, s.status])).toEqual(
      DEFAULT_STAGES.map((d) => [defaultStageId(a.institutionId, d.status), d.name, d.nameBn, d.color, d.order, d.isWon, d.isLost, d.status]),
    );
    const legacy = await prisma.admissionEnquiry.findMany({ where: { institutionId: a.institutionId, studentName: { startsWith: 'Legacy' } }, include: { stage: true } });
    for (const e of legacy) {
      expect(e.stage?.status).toBe(e.status);
      expect(e.status === 'ENROLLED' ? e.wonAt : null).toEqual(e.status === 'ENROLLED' ? e.updatedAt : null);
    }
    // Re-run: no new stages, nothing moves.
    for (const stmt of backfillStatements()) await prisma.$executeRawUnsafe(stmt);
    expect(await prisma.crmStage.count({ where: { institutionId: a.institutionId } })).toBe(6);
    await prisma.admissionEnquiry.deleteMany({ where: { institutionId: a.institutionId, studentName: { startsWith: 'Legacy' } } });
  });

  it('lazily seeds stages for a school created after the migration', async () => {
    // The verbatim backfill above seeded every school; start B from nothing.
    await prisma.crmStage.deleteMany({ where: { institutionId: b.institutionId } });
    expect(await prisma.crmStage.count({ where: { institutionId: b.institutionId } })).toBe(0);
    const res = await api.get(b, '/crm/stages');
    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual(DEFAULT_STAGES.map((s) => s.name));
    expect(res.body.data[0].id).toBe(defaultStageId(b.institutionId, 'NEW'));
  });

  it('board moves keep status in sync and log the timeline; legacy status API still works', async () => {
    const e = await newEnquiry(a, { assignedToUserId: a.usersByRole.TEACHER.userId, nextStep: 'Call father', priority: 'HIGH' });
    const newStage = await stageByName(a, 'New');
    expect(e.stageId).toBe(newStage.id);

    const admitted = await stageByName(a, 'Admitted');
    let res = await api.patch(a, `/crm/enquiries/${e.id}/stage`, { stageId: admitted.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ENROLLED', stageId: admitted.id });
    expect(res.body.data.wonAt).toBeTruthy();

    const lost = await stageByName(a, 'Lost');
    res = await api.patch(a, `/crm/enquiries/${e.id}/stage`, { stageId: lost.id, lostReason: 'Chose another school' });
    expect(res.body.data).toMatchObject({ status: 'LOST', lostReason: 'Chose another school' });

    // Legacy PATCH /enquiries/:id/status → the matching stage, lost reason cleared.
    res = await api.patch(a, `/enquiries/${e.id}/status`, { status: 'VISITED', note: 'Came for a visit' });
    expect(res.status).toBe(200);
    expect(res.body.data.stage.name).toBe('Visit scheduled');
    expect(res.body.data.lostReason).toBeNull();

    // Legacy board by status still answers.
    expect((await api.get(a, '/enquiries/board')).status).toBe(200);

    const board = await api.get(a, '/crm/board?priority=HIGH');
    expect(board.status).toBe(200);
    const col = board.body.data.columns.find((c: { stage: { name: string } }) => c.stage.name === 'Visit scheduled');
    expect(col.total).toBe(1);
    expect(col.items[0].id).toBe(e.id);

    const tl = await api.get(a, `/crm/enquiries/${e.id}/timeline`);
    const types = tl.body.data.activities.map((x: { type: string }) => x.type);
    expect(types.filter((t: string) => t === 'STAGE_CHANGE')).toHaveLength(3);
    expect(types).toContain('CREATED');
    expect(tl.body.data.activities[0].actorName).toBe('Test ADMIN');

    // Manual call log.
    res = await api.post(a, `/crm/enquiries/${e.id}/activities`, { type: 'CALL', body: 'Father will visit Sunday' });
    expect(res.status).toBe(201);
  });

  it('quick filters: mine / overdue / due today / class / stage', async () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const o = await newEnquiry(a, { studentName: 'Overdue Kid', phone: '01722000001', classInterested: 'Class Nine', assignedToUserId: a.usersByRole.ADMIN.userId, followUpAt: yesterday });
    const mine = await api.get(a, '/enquiries?mine=true&due=overdue');
    expect(mine.body.data.map((x: { id: string }) => x.id)).toEqual([o.id]);
    const cls = await api.get(a, '/enquiries?classInterested=class%20nine');
    expect(cls.body.data.map((x: { id: string }) => x.id)).toEqual([o.id]);
    const today = await api.get(a, '/enquiries?due=today');
    expect(today.body.data.map((x: { id: string }) => x.id)).not.toContain(o.id);
    const stage = await api.get(a, `/enquiries?stageId=${o.stageId}&search=Overdue`);
    expect(stage.body.meta.total).toBe(1);
    const opts = await api.get(a, '/crm/filter-options');
    expect(opts.body.data.classes).toContain('Class Nine');
  });

  it('stage editor: rename, add a custom stage, delete only with a reassignment', async () => {
    const current = (await api.get(a, '/crm/stages')).body.data as Array<{ id: string; name: string; color: string; isWon: boolean; isLost: boolean; enquiryCount: number }>;
    const visit = current.find((s) => s.name === 'Visit scheduled')!;
    expect(visit.enquiryCount).toBeGreaterThan(0);
    const next = current
      .filter((s) => s.id !== visit.id)
      .map((s) => ({ id: s.id, name: s.name === 'Contacted' ? 'Called' : s.name, color: s.color, isWon: s.isWon, isLost: s.isLost }));
    next.splice(2, 0, { name: 'Interview', color: '#0d9488', isWon: false, isLost: false } as never);

    let res = await api.put(a, '/crm/stages', { stages: next });
    expect(res.status).toBe(409);
    const called = current.find((s) => s.name === 'Contacted')!;
    res = await api.put(a, '/crm/stages', { stages: next, reassign: { [visit.id]: called.id } });
    expect(res.status).toBe(200);
    const names = res.body.data.map((s: { name: string }) => s.name);
    expect(names).toEqual(['New', 'Called', 'Interview', 'Applied', 'Admitted', 'Lost']);
    const interview = res.body.data.find((s: { name: string }) => s.name === 'Interview');
    expect(interview.status).toBe('CONTACTED'); // inherits the previous open stage's status
    // The moved enquiry now sits in "Called" with status CONTACTED.
    const moved = await prisma.admissionEnquiry.findMany({ where: { institutionId: a.institutionId, stageId: called.id } });
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((m) => m.status === 'CONTACTED')).toBe(true);
    // Must keep a won and a lost stage.
    res = await api.put(a, '/crm/stages', { stages: next.filter((s) => !s.isWon) });
    expect(res.status).toBe(422);
  });

  it('tasks: defaults to the enquiry owner; assignees see and close only their own; summary counts', async () => {
    const e = await newEnquiry(a, { studentName: 'Task Kid', phone: '01733000001', assignedToUserId: a.usersByRole.TEACHER.userId });
    const due = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    let res = await api.post(a, '/crm/tasks', { title: 'Send prospectus', enquiryId: e.id, dueAt: due });
    expect(res.status).toBe(201);
    const task = res.body.data;
    expect(task.assigneeUserId).toBe(a.usersByRole.TEACHER.userId);
    const other = (await api.post(a, '/crm/tasks', { title: 'Admin only task', assigneeUserId: a.usersByRole.ADMIN.userId })).body.data;

    // Teacher: only their task; cannot create, reassign or delete.
    res = await api.get(a, '/crm/tasks?scope=all', 'TEACHER');
    expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([task.id]);
    expect((await api.post(a, '/crm/tasks', { title: 'x' }, 'TEACHER')).status).toBe(403);
    expect((await api.patch(a, `/crm/tasks/${other.id}`, { done: true }, 'TEACHER')).status).toBe(404);
    expect((await api.patch(a, `/crm/tasks/${task.id}`, { assigneeUserId: a.usersByRole.ADMIN.userId }, 'TEACHER')).status).toBe(403);
    // Guardians never reach CRM.
    expect((await api.get(a, '/crm/tasks', 'GUARDIAN')).status).toBe(403);

    res = await api.get(a, '/crm/tasks/summary', 'TEACHER');
    expect(res.body.data).toEqual({ open: 1, overdue: 1, today: 0 });

    res = await api.patch(a, `/crm/tasks/${task.id}`, { done: true }, 'TEACHER');
    expect(res.status).toBe(200);
    expect(res.body.data.done).toBe(true);
    // Double toggle logs once.
    await api.patch(a, `/crm/tasks/${task.id}`, { done: true }, 'TEACHER');
    const done = await prisma.crmActivity.count({ where: { enquiryId: e.id, type: 'TASK_DONE' } });
    expect(done).toBe(1);
    expect(await prisma.crmActivity.count({ where: { enquiryId: e.id, type: 'TASK_CREATED' } })).toBe(1);
  });

  it('digest: selects due/overdue open work per person and sends once per day', async () => {
    const teacher = a.usersByRole.TEACHER.userId;
    const acct = a.usersByRole.ACCOUNTANT.userId;
    const past = new Date(Date.now() - 30 * 3600 * 1000);
    const future = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    await prisma.crmTask.createMany({
      data: [
        { institutionId: a.institutionId, title: 'Digest overdue', dueAt: past, assigneeUserId: acct },
        { institutionId: a.institutionId, title: 'Digest future', dueAt: future, assigneeUserId: acct },
        { institutionId: a.institutionId, title: 'Digest done', dueAt: past, assigneeUserId: acct, done: true },
      ],
    });
    const entries = await buildDigest(a.institutionId);
    const forAcct = entries.find((x) => x.userId === acct)!;
    expect(forAcct.overdue).toBe(1);
    expect(forAcct.lines.join('\n')).toContain('Digest overdue');
    expect(forAcct.lines.join('\n')).not.toContain('Digest future');
    // Teacher's only task is done → no entry for them unless an owned enquiry is due.
    expect(entries.find((x) => x.userId === teacher)).toBeUndefined();

    await sendDigestForInstitution(a.institutionId);
    await sendDigestForInstitution(a.institutionId);
    const n = await prisma.notification.count({ where: { institutionId: a.institutionId, recipientUserId: acct, type: 'CRM_TASK_DIGEST' } });
    expect(n).toBe(1);
  });

  it('duplicates are detected and merge moves activities/tasks and removes the duplicate', async () => {
    const keep = await newEnquiry(a, { studentName: 'Rahim Uddin', phone: '01744000001', guardianName: null });
    const drop = await newEnquiry(a, { studentName: 'Md. Rahim Uddin', phone: '+880 1744-000001', guardianName: 'Karim Uddin', email: 'karim@example.com', classInterested: 'Six' });
    await api.post(a, '/crm/tasks', { title: 'Dup task', enquiryId: drop.id, assigneeUserId: a.usersByRole.ADMIN.userId });

    const check = await api.post(a, '/crm/duplicates/check', { studentName: 'Rahim', phone: '01744000001' });
    expect(check.body.data.map((x: { id: string }) => x.id).sort()).toEqual([keep.id, drop.id].sort());
    const groups = await api.get(a, '/crm/duplicates');
    const g = groups.body.data.groups.find((x: { items: Array<{ id: string }> }) => x.items.some((i) => i.id === keep.id));
    expect(g.items.map((i: { id: string }) => i.id).sort()).toEqual([keep.id, drop.id].sort());

    const res = await api.post(a, '/crm/merge', { keepId: keep.id, dropId: drop.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: keep.id, guardianName: 'Karim Uddin', email: 'karim@example.com', classInterested: 'Six' });
    expect(await prisma.admissionEnquiry.count({ where: { id: drop.id } })).toBe(0);
    expect(await prisma.crmTask.count({ where: { enquiryId: keep.id, title: 'Dup task' } })).toBe(1);
    // drop's CREATED activity moved over + MERGED entry.
    expect(await prisma.crmActivity.count({ where: { enquiryId: keep.id, type: 'CREATED' } })).toBe(2);
    expect(await prisma.crmActivity.count({ where: { enquiryId: keep.id, type: 'MERGED' } })).toBe(1);
    expect((await api.post(a, '/crm/merge', { keepId: keep.id, dropId: keep.id })).status).toBe(422);
  });

  it('conversion report: rates, average days to admit and CSV', async () => {
    // Fresh numbers in institution B.
    const stages = (await api.get(b, '/crm/stages')).body.data as Array<{ id: string; name: string }>;
    const st = (n: string) => stages.find((s) => s.name === n)!.id;
    const mk = (name: string, source: string, stage: string, createdAt: string, wonAt?: string) =>
      prisma.admissionEnquiry.create({
        data: { institutionId: b.institutionId, studentName: name, phone: '01900000000', source, stageId: st(stage), status: 'NEW', createdAt: new Date(createdAt), wonAt: wonAt ? new Date(wonAt) : null },
      });
    await mk('R1', 'WEBSITE', 'Admitted', '2026-03-01T00:00:00Z', '2026-03-11T00:00:00Z');
    await mk('R2', 'WEBSITE', 'Lost', '2026-03-02T00:00:00Z');
    await mk('R3', 'PHONE', 'Admitted', '2026-03-03T00:00:00Z', '2026-03-23T00:00:00Z');
    await mk('R4', 'PHONE', 'Applied', '2026-03-04T00:00:00Z');

    const res = await api.get(b, '/crm/report?from=2026-03-01&to=2026-03-31&groupBy=source');
    expect(res.status).toBe(200);
    expect(res.body.data.overall).toMatchObject({ total: 4, won: 2, lost: 1, open: 1, conversionRate: 50, avgDaysToAdmit: 15 });
    expect(res.body.data.groups.map((g: { key: string; conversionRate: number; avgDaysToAdmit: number | null }) => [g.key, g.conversionRate, g.avgDaysToAdmit])).toEqual([
      ['PHONE', 50, 20],
      ['WEBSITE', 50, 10],
    ]);
    const applied = res.body.data.funnel.steps.find((s: { name: string }) => s.name === 'Applied');
    expect(applied.reached).toBe(3);

    const csv = await api.get(b, '/crm/report.csv?from=2026-03-01&to=2026-03-31&groupBy=source');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('PHONE,2,1,0,1,50,20');
  });

  it('contacts: volunteers with tags; donor link only while Donations is on', async () => {
    let res = await api.post(a, '/crm/contacts', { type: 'VOLUNTEER', name: 'Hasan Ali', phone: '01755000001', tags: ['Eid', 'Drivers'] });
    expect(res.status).toBe(201);
    const c = res.body.data;
    expect(c.tags).toEqual(['eid', 'drivers']);
    expect((await api.get(a, '/crm/contacts?tag=eid')).body.data.map((x: { id: string }) => x.id)).toEqual([c.id]);
    expect((await api.get(a, '/crm/contacts/tags')).body.data).toEqual(expect.arrayContaining([{ tag: 'eid', count: 1 }]));
    expect((await api.post(a, '/crm/contacts', { name: 'No contact' })).status).toBe(422);

    expect((await api.post(a, `/crm/contacts/${c.id}/link-donor`, {})).status).toBe(422);
    expect((await api.put(a, '/institution/modules', { modules: { 'islamic.donations': true } })).status).toBe(200);
    res = await api.post(a, `/crm/contacts/${c.id}/link-donor`, {});
    expect(res.status).toBe(200);
    expect(res.body.data.donor.name).toBe('Hasan Ali');
    await api.put(a, '/institution/modules', { modules: { 'islamic.donations': false } });
  });

  it('tenant isolation: another school cannot read, move, merge or task A’s enquiries', async () => {
    const e = await newEnquiry(a, { studentName: 'Isolated', phone: '01766000001' });
    const bStage = (await api.get(b, '/crm/stages')).body.data[0].id;
    expect((await api.get(b, `/crm/enquiries/${e.id}/timeline`)).status).toBe(404);
    expect((await api.patch(b, `/crm/enquiries/${e.id}/stage`, { stageId: bStage })).status).toBe(404);
    // A's enquiry can't be moved into B's stage either.
    expect((await api.patch(a, `/crm/enquiries/${e.id}/stage`, { stageId: bStage })).status).toBe(404);
    expect((await api.post(b, '/crm/tasks', { title: 'x', enquiryId: e.id })).status).toBe(404);
    expect((await api.post(b, '/crm/merge', { keepId: e.id, dropId: e.id + 'x' })).status).toBe(404);
    const board = await api.get(b, '/crm/board?search=Isolated');
    expect(board.body.data.columns.every((c: { total: number }) => c.total === 0)).toBe(true);
    const dup = await api.post(b, '/crm/duplicates/check', { studentName: 'Isolated', phone: '01766000001' });
    expect(dup.body.data).toEqual([]);
  });
});
