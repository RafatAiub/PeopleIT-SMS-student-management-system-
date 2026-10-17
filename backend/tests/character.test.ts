import request from 'supertest';
import app from '../src/app';
import { reportCardCharacter } from '../src/modules/character/character.service';
import { createTestInstitution, cleanupInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';

// =============================================================================
// T2 character (Akhlaq) scoring & badges — API + DB behaviour on a real
// Postgres copy. Run with email/SMS/gateways neutralised:
//   DATABASE_URL=…/sms_track_t2 BREVO_API_KEY= EMAIL_ENABLED=false SMS_ENABLED=false \
//   SSLCOMMERZ_ENABLED=false BKASH_ENABLED=false NAGAD_ENABLED=false npx jest tests/character.test.ts
// =============================================================================

type Role = keyof InstitutionFixture['usersByRole'];

describe('T2 character scoring & badges', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;
  let secA: string; // TEACHER is class teacher here
  let secB: string; // not the teacher's
  let s1: string; // fixture student (guardian-linked), section A
  let s2: string; // section A
  let s3: string; // section B
  let teacherRowId: string;
  let periodId: string;
  let traits: Array<{ id: string; name: string; scaleMin: number; scaleMax: number }>;

  const auth = (f: InstitutionFixture, role: Role = 'ADMIN') => ({ Authorization: `Bearer ${f.usersByRole[role].token}` });
  const api = {
    get: (f: InstitutionFixture, path: string, role: Role = 'ADMIN') => request(app).get(`/api/v1/character${path}`).set(auth(f, role)),
    post: (f: InstitutionFixture, path: string, body: object, role: Role = 'ADMIN') => request(app).post(`/api/v1/character${path}`).set(auth(f, role)).send(body),
    put: (f: InstitutionFixture, path: string, body: object, role: Role = 'ADMIN') => request(app).put(`/api/v1/character${path}`).set(auth(f, role)).send(body),
  };
  const enable = async (f: InstitutionFixture, on: boolean) => {
    const res = await request(app).put('/api/v1/institution/modules').set(auth(f)).send({ modules: { 'islamic.character': on } });
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    a = await createTestInstitution('chr-a');
    b = await createTestInstitution('chr-b');
    const branch = await prisma.branch.create({ data: { institutionId: a.institutionId, name: 'Main' } });
    const cls = await prisma.class.create({ data: { branchId: branch.id, name: 'Class 5', level: 5 } });
    const teacher = await prisma.teacher.create({ data: { userId: a.usersByRole.TEACHER.userId } });
    teacherRowId = teacher.id;
    secA = (await prisma.section.create({ data: { classId: cls.id, name: 'A', classTeacherId: teacher.id } })).id;
    secB = (await prisma.section.create({ data: { classId: cls.id, name: 'B' } })).id;
    s1 = a.studentId;
    await prisma.student.update({ where: { id: s1 }, data: { classId: cls.id, sectionId: secA, firstName: 'Abdullah', lastName: 'Karim' } });
    s2 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S2-${a.slug}`, firstName: 'Bilal', lastName: 'Hossain', classId: cls.id, sectionId: secA } })).id;
    s3 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `S3-${a.slug}`, firstName: 'Caleb', lastName: 'Other', classId: cls.id, sectionId: secB } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.attendance.deleteMany({ where: { institutionId: a.institutionId } }).catch(() => undefined);
    for (const f of [a, b]) {
      const where = { institutionId: f.institutionId };
      await prisma.characterPointEntry.deleteMany({ where }).catch(() => undefined);
      await prisma.characterAward.deleteMany({ where }).catch(() => undefined);
      await prisma.characterBadge.deleteMany({ where }).catch(() => undefined);
      await prisma.characterPeriod.deleteMany({ where }).catch(() => undefined);
      await prisma.characterTrait.deleteMany({ where }).catch(() => undefined);
      await prisma.characterSettings.deleteMany({ where }).catch(() => undefined);
    }
    await prisma.section.updateMany({ where: { id: { in: [secA, secB] } }, data: { classTeacherId: null } }).catch(() => undefined);
    await prisma.teacher.deleteMany({ where: { id: teacherRowId } }).catch(() => undefined);
    await cleanupInstitution(a);
    await cleanupInstitution(b);
    await disconnectFixtures();
  });

  it('module off (default) → 403 MODULE_DISABLED for staff, guardians and students', async () => {
    const res = await api.get(a, '/traits');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_DISABLED');
    expect((await api.get(a, '/mine', 'GUARDIAN')).body.code).toBe('MODULE_DISABLED');
    expect((await api.get(a, '/mine', 'STUDENT')).body.code).toBe('MODULE_DISABLED');
  });

  it('switched on: admin seeds the 7 default traits once; teacher/guardian cannot manage traits', async () => {
    await enable(a, true);
    await enable(b, true);
    const seeded = await api.post(a, '/traits/defaults', {});
    expect(seeded.status).toBe(200);
    expect(seeded.body.data).toHaveLength(7);
    expect((await api.post(a, '/traits/defaults', {})).body.data).toHaveLength(7); // idempotent
    traits = seeded.body.data;
    expect(traits[0].name).toBe('Punctuality');
    expect((await api.post(a, '/traits', { name: 'X' }, 'TEACHER')).status).toBe(403);
    expect((await api.get(a, '/traits', 'GUARDIAN')).status).toBe(403);
    expect((await api.get(a, '/traits', 'TEACHER')).status).toBe(200);
    // Scale validation
    expect((await api.post(a, '/traits', { name: 'Bad', scaleMin: 5, scaleMax: 5 })).status).toBe(422);
  });

  it('creates periods (MANAGEMENT allowed) and rejects a reversed range', async () => {
    const p = await api.post(a, '/periods', { name: 'October 2026', kind: 'MONTHLY', startDate: '2026-10-01', endDate: '2026-10-31' }, 'MANAGEMENT');
    expect(p.status).toBe(201);
    periodId = p.body.data.id;
    expect((await api.post(a, '/periods', { name: 'Bad', startDate: '2026-10-31', endDate: '2026-10-01' })).status).toBe(422);
    expect((await api.post(a, '/periods', { name: 'T', startDate: '2026-10-01', endDate: '2026-10-31' }, 'TEACHER')).status).toBe(403);
  });

  it('teachers are limited to their own sections (class teacher)', async () => {
    const mine = await api.get(a, '/sections', 'TEACHER');
    expect(mine.body.data.map((s: { id: string }) => s.id)).toEqual([secA]);
    expect((await api.get(a, '/sections')).body.data).toHaveLength(2); // admin: all

    const grid = await api.get(a, `/grid?periodId=${periodId}&sectionId=${secA}`, 'TEACHER');
    expect(grid.status).toBe(200);
    expect(grid.body.data.students.map((s: { id: string }) => s.id).sort()).toEqual([s1, s2].sort());
    expect((await api.get(a, `/grid?periodId=${periodId}&sectionId=${secB}`, 'TEACHER')).status).toBe(403);
    expect((await api.get(a, `/grid?periodId=${periodId}&sectionId=${secB}`)).status).toBe(200);
  });

  it('saves a score grid with comments; validates scale and section membership', async () => {
    const full = (studentId: string, score: number) => traits.map((t) => ({ studentId, traitId: t.id, score }));
    const save = await api.put(a, '/grid', { periodId, sectionId: secA, scores: [...full(s1, 5), ...full(s2, 2)], comments: [{ studentId: s1, comment: 'Very polite' }] }, 'TEACHER');
    expect(save.status).toBe(200);
    expect(save.body.data.saved).toBe(14);

    const grid = (await api.get(a, `/grid?periodId=${periodId}&sectionId=${secA}`, 'TEACHER')).body.data;
    const row1 = grid.students.find((s: { id: string }) => s.id === s1);
    expect(row1.overall).toBe(100);
    expect(row1.comment).toBe('Very polite');
    expect(grid.students.find((s: { id: string }) => s.id === s2).overall).toBe(25);

    // Clear one cell (null) → removed; re-save is an upsert, not a duplicate.
    await api.put(a, '/grid', { periodId, sectionId: secA, scores: [{ studentId: s2, traitId: traits[0].id, score: null }] }, 'TEACHER');
    expect(await prisma.characterScore.count({ where: { periodId, studentId: s2 } })).toBe(6);
    await api.put(a, '/grid', { periodId, sectionId: secA, scores: [{ studentId: s2, traitId: traits[0].id, score: 2 }] }, 'TEACHER');
    expect(await prisma.characterScore.count({ where: { periodId, studentId: s2 } })).toBe(7);

    expect((await api.put(a, '/grid', { periodId, sectionId: secA, scores: [{ studentId: s1, traitId: traits[0].id, score: 9 }] }, 'TEACHER')).status).toBe(422);
    // A section-B student smuggled into the section-A grid
    expect((await api.put(a, '/grid', { periodId, sectionId: secA, scores: [{ studentId: s3, traitId: traits[0].id, score: 3 }] })).status).toBe(403);
    // Teacher writing section B
    expect((await api.put(a, '/grid', { periodId, sectionId: secB, scores: [{ studentId: s3, traitId: traits[0].id, score: 3 }] }, 'TEACHER')).status).toBe(403);
  });

  let overallBadge: string;
  let traitBadge: string;
  let streakBadge: string;
  let manualBadge: string;

  it('defines badges with validated auto-rules', async () => {
    const o = await api.post(a, '/badges', { name: 'Star of Akhlaq', nameBn: 'আখলাকের তারকা', icon: 'star', color: '#c2550a', points: 20, rule: 'OVERALL_AVERAGE', ruleThreshold: 90 });
    expect(o.status).toBe(201);
    overallBadge = o.body.data.id;
    traitBadge = (await api.post(a, '/badges', { name: 'Salah champion', icon: 'moon', points: 5, rule: 'TRAIT_AVERAGE', ruleTraitId: traits[2].id, ruleThreshold: 5 })).body.data.id;
    streakBadge = (await api.post(a, '/badges', { name: 'On time', icon: 'clock', points: 7, rule: 'ATTENDANCE_STREAK', ruleStreakDays: 3 })).body.data.id;
    manualBadge = (await api.post(a, '/badges', { name: 'Helping hand', icon: 'heart', points: 10 })).body.data.id;
    expect((await api.post(a, '/badges', { name: 'Bad', rule: 'TRAIT_AVERAGE', ruleThreshold: 4 })).status).toBe(422);
    expect((await api.post(a, '/badges', { name: 'Bad icon', icon: 'skull' })).status).toBe(422);
    expect((await api.post(a, '/badges', { name: 'Bad colour', color: 'orange' })).status).toBe(422);
  });

  it('auto-awards by rule, idempotently, and writes the points ledger', async () => {
    // s2: 3 consecutive on-time days in the period → streak badge only.
    for (const day of ['2026-10-05', '2026-10-06', '2026-10-07']) {
      await prisma.attendance.create({ data: { institutionId: a.institutionId, studentId: s2, date: new Date(`${day}T00:00:00Z`), status: 'PRESENT' } });
    }
    await prisma.attendance.create({ data: { institutionId: a.institutionId, studentId: s1, date: new Date('2026-10-05T00:00:00Z'), status: 'LATE' } });

    const run = await api.post(a, '/awards/auto', { periodId, sectionId: secA }, 'TEACHER');
    expect(run.status).toBe(200);
    expect(run.body.data.awarded).toBe(3); // s1: overall + salah; s2: streak

    const awardsS1 = await prisma.characterAward.findMany({ where: { studentId: s1 }, select: { badgeId: true, source: true } });
    expect(awardsS1.map((x) => x.badgeId).sort()).toEqual([overallBadge, traitBadge].sort());
    expect(awardsS1.every((x) => x.source === 'AUTO')).toBe(true);
    expect((await prisma.characterAward.findMany({ where: { studentId: s2 } })).map((x) => x.badgeId)).toEqual([streakBadge]);

    // Re-run → nothing new.
    expect((await api.post(a, '/awards/auto', { periodId, sectionId: secA }, 'TEACHER')).body.data.awarded).toBe(0);
    // Teacher may not run it for a section they don't teach (or without a section).
    expect((await api.post(a, '/awards/auto', { periodId, sectionId: secB }, 'TEACHER')).status).toBe(403);
    expect((await api.post(a, '/awards/auto', { periodId }, 'TEACHER')).status).toBe(400);

    const pts = await api.get(a, `/points/${s1}`);
    expect(pts.body.data.balance).toBe(25);
  });

  let manualAwardId: string;

  it('manual award by a teacher: own section only, guardian notified, revoke is idempotent', async () => {
    expect((await api.post(a, '/awards', { badgeId: manualBadge, studentIds: [s3], reason: 'Helped clean' }, 'TEACHER')).status).toBe(403);
    expect((await api.post(a, '/awards', { badgeId: manualBadge, studentIds: [s1], reason: '' }, 'TEACHER')).status).toBe(422);
    const res = await api.post(a, '/awards', { badgeId: manualBadge, studentIds: [s1], reason: 'Helped a classmate' }, 'TEACHER');
    expect(res.status).toBe(201);
    manualAwardId = res.body.data.awardIds[0];
    expect((await api.get(a, `/points/${s1}`)).body.data.balance).toBe(35);

    // BADGE_AWARDED reaches the linked guardian (in-app is written inline, but fire-and-forget).
    let found = 0;
    for (let i = 0; i < 20 && !found; i++) {
      found = await prisma.notification.count({ where: { institutionId: a.institutionId, recipientUserId: a.usersByRole.GUARDIAN.userId, type: 'BADGE_AWARDED' } });
      if (!found) await new Promise((r) => setTimeout(r, 150));
    }
    expect(found).toBeGreaterThan(0);

    // Another teacher's award can't be revoked by a guardian; admin can revoke.
    expect((await api.post(a, `/awards/${manualAwardId}/revoke`, { reason: 'x' }, 'GUARDIAN')).status).toBe(403);
    const rev = await api.post(a, `/awards/${manualAwardId}/revoke`, { reason: 'Given to the wrong student' });
    expect(rev.status).toBe(200);
    expect((await api.post(a, `/awards/${manualAwardId}/revoke`, { reason: 'again' })).body.data.alreadyRevoked).toBe(true);
    expect((await api.get(a, `/points/${s1}`)).body.data.balance).toBe(25);
    const entries = await prisma.characterPointEntry.findMany({ where: { awardId: manualAwardId } });
    expect(entries.map((e) => e.points).sort((x, y) => x - y)).toEqual([-10, 10]);

    // Manual adjustment
    expect((await api.post(a, '/points', { studentId: s2, points: -3, reason: 'Late homework' }, 'TEACHER')).status).toBe(201);
    expect((await api.post(a, '/points', { studentId: s3, points: 3, reason: 'x' }, 'TEACHER')).status).toBe(403);
  });

  it('guardian and student see only their own child / self', async () => {
    const g = await api.get(a, '/mine', 'GUARDIAN');
    expect(g.status).toBe(200);
    expect(g.body.data.children).toHaveLength(1);
    const child = g.body.data.children[0];
    expect(child.student.id).toBe(s1);
    expect(child.points).toBe(25);
    expect(child.latest.overall).toBe(100);
    expect(child.badges.map((x: { badgeId: string }) => x.badgeId).sort()).toEqual([overallBadge, traitBadge].sort());

    expect((await api.get(a, `/students/${s2}/summary`, 'GUARDIAN')).status).toBe(404);
    expect((await api.get(a, `/students/${s1}/summary`, 'GUARDIAN')).status).toBe(200);
    expect((await api.get(a, `/students/${s1}/summary`, 'STUDENT')).status).toBe(200);
    expect((await api.get(a, `/students/${s2}/summary`, 'STUDENT')).status).toBe(404);
    expect((await api.get(a, `/students/${s3}/summary`, 'TEACHER')).status).toBe(404);
    expect((await api.get(a, `/points/${s2}`, 'GUARDIAN')).status).toBe(404);
  });

  it('leaderboard: off by default, then first name + class only; public only when allowed', async () => {
    expect((await api.get(a, '/leaderboard?sectionId=' + secA)).status).toBe(403);
    await api.put(a, '/settings', { leaderboardEnabled: true });
    const lb = await api.get(a, '/leaderboard?sectionId=' + secA);
    expect(lb.status).toBe(200);
    expect(lb.body.data.rows[0]).toEqual({ rank: 1, name: 'Abdullah', className: 'Class 5', points: 25, isMine: false });
    expect(JSON.stringify(lb.body.data)).not.toContain('Karim');
    expect((await api.get(a, '/leaderboard', 'GUARDIAN')).status).toBe(403);
    await api.put(a, '/settings', { leaderboardPublic: true });
    const g = await api.get(a, '/leaderboard', 'GUARDIAN');
    expect(g.status).toBe(200);
    expect(g.body.data.rows.find((r: { name: string }) => r.name === 'Abdullah').isMine).toBe(true);
  });

  it('is tenant-isolated', async () => {
    expect((await api.get(b, `/grid?periodId=${periodId}&sectionId=${secA}`)).status).toBe(404);
    expect((await api.get(b, `/students/${s1}/summary`)).status).toBe(404);
    const bBadge = (await api.post(b, '/badges', { name: 'B badge' })).body.data.id;
    expect((await api.post(b, '/awards', { badgeId: bBadge, studentIds: [s1], reason: 'x' })).status).toBe(404);
    expect((await api.post(a, '/awards', { badgeId: bBadge, studentIds: [s1], reason: 'x' })).status).toBe(404);
    expect((await api.put(b, `/periods/${periodId}`, { locked: true })).status).toBe(404);
    expect((await api.get(b, '/badges')).body.data).toHaveLength(1);
  });

  it('locks a period, protects used traits/badges, and feeds the report card', async () => {
    await api.put(a, `/periods/${periodId}`, { locked: true });
    expect((await api.put(a, '/grid', { periodId, sectionId: secA, scores: [{ studentId: s1, traitId: traits[0].id, score: 4 }] })).status).toBe(400);
    expect((await request(app).delete(`/api/v1/character/traits/${traits[0].id}`).set(auth(a))).status).toBe(409);
    expect((await request(app).delete(`/api/v1/character/badges/${overallBadge}`).set(auth(a))).status).toBe(409);
    expect((await request(app).delete(`/api/v1/character/periods/${periodId}`).set(auth(a))).status).toBe(409);

    const rc = await reportCardCharacter(a.institutionId, s1, new Date('2026-11-15T00:00:00Z'));
    expect(rc?.periodName).toBe('October 2026');
    expect(rc?.overall).toBe(100);
    expect(rc?.traits).toHaveLength(7);
    expect(rc?.badges.sort()).toEqual(['Salah champion', 'Star of Akhlaq']);
  });

  it('switching the module off again blocks everything and hides it from the report card', async () => {
    await enable(a, false);
    expect((await api.get(a, '/badges')).body.code).toBe('MODULE_DISABLED');
    expect(await reportCardCharacter(a.institutionId, s1, new Date('2026-11-15T00:00:00Z'))).toBeNull();
  });
});
