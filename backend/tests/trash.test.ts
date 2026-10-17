import request from 'supertest';
import app from '../src/app';
import { prisma as appPrisma } from '../src/config/prisma';
import { moveToTrash, purgeExpired } from '../src/modules/trash/trash.service';
import * as sitesSvc from '../src/modules/sites/sites.service';
import * as sitesData from '../src/modules/sites/sites.data.service';
import * as publicSvc from '../src/modules/sites/sites.public.service';
import { clearModuleCache } from '../src/modules/institution/modules.service';
import { createTestInstitution, cleanupInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';

// =============================================================================
// T5 trash & restore — API + DB on a real Postgres copy. `prisma` (fixtures)
// has NO soft-delete layer, so it sees the raw rows; `appPrisma` is the app's
// client (with the layer). Run with:
//   DATABASE_URL=…/sms_track_t4 BREVO_API_KEY= EMAIL_ENABLED=false SMS_ENABLED=false \
//   SSLCOMMERZ_ENABLED=false BKASH_ENABLED=false NAGAD_ENABLED=false npx jest tests/trash.test.ts
// =============================================================================

type Role = keyof InstitutionFixture['usersByRole'];

describe('T5 trash & restore', () => {
  let a: InstitutionFixture;
  let b: InstitutionFixture;
  let sectionId: string;
  let siteId: string;
  let academicYearId: string;
  const auth = (f: InstitutionFixture, role: Role = 'ADMIN') => ({ Authorization: `Bearer ${f.usersByRole[role].token}` });
  const api = {
    get: (f: InstitutionFixture, p: string, role: Role = 'ADMIN') => request(app).get(`/api/v1${p}`).set(auth(f, role)),
    post: (f: InstitutionFixture, p: string, body: object, role: Role = 'ADMIN') => request(app).post(`/api/v1${p}`).set(auth(f, role)).send(body),
    del: (f: InstitutionFixture, p: string, role: Role = 'ADMIN') => request(app).delete(`/api/v1${p}`).set(auth(f, role)),
  };
  const mentions = (res: request.Response, id: string) => JSON.stringify(res.body).includes(id);
  const trashIdOf = (res: request.Response): string => {
    const t = res.body.data?.trash ?? res.body.data;
    expect(t?.trashEntryId).toBeTruthy();
    return t.trashEntryId as string;
  };
  const restore = (f: InstitutionFixture, ids: string[], role: Role = 'ADMIN') => api.post(f, '/trash/restore', { ids }, role);
  let seq = 0;
  const mkStudent = async (studentId: string, extra: Record<string, unknown> = {}) =>
    (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: `${studentId}-${a.slug}`.slice(0, 60), firstName: 'Kid', lastName: `N${++seq}`, sectionId, ...extra } })).id;
  const mkInvoice = async (studentId: string, status = 'UNPAID', paid = 0) =>
    (
      await prisma.invoice.create({
        data: { institutionId: a.institutionId, studentId, invoiceNo: `INV-T5-${++seq}-${a.slug}`.slice(0, 60), totalAmount: 500, paidAmount: paid, dueAmount: 500 - paid, dueDate: new Date('2026-12-01'), status },
      })
    ).id;

  beforeAll(async () => {
    a = await createTestInstitution('trash-a');
    b = await createTestInstitution('trash-b');
    const br = await prisma.branch.create({ data: { institutionId: a.institutionId, name: 'Main' } });
    const cls = await prisma.class.create({ data: { branchId: br.id, name: 'Class 6', level: 6 } });
    sectionId = (await prisma.section.create({ data: { classId: cls.id, name: 'A' } })).id;
    await prisma.student.update({ where: { id: a.studentId }, data: { sectionId, classId: cls.id, phone: '01811000001', status: 'PENDING' } });
    const site = await sitesSvc.getOrCreateSite(a.institutionId);
    await prisma.site.update({ where: { id: site.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    siteId = site.id;
    academicYearId = (await prisma.academicYear.create({ data: { institutionId: a.institutionId, label: '2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), isCurrent: true } })).id;
  });

  afterAll(async () => {
    for (const f of [a, b]) {
      if (!f) continue;
      const i = f.institutionId;
      const steps = [
        () => prisma.trashEntry.deleteMany({ where: { institutionId: i } }),
        () => prisma.crmActivity.deleteMany({ where: { institutionId: i } }),
        () => prisma.crmTask.deleteMany({ where: { institutionId: i } }),
        () => prisma.admissionEnquiry.deleteMany({ where: { institutionId: i } }),
        () => prisma.attendance.deleteMany({ where: { institutionId: i } }),
        () => prisma.familyStudent.deleteMany({ where: { institutionId: i } }),
        () => prisma.familyGuardian.deleteMany({ where: { institutionId: i } }),
        () => prisma.family.deleteMany({ where: { institutionId: i } }),
        () => prisma.donationCampaign.deleteMany({ where: { institutionId: i } }),
        () => prisma.donationFund.deleteMany({ where: { institutionId: i } }),
        () => prisma.sitePost.deleteMany({ where: { institutionId: i } }),
        () => prisma.sitePageVersion.deleteMany({ where: { page: { institutionId: i } } }),
        () => prisma.sitePage.deleteMany({ where: { institutionId: i } }),
        () => prisma.site.deleteMany({ where: { institutionId: i } }),
        () => prisma.event.deleteMany({ where: { institutionId: i } }),
        () => prisma.academicYear.deleteMany({ where: { institutionId: i } }),
        () => prisma.notice.deleteMany({ where: { institutionId: i } }),
        () => prisma.teacher.deleteMany({ where: { user: { institutionId: i } } }),
        () => prisma.guardianStudent.deleteMany({ where: { student: { institutionId: i } } }),
        () => prisma.invoice.deleteMany({ where: { institutionId: i } }),
        () => prisma.student.deleteMany({ where: { institutionId: i } }),
      ];
      for (const s of steps) await s().catch(() => undefined);
      await cleanupInstitution(f);
    }
    await disconnectFixtures();
  });

  it('student: trash hides it from lists, lookups, rosters, guardian/family views, attendance and public status; restore brings it back', async () => {
    const s1 = a.studentId;
    await prisma.attendance.create({ data: { institutionId: a.institutionId, studentId: s1, date: new Date('2026-10-01'), status: 'PRESENT' } });
    const fam = await prisma.family.create({ data: { institutionId: a.institutionId, name: 'Test family' } });
    await prisma.familyStudent.create({ data: { institutionId: a.institutionId, familyId: fam.id, studentId: s1 } });
    await prisma.familyGuardian.create({ data: { institutionId: a.institutionId, familyId: fam.id, guardianId: a.guardianId } });
    const ref = (await prisma.student.findUnique({ where: { id: s1 } }))!.studentId;

    const res = await api.del(a, `/students/${s1}`);
    expect(res.status).toBe(200);
    const entry = trashIdOf(res);

    expect(mentions(await api.get(a, '/students'), s1)).toBe(false);
    expect((await api.get(a, `/students/${s1}`)).status).toBe(404);
    expect(mentions(await api.get(a, `/guardians/${a.guardianId}`), s1)).toBe(false);
    const sec = await appPrisma.section.findUnique({ where: { id: sectionId }, include: { _count: { select: { students: true } }, students: true } });
    expect(sec?._count.students).toBe(0);
    expect(sec?.students).toEqual([]);
    expect(await appPrisma.attendance.count({ where: { institutionId: a.institutionId } })).toBe(0);
    expect(mentions(await api.get(a, `/families/${fam.id}`), s1)).toBe(false);
    const status = await request(app).get('/api/v1/admissions-public/application-status').query({ institutionSlug: a.slug, reference: ref, phone: '01811000001' });
    expect(status.status).toBe(404);
    // Their portal login is paused; raw rows are still there.
    expect((await prisma.user.findUnique({ where: { id: a.studentUserId } }))?.isActive).toBe(false);
    expect((await prisma.student.findUnique({ where: { id: s1 } }))?.deletedAt).toBeTruthy();

    const list = await api.get(a, '/trash?type=STUDENT');
    expect(list.status).toBe(200);
    const row = list.body.data.find((r: { id: string }) => r.id === entry);
    expect(row).toMatchObject({ type: 'STUDENT', deletedByName: 'Test ADMIN', daysLeft: 30 });

    expect((await restore(a, [entry])).status).toBe(200);
    expect((await api.get(a, `/students/${s1}`)).status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: a.studentUserId } }))?.isActive).toBe(true);
    expect(await appPrisma.attendance.count({ where: { institutionId: a.institutionId } })).toBe(1);
    expect(await prisma.trashEntry.count({ where: { id: entry } })).toBe(0);
  });

  it('restore conflict: a newer student took the same student ID → clear 409', async () => {
    const s2 = await mkStudent('DUP-1');
    const code = (await prisma.student.findUnique({ where: { id: s2 } }))!.studentId;
    const entry = trashIdOf(await api.del(a, `/students/${s2}`));
    const s3 = (await prisma.student.create({ data: { institutionId: a.institutionId, studentId: code, firstName: 'New', lastName: 'Kid' } })).id;
    const res = await restore(a, [entry]);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain(code);
    expect(res.body.message).toContain('New Kid');
    await prisma.student.update({ where: { id: s3 }, data: { studentId: `${code}-X` } });
    expect((await restore(a, [entry])).status).toBe(200);
  });

  it('guardian: hidden from the guardian list and the student profile; login paused and restored', async () => {
    const g = await prisma.guardian.create({ data: { institutionId: a.institutionId, firstName: 'Trash', lastName: 'Guardian', phone: '01822000002', relationship: 'MOTHER' } });
    await prisma.guardianStudent.create({ data: { guardianId: g.id, studentId: a.studentId } });
    const entry = trashIdOf(await api.del(a, `/guardians/${g.id}`));
    expect(mentions(await api.get(a, '/guardians'), g.id)).toBe(false);
    expect(mentions(await api.get(a, `/students/${a.studentId}`), g.id)).toBe(false);
    expect((await restore(a, [entry])).status).toBe(200);
    expect(mentions(await api.get(a, `/students/${a.studentId}`), g.id)).toBe(true);
  });

  it('user: trash frees the email, hides the account and its teacher profile; restore refuses while the email is retaken', async () => {
    const email = `t5.teacher.${a.slug}@test.local`;
    const u = await prisma.user.create({ data: { institutionId: a.institutionId, email, passwordHash: 'x', role: 'TEACHER', firstName: 'Tara', lastName: 'Teach', phone: '8801833000003' } });
    await prisma.teacher.create({ data: { userId: u.id } });
    const res = await api.del(a, `/users/${u.id}`);
    expect(res.status).toBe(200);
    const entry = trashIdOf(res);
    expect(mentions(await api.get(a, '/users'), u.id)).toBe(false);
    expect(await appPrisma.teacher.count({ where: { userId: u.id } })).toBe(0);
    const raw = await prisma.user.findUnique({ where: { id: u.id } });
    expect(raw?.isActive).toBe(false);
    expect(raw?.email).not.toBe(email);
    expect(raw?.phone).toBeNull();

    // A new account takes the email meanwhile → restore explains the clash.
    const taker = await prisma.user.create({ data: { institutionId: a.institutionId, email, passwordHash: 'x', role: 'TEACHER', firstName: 'New', lastName: 'Owner' } });
    const clash = await restore(a, [entry]);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain(email);
    await prisma.user.delete({ where: { id: taker.id } });
    expect((await restore(a, [entry])).status).toBe(200);
    const back = await prisma.user.findUnique({ where: { id: u.id } });
    expect(back).toMatchObject({ email, phone: '8801833000003', isActive: true, deletedAt: null });

    // Guards: not yourself, not the last admin.
    expect((await api.del(a, `/users/${a.usersByRole.ADMIN.userId}`)).status).toBe(403);
    await expect(moveToTrash({ institutionId: a.institutionId, userId: u.id, role: 'ADMIN' }, 'USER', a.usersByRole.ADMIN.userId)).rejects.toThrow(/last active admin/);
  });

  it('invoice: only unpaid/cancelled invoices can be trashed; paid ones stay visible', async () => {
    const paid = await mkInvoice(a.studentId, 'PAID', 500);
    const partial = await mkInvoice(a.studentId, 'PARTIAL', 100);
    const unpaid = await mkInvoice(a.studentId, 'UNPAID');
    expect((await api.del(a, `/fees/invoices/${paid}`)).status).toBe(409);
    expect((await api.del(a, `/fees/invoices/${partial}`)).status).toBe(409);
    const entry = trashIdOf(await api.del(a, `/fees/invoices/${unpaid}`, 'ACCOUNTANT'));
    const list = await api.get(a, '/fees/invoices');
    expect(mentions(list, unpaid)).toBe(false);
    expect(mentions(list, paid)).toBe(true);
    expect((await api.get(a, `/fees/invoices/${unpaid}`)).status).toBe(404);
    // Undo by the accountant who deleted it.
    expect((await restore(a, [entry], 'ACCOUNTANT')).status).toBe(200);
    expect(mentions(await api.get(a, '/fees/invoices'), unpaid)).toBe(true);
  });

  it('notice and event: hidden from staff lists and the public website', async () => {
    const n = await prisma.notice.create({ data: { institutionId: a.institutionId, title: 'Trash me notice', content: 'x', audience: 'ALL', publishedAt: new Date(Date.now() - 60_000) } });
    expect(JSON.stringify(await sitesData.notices(siteId, { limit: 20 }))).toContain(n.id);
    const nEntry = trashIdOf(await api.del(a, `/notices/${n.id}`, 'TEACHER'));
    expect(mentions(await api.get(a, '/notices'), n.id)).toBe(false);
    expect((await api.get(a, `/notices/${n.id}`)).status).toBe(404);
    expect(JSON.stringify(await sitesData.notices(siteId, { limit: 20 }))).not.toContain(n.id);

    const ev = await prisma.event.create({ data: { institutionId: a.institutionId, academicYearId, title: 'Trash me event', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-01') } });
    const eEntry = trashIdOf(await api.del(a, `/events/${ev.id}`));
    expect(mentions(await api.get(a, '/events'), ev.id)).toBe(false);
    expect((await api.get(a, `/events/${ev.id}`)).status).toBe(404);

    // Bulk restore both.
    const res = await restore(a, [nEntry, eEntry]);
    expect(res.status).toBe(200);
    expect(res.body.data.restored).toBe(2);
    expect(mentions(await api.get(a, '/events'), ev.id)).toBe(true);
  });

  it('enquiry: hidden from the list, board and funnel counts', async () => {
    const created = await api.post(a, '/enquiries', { studentName: 'Trash Enquiry', phone: '01844000004' });
    const id = created.body.data.id as string;
    const before = (await api.get(a, '/enquiries/funnel')).body.data.enquiries as number;
    const task = await api.post(a, '/crm/tasks', { title: 'Call trashed lead', enquiryId: id, assigneeUserId: a.usersByRole.TEACHER.userId });
    const general = await api.post(a, '/crm/tasks', { title: 'General task', assigneeUserId: a.usersByRole.TEACHER.userId });
    const entry = trashIdOf(await api.del(a, `/enquiries/${id}`));
    // Its tasks leave "My tasks"; tasks without an enquiry stay.
    const mine = await api.get(a, '/crm/tasks?status=all', 'TEACHER');
    expect(mentions(mine, task.body.data.id)).toBe(false);
    expect(mentions(mine, general.body.data.id)).toBe(true);
    expect(mentions(await api.get(a, '/enquiries'), id)).toBe(false);
    expect(mentions(await api.get(a, '/crm/board'), id)).toBe(false);
    expect((await api.get(a, '/enquiries/funnel')).body.data.enquiries).toBe(before - 1);
    expect((await api.get(a, `/crm/enquiries/${id}/timeline`)).status).toBe(404);
    expect((await restore(a, [entry])).status).toBe(200);
    expect((await api.get(a, `/crm/enquiries/${id}/timeline`)).status).toBe(200);
  });

  it('website post/page: gone from the public site, link freed, restore conflict when the link is reused', async () => {
    const post = await prisma.sitePost.create({ data: { siteId, institutionId: a.institutionId, slug: 'trash-news', title: 'News', body: {}, authorUserId: a.usersByRole.ADMIN.userId, status: 'PUBLISHED', publishedAt: new Date() } });
    await expect(publicSvc.getPublicPost(siteId, 'trash-news')).resolves.toBeTruthy();
    const entry = trashIdOf(await api.del(a, `/sites/posts/${post.id}`));
    await expect(publicSvc.getPublicPost(siteId, 'trash-news')).rejects.toThrow();
    expect(mentions(await api.get(a, '/sites/posts'), post.id)).toBe(false);
    const reuse = await prisma.sitePost.create({ data: { siteId, institutionId: a.institutionId, slug: 'trash-news', title: 'Newer', body: {}, authorUserId: a.usersByRole.ADMIN.userId } });
    const clash = await restore(a, [entry]);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('Newer');
    await prisma.sitePost.delete({ where: { id: reuse.id } });
    expect((await restore(a, [entry])).status).toBe(200);
    expect((await prisma.sitePost.findUnique({ where: { id: post.id } }))?.slug).toBe('trash-news');

    const page = await api.post(a, '/sites/pages', { slug: 'trash-about', title: 'About' });
    expect(page.status).toBe(201);
    const pid = page.body.data.id as string;
    const pEntry = trashIdOf(await api.del(a, `/sites/pages/${pid}`));
    expect(mentions(await api.get(a, '/sites/pages'), pid)).toBe(false);
    // The slug is free for a new page now.
    expect((await api.post(a, '/sites/pages', { slug: 'trash-about', title: 'About v2' })).status).toBe(201);
    expect((await restore(a, [pEntry])).status).toBe(409);
  });

  it('donation fund/campaign: hidden from lists; a campaign waits for its fund to be restored', async () => {
    expect((await request(app).put('/api/v1/institution/modules').set(auth(a)).send({ modules: { 'islamic.donations': true } })).status).toBe(200);
    clearModuleCache(a.institutionId);
    const fund = await prisma.donationFund.create({ data: { institutionId: a.institutionId, name: 'Trash fund' } });
    const camp = await prisma.donationCampaign.create({ data: { institutionId: a.institutionId, fundId: fund.id, title: 'Trash campaign' } });
    const cEntry = trashIdOf(await api.del(a, `/donations/campaigns/${camp.id}`));
    expect(mentions(await api.get(a, '/donations/campaigns'), camp.id)).toBe(false);
    const fEntry = trashIdOf(await api.del(a, `/donations/funds/${fund.id}`));
    expect(mentions(await api.get(a, '/donations/funds'), fund.id)).toBe(false);
    const wait = await restore(a, [cEntry]);
    expect(wait.status).toBe(409);
    expect(wait.body.message).toMatch(/restore the fund first/);
    expect((await restore(a, [fEntry])).status).toBe(200);
    expect((await restore(a, [cEntry])).status).toBe(200);
    expect(mentions(await api.get(a, '/donations/campaigns'), camp.id)).toBe(true);
  });

  it('family: delete moves it to the trash (ADMIN), hidden from lists and its page', async () => {
    const fam = await prisma.family.create({ data: { institutionId: a.institutionId, name: 'Trash household', source: 'MANUAL' } });
    expect((await api.del(a, `/families/${fam.id}`, 'ACCOUNTANT')).status).toBe(403);
    const entry = trashIdOf(await api.del(a, `/families/${fam.id}`));
    expect(mentions(await api.get(a, '/families?q=Trash'), fam.id)).toBe(false);
    expect((await api.get(a, `/families/${fam.id}`)).status).toBe(404);
    expect((await restore(a, [entry])).status).toBe(200);
    expect((await api.get(a, `/families/${fam.id}`)).status).toBe(200);
  });

  it('daily purge: deletes items older than 30 days with an audit row; money-linked students are kept', async () => {
    const n = await prisma.notice.create({ data: { institutionId: a.institutionId, title: 'Old notice', content: 'x', audience: 'ALL' } });
    const nEntry = trashIdOf(await api.del(a, `/notices/${n.id}`));
    const s = await mkStudent('PURGE-1');
    await mkInvoice(s, 'PAID', 500);
    const sEntry = trashIdOf(await api.del(a, `/students/${s}`));
    const fresh = await prisma.notice.create({ data: { institutionId: a.institutionId, title: 'Fresh notice', content: 'x', audience: 'ALL' } });
    const freshEntry = trashIdOf(await api.del(a, `/notices/${fresh.id}`));
    const past = new Date(Date.now() - 31 * 24 * 3600 * 1000);
    await prisma.trashEntry.updateMany({ where: { id: { in: [nEntry, sEntry] } }, data: { purgeAfter: past } });

    await purgeExpired();
    expect(await prisma.notice.count({ where: { id: n.id } })).toBe(0);
    expect(await prisma.trashEntry.count({ where: { id: nEntry } })).toBe(0);
    // Fee records block the permanent delete; the student stays restorable.
    const kept = await prisma.trashEntry.findUnique({ where: { id: sEntry } });
    expect(kept?.purgeError).toMatch(/fee records/);
    expect(await prisma.student.count({ where: { id: s } })).toBe(1);
    // Not yet 30 days: untouched.
    expect(await prisma.trashEntry.count({ where: { id: freshEntry } })).toBe(1);
    const audit = await prisma.auditLog.findFirst({ where: { institutionId: a.institutionId, resource: 'trash', action: 'DELETE' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(audit?.metadata)).toContain('TRASH_PURGE');
    expect(JSON.stringify(audit?.metadata)).toContain(n.id);
  });

  it('permanent delete (ADMIN only, typed confirmation), permissions and tenant isolation', async () => {
    const ev = await prisma.event.create({ data: { institutionId: a.institutionId, academicYearId, title: 'Purge me', startDate: new Date('2026-11-02'), endDate: new Date('2026-11-02') } });
    const entry = trashIdOf(await api.del(a, `/events/${ev.id}`));

    expect((await api.get(a, '/trash', 'TEACHER')).status).toBe(403);
    expect((await api.post(a, '/trash/purge', { ids: [entry], confirm: 'DELETE' }, 'ACCOUNTANT')).status).toBe(403);
    expect((await api.post(a, '/trash/purge', { ids: [entry] })).status).toBe(422);
    // Someone else's delete can't be undone by a non-admin.
    expect((await restore(a, [entry], 'TEACHER')).status).toBe(403);
    // Another school sees nothing and can't touch it.
    expect(mentions(await api.get(b, '/trash'), entry)).toBe(false);
    expect((await restore(b, [entry])).status).toBe(404);
    expect((await api.post(b, '/trash/purge', { ids: [entry], confirm: 'DELETE' })).status).toBe(404);
    expect(await prisma.event.count({ where: { id: ev.id } })).toBe(1);

    const res = await api.post(a, '/trash/purge', { ids: [entry], confirm: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await prisma.event.count({ where: { id: ev.id } })).toBe(0);

    const summary = await api.get(a, '/trash/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data.retentionDays).toBe(30);
  });
});
