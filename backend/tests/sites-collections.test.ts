// DB-backed tests for the website collections layer (W1/W5/W7): tenant
// isolation, opt-in filtering, no student data, suppression, slugs, publish and
// preview rules, template routes, sitemap. Uses the same real-Postgres
// fixtures as the other suites (point DATABASE_URL at a disposable database).

import { UserRole } from '@prisma/client';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../src/utils/AppError';
import { cleanupInstitution, createTestInstitution, disconnectFixtures, prisma, type InstitutionFixture } from './helpers/fixtures';
import * as collections from '../src/modules/sites/sites.collections.service';
import * as publicSvc from '../src/modules/sites/sites.public.service';
import * as data from '../src/modules/sites/sites.data.service';
import * as portal from '../src/modules/sites/sites.portal.service';
import * as sitesSvc from '../src/modules/sites/sites.service';
import { signPreviewToken } from '../src/modules/sites/sites.preview';

jest.setTimeout(120_000);

let A: InstitutionFixture;
let B: InstitutionFixture;
let siteA: { id: string; subdomain: string };
let siteB: { id: string; subdomain: string };
let ctxA: sitesSvc.SitesCtx;

const ids: Record<string, string> = {};

async function makeTeacher(institutionId: string, first: string, last: string, opts: { show: boolean; subject?: string; department?: string; phone?: string }) {
  const user = await prisma.user.create({
    data: {
      institutionId,
      email: `${first}.${last}.${Math.random().toString(36).slice(2)}@test.local`.toLowerCase(),
      passwordHash: 'x',
      role: UserRole.TEACHER,
      firstName: first,
      lastName: last,
      phone: opts.phone ?? null,
      showOnWebsite: opts.show,
    },
  });
  const teacher = await prisma.teacher.create({
    data: { userId: user.id, subjectExpertise: opts.subject ?? null, qualification: 'MSc', address: 'SECRET STREET', dateOfBirth: new Date('1980-01-01') },
  });
  if (opts.department) await prisma.staffProfile.create({ data: { userId: user.id, institutionId, designation: 'Senior Teacher', department: opts.department, baseSalary: 99999 } });
  return { user, teacher };
}

beforeAll(async () => {
  A = await createTestInstitution('colA');
  B = await createTestInstitution('colB');
  ctxA = { institutionId: A.institutionId, userId: A.usersByRole.ADMIN.userId, role: 'ADMIN' };

  const sa = await sitesSvc.getOrCreateSite(A.institutionId);
  const sb = await sitesSvc.getOrCreateSite(B.institutionId);
  await prisma.site.update({
    where: { id: sa.id },
    data: { status: 'PUBLISHED', publishedAt: new Date(), settings: { siteName: 'A', publicResults: true, showToppers: true, courses: { enabled: true } } },
  });
  await prisma.site.update({ where: { id: sb.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), settings: { siteName: 'B' } } });
  siteA = { id: sa.id, subdomain: sa.subdomain };
  siteB = { id: sb.id, subdomain: sb.subdomain };

  // Teachers
  const t1 = await makeTeacher(A.institutionId, 'Rahim', 'Uddin', { show: true, subject: 'Physics', department: 'Science', phone: '8801711111111' });
  const t2 = await makeTeacher(A.institutionId, 'Hidden', 'Teacher', { show: false, subject: 'Math' });
  const tb = await makeTeacher(B.institutionId, 'Other', 'School', { show: true, subject: 'Chemistry' });
  ids.t1User = t1.user.id; ids.t1 = t1.teacher.id; ids.t2 = t2.teacher.id; ids.t2User = t2.user.id; ids.tbUser = tb.user.id;

  // Branches, classes
  const brA = await prisma.branch.create({ data: { institutionId: A.institutionId, name: 'Main A' } });
  const brB = await prisma.branch.create({ data: { institutionId: B.institutionId, name: 'Main B' } });
  const c8 = await prisma.class.create({ data: { branchId: brA.id, name: 'Class 8', level: 8 } });
  const c9 = await prisma.class.create({ data: { branchId: brA.id, name: 'Class 9', level: 9 } });
  const cb = await prisma.class.create({ data: { branchId: brB.id, name: 'Class 8', level: 8 } });
  ids.c8 = c8.id; ids.c9 = c9.id; ids.cb = cb.id;
  await prisma.section.create({ data: { classId: c8.id, name: 'A', classTeacherId: t1.teacher.id } });
  await prisma.section.create({ data: { classId: c8.id, name: 'B', classTeacherId: t2.teacher.id } });

  // Routine: one opted-in teacher, one hidden
  const slot = (teacherId: string, subject: string, startTime: string) => ({
    institutionId: A.institutionId, branchId: brA.id, dayOfWeek: 'MONDAY', startTime, endTime: '10:00', className: 'Class 8', sectionName: 'A', subject, teacherId,
  });
  await prisma.timetableSlot.create({ data: slot(t1.teacher.id, 'Physics', '09:00') });
  await prisma.timetableSlot.create({ data: slot(t2.teacher.id, 'Math', '10:00') });
  await prisma.subject.create({ data: { institutionId: A.institutionId, name: 'Physics' } });

  // Students: Class 8 -> 6 male + 3 female (all but one with consent for toppers only on first). Class 9 -> 3 male.
  const mk = async (n: number, classId: string, gender: string, tag: string) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const s = await prisma.student.create({
        data: { institutionId: A.institutionId, classId, studentId: `${tag}-${i}-${A.slug}`, firstName: `${tag}${i}`, lastName: 'Student', gender, phone: '01999999999', status: 'ACTIVE' },
      });
      out.push(s.id);
    }
    return out;
  };
  const male8 = await mk(6, c8.id, 'Male', 'M8');
  await mk(3, c8.id, 'Female', 'F8');
  const male9 = await mk(3, c9.id, 'Male', 'M9');
  ids.consent = male8[0];

  // Exam (published, finished) with a result for every student above
  const exam = await prisma.exam.create({
    data: { institutionId: A.institutionId, name: 'Final', startDate: new Date('2025-01-01'), endDate: new Date('2025-01-10'), isPublished: true },
  });
  ids.exam = exam.id;
  for (const sid of [...male8, ...male9]) {
    await prisma.examResult.create({ data: { institutionId: A.institutionId, examId: exam.id, studentId: sid, subject: 'Math', marksObtained: 90, maxMarks: 100 } });
  }
  const unpublished = await prisma.exam.create({
    data: { institutionId: A.institutionId, name: 'Draft exam', startDate: new Date('2025-02-01'), endDate: new Date('2025-02-10'), isPublished: false },
  });
  await prisma.examResult.create({ data: { institutionId: A.institutionId, examId: unpublished.id, studentId: male8[1], subject: 'Math', marksObtained: 50, maxMarks: 100 } });

  // Notices
  const n = (institutionId: string, title: string, extra: object = {}) =>
    prisma.notice.create({ data: { institutionId, title, content: `<p>${title} body</p>`, audience: 'ALL', publishedAt: new Date('2025-01-01'), ...extra } });
  await n(A.institutionId, 'Public A');
  await n(A.institutionId, 'Class only A', { classId: c8.id });
  await n(B.institutionId, 'Public B');

  // Albums / committee
  await prisma.siteAlbum.create({ data: { siteId: siteA.id, institutionId: A.institutionId, title: 'Sports', status: 'PUBLISHED', photos: { create: [{ url: 'https://x/1.jpg', caption: 'one' }] } } });
  await prisma.siteAlbum.create({ data: { siteId: siteA.id, institutionId: A.institutionId, title: 'Draft album', status: 'DRAFT' } });
  await prisma.siteAlbum.create({ data: { siteId: siteB.id, institutionId: B.institutionId, title: 'B album', status: 'PUBLISHED' } });
  await prisma.siteCommitteeMember.create({ data: { siteId: siteA.id, institutionId: A.institutionId, name: 'Chair', role: 'Chairman', phone: '01800000000', showPhone: false } });
  await prisma.siteCommitteeMember.create({ data: { siteId: siteA.id, institutionId: A.institutionId, name: 'Vice', role: 'Vice Chair', phone: '01800000001', showPhone: true } });
});

afterAll(async () => {
  for (const f of [A, B]) {
    if (!f) continue;
    const institutionId = f.institutionId;
    await prisma.examResult.deleteMany({ where: { institutionId } }).catch(() => undefined);
    await prisma.exam.deleteMany({ where: { institutionId } }).catch(() => undefined);
    await prisma.timetableSlot.deleteMany({ where: { institutionId } }).catch(() => undefined);
    await prisma.subject.deleteMany({ where: { institutionId } }).catch(() => undefined);
    await prisma.section.deleteMany({ where: { class: { branch: { institutionId } } } }).catch(() => undefined);
    await prisma.teacher.deleteMany({ where: { user: { institutionId } } }).catch(() => undefined);
    await prisma.staffProfile.deleteMany({ where: { institutionId } }).catch(() => undefined);
    await prisma.site.deleteMany({ where: { institutionId } }).catch(() => undefined);
    await cleanupInstitution(f);
  }
  await disconnectFixtures();
});

const list = (siteId: string, key: string, query: Record<string, unknown> = {}, preview?: string) => collections.listItems(siteId, key, query, preview);

describe('no student collection', () => {
  it('cannot be requested at all', async () => {
    for (const key of ['students', 'guardians', 'users']) {
      await expect(list(siteA.id, key)).rejects.toBeInstanceOf(NotFoundError);
      await expect(collections.getItem(siteA.id, key, 'x', {})).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it('exposes no student identity anywhere in the classes or exams output', async () => {
    const classes = await list(siteA.id, 'classes', { include: 'sections,subjects,routine,classTeacher,teachers' });
    const exams = await list(siteA.id, 'exams', { include: 'classSummaries' });
    const blob = JSON.stringify([classes, exams]);
    expect(blob).not.toMatch(/M8\d|F8\d|M9\d|01999999999|Student/);
  });
});

describe('teachers collection', () => {
  it('lists only opted-in teachers with public-safe fields', async () => {
    const r = await list(siteA.id, 'teachers');
    expect(r.total).toBe(1);
    const t = r.items[0];
    expect(Object.keys(t).sort()).toEqual(['classNames', 'department', 'designation', 'name', 'photoUrl', 'qualification', 'slug', 'subject']);
    expect(t.name).toBe('Rahim Uddin');
    expect(JSON.stringify(t)).not.toMatch(/8801711111111|SECRET STREET|1980|@test\.local/);
    expect(t.classNames).toEqual(['Class 8 A']);
  });

  it('generates and persists a stable opaque slug', async () => {
    const first = (await list(siteA.id, 'teachers')).items[0].slug as string;
    expect(first).toMatch(/^rahim-uddin-[a-z0-9]{6}$/);
    const again = (await list(siteA.id, 'teachers')).items[0].slug;
    expect(again).toBe(first);
    const row = await prisma.user.findUnique({ where: { id: ids.t1User }, select: { publicSlug: true } });
    expect(row?.publicSlug).toBe(first);
    const one = await collections.getItem(siteA.id, 'teachers', first, {});
    expect(one.item.name).toBe('Rahim Uddin');
    expect(one.seo.title).toBe('Rahim Uddin');
  });

  it('filters, sorts and searches via the whitelist', async () => {
    expect((await list(siteA.id, 'teachers', { filter: { department: { eq: 'science' } } })).total).toBe(1);
    expect((await list(siteA.id, 'teachers', { filter: { department: { eq: 'Arts' } } })).total).toBe(0);
    expect((await list(siteA.id, 'teachers', { q: 'physics' })).total).toBe(1);
    expect((await list(siteA.id, 'teachers', { q: 'chemistry' })).total).toBe(0);
    expect((await list(siteA.id, 'teachers', { sort: '-name' })).total).toBe(1);
  });

  it('rejects a bad query with 400 before touching data', async () => {
    await expect(list(siteA.id, 'teachers', { filter: { phone: { eq: '1' } } })).rejects.toBeInstanceOf(BadRequestError);
    await expect(list(siteA.id, 'teachers', { pageSize: '51' })).rejects.toBeInstanceOf(BadRequestError);
  });

  it('includes classes and subjects as cards', async () => {
    const r = await list(siteA.id, 'teachers', { include: 'classes,subjects' });
    const t = r.items[0] as { classes: { name: string; slug: string }[]; subjects: { name: string }[] };
    expect(t.classes.map((c) => c.name)).toEqual(['Class 8']);
    expect(t.classes[0].slug).toMatch(/^class-8-[a-z0-9]{6}$/);
    expect(t.subjects.map((s) => s.name)).toEqual(['Physics']);
  });

  it('turning showOnWebsite on through the admin API generates the slug', async () => {
    expect((await prisma.user.findUnique({ where: { id: ids.t2User }, select: { publicSlug: true } }))?.publicSlug).toBeNull();
    await portal.setStaffVisibility(ctxA, { userIds: [ids.t2User], showOnWebsite: true });
    expect((await prisma.user.findUnique({ where: { id: ids.t2User }, select: { publicSlug: true } }))?.publicSlug).toMatch(/^hidden-teacher-[a-z0-9]{6}$/);
    expect((await list(siteA.id, 'teachers')).total).toBe(2);
    await portal.setStaffVisibility(ctxA, { userIds: [ids.t2User], showOnWebsite: false });
    expect((await list(siteA.id, 'teachers')).total).toBe(1);
  });
});

describe('tenant isolation', () => {
  it('site B sees only its own teacher, never A', async () => {
    const b = await list(siteB.id, 'teachers');
    expect(b.items.map((i) => i.name)).toEqual(['Other School']);
    const aSlug = (await list(siteA.id, 'teachers')).items[0].slug as string;
    await expect(collections.getItem(siteB.id, 'teachers', aSlug, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('classes, notices, albums and committee are per tenant', async () => {
    expect((await list(siteB.id, 'classes')).items.map((c) => c.name)).toEqual(['Class 8']);
    expect((await list(siteB.id, 'classes')).total).toBe(1);
    expect((await list(siteA.id, 'classes')).total).toBe(2);
    expect((await list(siteB.id, 'notices')).items.map((n) => n.title)).toEqual(['Public B']);
    expect((await list(siteB.id, 'albums')).items.map((n) => n.title)).toEqual(['B album']);
    expect((await list(siteB.id, 'committee')).total).toBe(0);
    const aClass = (await list(siteA.id, 'classes')).items[0].slug as string;
    await expect(collections.getItem(siteB.id, 'classes', aClass, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a slug or id from another tenant is never an item', async () => {
    const aAlbum = (await list(siteA.id, 'albums')).items[0].slug as string;
    await expect(collections.getItem(siteB.id, 'albums', aAlbum, {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('classes (suppression, routine opt-in)', () => {
  it('suppresses small gender cells and the derivable total', async () => {
    const r = await list(siteA.id, 'classes', { sort: 'level' });
    const c8 = r.items.find((c) => c.name === 'Class 8')!;
    const c9 = r.items.find((c) => c.name === 'Class 9')!;
    expect(c8).toMatchObject({ maleCount: 6, femaleCount: null, otherCount: 0, studentCount: null });
    expect(c9).toMatchObject({ maleCount: null, femaleCount: 0, otherCount: 0, studentCount: null });
  });

  it('routine, class teachers and teachers only name opted-in teachers', async () => {
    const slug = (await list(siteA.id, 'classes', { filter: { name: { eq: 'Class 8' } } })).items[0].slug as string;
    const { item } = await collections.getItem(siteA.id, 'classes', slug, { include: 'sections,subjects,routine,classTeacher,teachers' });
    const routine = item.routine as { subject: string; teacherName: string | null }[];
    expect(routine.map((r) => [r.subject, r.teacherName])).toEqual([['Physics', 'Rahim Uddin'], ['Math', null]]);
    expect((item.classTeacher as { name: string }[]).map((t) => t.name)).toEqual(['Rahim Uddin']);
    expect((item.teachers as { name: string }[]).map((t) => t.name)).toEqual(['Rahim Uddin']);
    expect((item.sections as { name: string; classTeacher: { name: string } | null }[]).map((s) => [s.name, s.classTeacher?.name ?? null])).toEqual([['A', 'Rahim Uddin'], ['B', null]]);
    expect(JSON.stringify(item)).not.toMatch(/Hidden/);
  });

  it('existing data/routine no longer leaks a hidden teacher name', async () => {
    const r = await data.routine(siteA.id, { class: 'Class 8' });
    const byTeacher = r.slots.map((s) => [s.subject, s.teacherName]);
    expect(byTeacher).toEqual([['Physics', 'Rahim Uddin'], ['Math', null]]);
  });
});

describe('exams (aggregates only)', () => {
  it('lists published exams only and suppresses small classes', async () => {
    const r = await list(siteA.id, 'exams', { include: 'classSummaries' });
    expect(r.items.map((e) => e.name)).toEqual(['Final']);
    const sums = r.items[0].classSummaries as { className: string; appeared: number | null; suppressed: boolean; passRate: number | null }[];
    const c8 = sums.find((s) => s.className === 'Class 8')!;
    const c9 = sums.find((s) => s.className === 'Class 9')!;
    expect(c8).toMatchObject({ appeared: 6, suppressed: false });
    expect(c9).toMatchObject({ appeared: null, suppressed: true, passRate: null });
  });

  it('is gated by the results settings', async () => {
    await prisma.site.update({ where: { id: siteB.id }, data: { settings: { siteName: 'B' } } });
    await expect(list(siteB.id, 'exams')).rejects.toBeInstanceOf(ForbiddenError);
    const schema = await collections.schema(siteB.id);
    const e = schema.collections.find((c) => c.key === 'exams')!;
    expect(e.available).toBe(false);
    expect(e.unavailableReason).toBeTruthy();
    expect(schema.collections.find((c) => c.key === 'courses')!.available).toBe(false);
  });
});

describe('toppers need guardian consent (W7)', () => {
  it('lists nobody without publicConsent, and only consenting students with it', async () => {
    const none = await data.toppers(siteA.id, { limit: 10, examId: ids.exam });
    expect(none.items).toEqual([]);
    await prisma.student.update({ where: { id: ids.consent }, data: { publicConsent: true } });
    const one = await data.toppers(siteA.id, { limit: 10, examId: ids.exam });
    expect(one.items).toHaveLength(1);
    expect(one.items[0].name).toBe('M80 S.');
  });
});

describe('publish and preview rules', () => {
  it('hides draft site content and notices addressed to a class', async () => {
    expect((await list(siteA.id, 'albums')).items.map((a) => a.title)).toEqual(['Sports']);
    expect((await list(siteA.id, 'notices')).items.map((n) => n.title)).toEqual(['Public A']);
  });

  it('shows drafts with a valid preview token and not with a bad one', async () => {
    const token = signPreviewToken(siteA.id, A.usersByRole.ADMIN.userId);
    const r = await list(siteA.id, 'albums', {}, token);
    expect(r.preview).toBe(true);
    expect(r.items.map((a) => a.title).sort()).toEqual(['Draft album', 'Sports']);
    expect((await list(siteA.id, 'albums', {}, 'bogus')).items).toHaveLength(1);
  });

  it('404s an unpublished site without a preview token', async () => {
    await prisma.site.update({ where: { id: siteB.id }, data: { status: 'DRAFT' } });
    await expect(list(siteB.id, 'teachers')).rejects.toBeInstanceOf(NotFoundError);
    await prisma.site.update({ where: { id: siteB.id }, data: { status: 'PUBLISHED' } });
  });

  it('includes photos for albums and withholds committee phones unless shown', async () => {
    const albums = await list(siteA.id, 'albums', { include: 'photos' });
    expect(albums.items[0].photos).toEqual([{ url: 'https://x/1.jpg', caption: 'one' }]);
    const members = await list(siteA.id, 'committee', { sort: 'name' });
    expect(members.items.map((m) => [m.name, m.phone])).toEqual([['Chair', null], ['Vice', '01800000001']]);
  });

  it('paginates with meta-ready totals', async () => {
    const r = await list(siteA.id, 'classes', { pageSize: '1', page: '2', sort: 'level' });
    expect(r.items).toHaveLength(1);
    expect(r).toMatchObject({ total: 2, page: 2, pageSize: 1 });
  });
});

describe('template pages (W5)', () => {
  it('creates, validates and exposes TEMPLATE pages', async () => {
    await expect(sitesSvc.createPage(ctxA, { kind: 'TEMPLATE', collectionKey: 'students', title: 'x' } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(sitesSvc.createPage(ctxA, { kind: 'TEMPLATE', collectionKey: 'holidays', title: 'x' } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(sitesSvc.createPage(ctxA, { kind: 'PAGE', slug: 'template-oops', title: 'x' } as never)).rejects.toBeInstanceOf(ValidationError);

    const page = await sitesSvc.createPage(ctxA, { kind: 'TEMPLATE', collectionKey: 'teachers', title: 'Teacher profile' } as never);
    expect(page).toMatchObject({ kind: 'TEMPLATE', collectionKey: 'teachers', slug: 'template-teachers' });
    await expect(sitesSvc.createPage(ctxA, { kind: 'TEMPLATE', collectionKey: 'teachers', title: 'again', slug: 'other' } as never)).rejects.toBeInstanceOf(ConflictError);

    const listed = await sitesSvc.listPages(ctxA, { page: 1, pageSize: 100 });
    expect(listed.items.find((p) => p.slug === 'template-teachers')).toMatchObject({ kind: 'TEMPLATE', collectionKey: 'teachers' });
    ids.tplPage = page.id;
  });

  it('is invisible until published, then appears in resolve (and not in pages)', async () => {
    const before = await publicSvc.resolveSite({ slug: siteA.subdomain });
    expect(before.templateRoutes).toEqual([]);
    await sitesSvc.publishPage(ctxA, ids.tplPage);
    const after = await publicSvc.resolveSite({ slug: siteA.subdomain });
    expect(after.templateRoutes).toEqual([{ collection: 'teachers', base: '/teachers', pageSlug: 'template-teachers' }]);
    expect(after.pages.map((p) => p.slug)).not.toContain('template-teachers');
    const pub = await publicSvc.getPublicPage(siteA.id, 'template-teachers');
    expect(pub.page).toMatchObject({ kind: 'TEMPLATE', collectionKey: 'teachers' });
  });

  it('lists every item URL in the sitemap once a template is published', async () => {
    const slug = (await list(siteA.id, 'teachers')).items[0].slug as string;
    const xml = await publicSvc.sitemap(siteA.id);
    expect(xml).toContain(`/teachers/${slug}</loc>`);
    expect(xml).not.toContain('template-teachers');
    const other = await publicSvc.sitemap(siteB.id);
    expect(other).not.toContain(`/teachers/${slug}`);
    expect(other).not.toContain('/teachers/');
  });

  it('cannot change a page kind or move a PAGE onto a collection', async () => {
    const plain = await sitesSvc.createPage(ctxA, { kind: 'PAGE', slug: 'about-us', title: 'About' } as never);
    expect(plain).toMatchObject({ kind: 'PAGE', collectionKey: null });
    await expect(sitesSvc.updatePage(ctxA, plain.id, { collectionKey: 'teachers' } as never)).rejects.toBeInstanceOf(ValidationError);
  });
});
