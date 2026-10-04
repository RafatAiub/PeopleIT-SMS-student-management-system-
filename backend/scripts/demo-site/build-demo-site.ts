/* eslint-disable no-console */
/**
 * Demo school website — "Dhaka City School" (ঢাকা সিটি স্কুল), built with the
 * school's own website builder. LOCAL PREVIEW ENVIRONMENT ONLY.
 *
 * Everything goes through the same admin HTTP API the builder UI calls
 * (/api/v1/sites/*, /notices, /events, /hr/staff, /users, /institution/website).
 * It never loads backend/.env, never opens Prisma and refuses non-localhost APIs.
 *
 * Re-runnable: apply-template (replace) rebuilds the template pages; every other
 * record is matched by its title/name and updated instead of duplicated.
 *
 * Run (from backend/):
 *   npx ts-node --transpile-only scripts/demo-site/build-demo-site.ts
 * Optional env:
 *   DEMO_API=http://localhost:3001/api/v1   DEMO_FRONTEND=http://localhost:5173
 *   DEMO_EMAIL=...  DEMO_PASSWORD=...        DEMO_SKIP_VERIFY=1
 *
 * All people, numbers and documents below are SAMPLE data for testing.
 */
import path from 'path';
import { createRequire } from 'module';

const API = (process.env.DEMO_API ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const FRONTEND = (process.env.DEMO_FRONTEND ?? 'http://localhost:5173').replace(/\/+$/, '');
const EMAIL = process.env.DEMO_EMAIL ?? 'habiburdeveloper7@gmail.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Habib@Local2026';
const REPO = path.resolve(__dirname, '..', '..', '..');
const FE = path.join(REPO, 'frontend');

for (const u of [API, FRONTEND]) {
  const host = new URL(u).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`Refusing to run against ${u}: this script is for the local preview environment only.`);
    process.exit(1);
  }
}

/* ── tiny API client ─────────────────────────────────────────────────────── */

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let token = '';
const calls = { ok: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, p: string, body?: unknown, opts: { auth?: boolean; raw?: boolean } = {}): Promise<J> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(API + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(opts.auth !== false && token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The API allows ~100 requests a minute per IP; wait for the window to reset and retry.
    if (res.status !== 429 || attempt >= 4) break;
    const wait = Number(res.headers.get('ratelimit-reset') ?? res.headers.get('retry-after')) || 60;
    console.log(`  (rate limited — waiting ${wait + 1}s)`);
    await res.text();
    await sleep((wait + 1) * 1000);
  }
  const text = await res.text();
  let json: J;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (opts.raw) return { status: res.status, json, text };
  if (!res.ok) {
    const detail = json?.errors ? ` ${JSON.stringify(json.errors).slice(0, 600)}` : '';
    throw new Error(`${method} ${p} -> ${res.status}: ${String(json?.message ?? text).slice(0, 400)}${detail}`);
  }
  calls.ok++;
  return json;
}
const list = (j: J): J[] => (Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.items) ? j.data.items : []);
const step = (s: string) => console.log(`\n=== ${s}`);

/* ── templates from the frontend (bundled in memory with esbuild) ────────── */

interface Block { type: string; props: Record<string, J> }

function loadFrontendTemplates() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const esbuild = require('esbuild');
  const entry = [
    "export { banglaPortal } from './bangla-portal';",
    "export { defaultTemplatePage } from './collectionDefaults';",
    "export { pageBuilder } from './builders';",
  ].join('\n');
  // Bundled from stdin (nothing is written into src/). templates/index.ts is avoided
  // on purpose: it pulls the Thumbnail component and the axios client chain.
  const out = esbuild.buildSync({
    stdin: { contents: entry, resolveDir: path.join(FE, 'src', 'site', 'templates'), loader: 'ts', sourcefile: 'demo-entry.ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'error',
    tsconfig: path.join(FE, 'tsconfig.json'), jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'empty', '.woff': 'empty' },
    define: { 'import.meta.env': '{"MODE":"production","PROD":true,"DEV":false}' },
  });
  const mod = { exports: {} as J };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, createRequire(path.join(FE, 'package.json')));
  return mod.exports as {
    banglaPortal: J;
    defaultTemplatePage: (key: string) => { collectionKey: string; title: string; titleBn: string; data: J; seo: J } | null;
    pageBuilder: (prefix: string) => (type: string, props?: Record<string, unknown>) => Block;
  };
}

/** Visits every block in a Puck tree, including slot arrays nested in props. */
function walk(blocks: Block[] | undefined, fn: (b: Block) => void) {
  for (const b of blocks ?? []) {
    if (!b || typeof b !== 'object' || typeof b.type !== 'string') continue;
    fn(b);
    for (const v of Object.values(b.props ?? {})) {
      if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && typeof x.type === 'string' && x.props)) walk(v as Block[], fn);
    }
  }
}

/* ── sample data ─────────────────────────────────────────────────────────── */

const PDF_A = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const PDF_B = 'https://pdfobject.com/pdf/sample.pdf';
const pic = (seed: string, w = 1200, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
const face = (g: 'men' | 'women', n: number) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
const LOGO = 'https://placehold.co/256x256/6d28d9/ffffff/png?text=DCS';
const FAVICON = 'https://placehold.co/64x64/6d28d9/ffffff/png?text=D';

/** Opted-in staff. Departments drive the "Our Teachers" filter chips. */
const STAFF: Array<{ id: string; teacher: boolean; designation: string; department: string; subject?: string; qualification?: string; photo: string }> = [
  { id: 'user-teacher-1-102030', teacher: true, designation: 'Head Teacher', department: 'Science', subject: 'Mathematics', qualification: 'M.Sc. in Mathematics (University of Dhaka), B.Ed. — sample', photo: face('men', 46) },
  { id: 'user-teacher-2-102030', teacher: true, designation: 'Senior Teacher', department: 'Science', subject: 'Physics', qualification: 'M.Sc. in Physics, B.Ed. — sample', photo: face('women', 44) },
  { id: 'user-teacher-3-102030', teacher: true, designation: 'Assistant Teacher', department: 'Commerce', subject: 'Accounting', qualification: 'M.Com in Accounting — sample', photo: face('men', 32) },
  { id: 'user-teacher-4-102030', teacher: true, designation: 'Senior Teacher', department: 'Humanities', subject: 'Bangla', qualification: 'M.A. in Bangla, B.Ed. — sample', photo: face('women', 65) },
  { id: 'user-teacher-5-102030', teacher: true, designation: 'Assistant Teacher', department: 'Primary', subject: 'English', qualification: 'B.A. (Hons) in English — sample', photo: face('men', 75) },
  { id: 'cmus5hf7n0001p3zfuxgf8zhq', teacher: false, designation: 'Office Administrator', department: 'Administration', photo: face('men', 11) },
];
/** Seeded QA accounts ("Test …") stay off the public site. */
const KEEP_HIDDEN_NAME = /^test\b/i;

const DEPARTMENTS: Array<[en: string, bn: string]> = [['Science', 'বিজ্ঞান'], ['Humanities', 'মানবিক'], ['Commerce', 'ব্যবসায় শিক্ষা'], ['Primary', 'প্রাথমিক']];

const COMMITTEE = [
  { name: 'Alhaj Md. Mofizur Rahman', nameBn: 'আলহাজ্ব মোঃ মফিজুর রহমান', role: 'President', roleBn: 'সভাপতি', photo: face('men', 85), phone: '01700-000101', showPhone: true },
  { name: 'Begum Rokeya Sultana', nameBn: 'বেগম রোকেয়া সুলতানা', role: 'Donor member', roleBn: 'দাতা সদস্য', photo: face('women', 79) },
  { name: 'Md. Jahangir Alam', nameBn: 'মোঃ জাহাঙ্গীর আলম', role: 'Guardian representative', roleBn: 'অভিভাবক প্রতিনিধি', photo: face('men', 52) },
  { name: 'Shahnaz Parvin', nameBn: 'শাহনাজ পারভীন', role: 'Guardian representative (female)', roleBn: 'সংরক্ষিত মহিলা অভিভাবক প্রতিনিধি', photo: face('women', 33) },
  { name: 'Farhana Yasmin', nameBn: 'ফারহানা ইয়াসমিন', role: 'Teacher representative', roleBn: 'শিক্ষক প্রতিনিধি', photo: face('women', 44) },
  { name: 'Kamrul Hasan', nameBn: 'কামরুল হাসান', role: 'Teacher representative', roleBn: 'শিক্ষক প্রতিনিধি', photo: face('men', 32) },
  { name: 'Abdur Rahman', nameBn: 'আব্দুর রহমান', role: 'Member secretary (Head Teacher)', roleBn: 'সদস্য সচিব (প্রধান শিক্ষক)', photo: face('men', 46), phone: '01700-000102', showPhone: true },
];

const ALBUMS = [
  {
    title: 'Annual Sports Day 2026', titleBn: 'বার্ষিক ক্রীড়া প্রতিযোগিতা ২০২৬', seed: 'dcs-sports', eventDate: '2026-02-12',
    description: 'Track events, march-past and prize giving on the school field. (Sample album)',
    captions: ['March-past', 'Opening ceremony', '100 m sprint', 'Relay race', 'Long jump', 'Tug of war', 'Prize giving', 'Team photo'],
  },
  {
    title: 'Victory Day Celebration', titleBn: 'মহান বিজয় দিবস উদযাপন', seed: 'dcs-victory', eventDate: '2025-12-16',
    description: 'Flag hoisting, wreath laying, cultural programme and art competition. (Sample album)',
    captions: ['Flag hoisting', 'Wreath laying', 'Parade', 'Cultural programme', 'Art competition', 'Discussion meeting', 'Prize giving'],
  },
  {
    title: 'Science Fair 2026', titleBn: 'বিজ্ঞান মেলা ২০২৬', seed: 'dcs-science', eventDate: '2026-08-20',
    description: 'Projects by students of classes 6–10, judged by guests from local colleges. (Sample album)',
    captions: ['Opening', 'Robotics project', 'Solar model', 'Chemistry corner', 'Judges visit', 'Award winners'],
  },
];

const DOWNLOADS = [
  { title: 'Syllabus 2026 — Classes 6 to 8', titleBn: 'সিলেবাস ২০২৬ — ৬ষ্ঠ থেকে ৮ম শ্রেণি', category: 'syllabus', fileUrl: PDF_A, publishedAt: '2026-01-05' },
  { title: 'Syllabus 2026 — Classes 9 and 10', titleBn: 'সিলেবাস ২০২৬ — ৯ম ও ১০ম শ্রেণি', category: 'syllabus', fileUrl: PDF_B, publishedAt: '2026-01-05' },
  { title: 'Class routine 2026', titleBn: 'ক্লাস রুটিন ২০২৬', category: 'routine', fileUrl: PDF_A, publishedAt: '2026-01-10' },
  { title: 'Annual exam routine 2026', titleBn: 'বার্ষিক পরীক্ষার রুটিন ২০২৬', category: 'routine', fileUrl: PDF_B, publishedAt: '2026-10-01' },
  { title: 'Admission form 2027', titleBn: 'ভর্তি ফরম ২০২৭', category: 'admission', fileUrl: PDF_A, publishedAt: '2026-09-20' },
  { title: 'Academic calendar 2026', titleBn: 'একাডেমিক ক্যালেন্ডার ২০২৬', category: 'calendar', fileUrl: PDF_B, publishedAt: '2026-01-02' },
];

const NOTICES = [
  { title: 'বার্ষিক পরীক্ষা ২০২৬-এর সময়সূচি প্রকাশ', date: '2026-10-01', en: 'The annual examination 2026 will begin on 25 November. The full routine is on the Downloads page.', bn: 'আগামী ২৫ নভেম্বর থেকে বার্ষিক পরীক্ষা ২০২৬ শুরু হবে। বিস্তারিত রুটিন ডাউনলোড পাতায় পাওয়া যাবে।' },
  { title: 'শারদীয় দুর্গাপূজা উপলক্ষে ছুটির বিজ্ঞপ্তি', date: '2026-09-29', en: 'The school will remain closed from 18 to 23 October for Durga Puja. Classes resume on 25 October.', bn: 'শারদীয় দুর্গাপূজা উপলক্ষে ১৮ থেকে ২৩ অক্টোবর বিদ্যালয় বন্ধ থাকবে। ২৫ অক্টোবর থেকে যথারীতি ক্লাস চলবে।' },
  { title: 'অভিভাবক সমাবেশ — ১৫ অক্টোবর', date: '2026-09-25', en: 'All guardians are invited to the parents’ meeting on 15 October at 10:00 am in the school auditorium.', bn: 'আগামী ১৫ অক্টোবর সকাল ১০টায় বিদ্যালয় মিলনায়তনে অভিভাবক সমাবেশে সকল অভিভাবককে আমন্ত্রণ জানানো যাচ্ছে।' },
  { title: 'ভর্তি বিজ্ঞপ্তি ২০২৭ (১ম, ৬ষ্ঠ ও ৯ম শ্রেণি)', date: '2026-09-20', en: 'Applications for admission in 2027 are open until 30 November. See the Admission page for details.', bn: '২০২৭ শিক্ষাবর্ষে ভর্তির আবেদন ৩০ নভেম্বর পর্যন্ত গ্রহণ করা হবে। বিস্তারিত ভর্তি পাতায় দেখুন।' },
  { title: 'বিজ্ঞান মেলায় অংশগ্রহণের আহ্বান', date: '2026-09-15', en: 'Students of classes 6 to 10 may register their science projects with the science department by 10 October.', bn: '৬ষ্ঠ থেকে ১০ম শ্রেণির শিক্ষার্থীরা ১০ অক্টোবরের মধ্যে বিজ্ঞান বিভাগে প্রকল্প নিবন্ধন করতে পারবে।' },
  { title: 'মাসিক বেতন পরিশোধের শেষ তারিখ', date: '2026-09-10', en: 'Tuition fees for September must be paid by 20 September. Online payment is available.', bn: 'সেপ্টেম্বর মাসের বেতন ২০ সেপ্টেম্বরের মধ্যে পরিশোধ করতে হবে। অনলাইনে পরিশোধের সুবিধা রয়েছে।' },
  { title: 'ডেঙ্গু প্রতিরোধে সচেতনতা কার্যক্রম', date: '2026-09-05', en: 'A dengue awareness session and campus clean-up will be held on 8 September. All students should attend.', bn: '৮ সেপ্টেম্বর ডেঙ্গু সচেতনতা সভা ও ক্যাম্পাস পরিচ্ছন্নতা কার্যক্রম অনুষ্ঠিত হবে। সকল শিক্ষার্থীর উপস্থিতি কাম্য।' },
];

const EVENTS = [
  { title: 'অভিভাবক সমাবেশ (Parents’ meeting)', category: 'MEETING', startDate: '2026-10-15', startTime: '10:00', endTime: '12:00', venue: 'School auditorium', description: 'Meeting with guardians about the annual examination and student progress. (Sample event)' },
  { title: 'বিজ্ঞান মেলা (Science fair)', category: 'COMPETITION', startDate: '2026-10-28', startTime: '09:00', endTime: '15:00', venue: 'Science building', description: 'Projects and models by students of classes 6–10. Guardians are welcome. (Sample event)' },
  { title: 'বার্ষিক ক্রীড়া প্রতিযোগিতা (Annual sports day)', category: 'SPORTS', startDate: '2026-11-12', startTime: '08:30', endTime: '16:00', venue: 'School playground', description: 'Athletics, games and prize giving. (Sample event)' },
  { title: 'বার্ষিক পরীক্ষা ২০২৬ (Annual examination)', category: 'EXAM', type: 'MULTIPLE', startDate: '2026-11-25', endDate: '2026-12-08', venue: 'Classrooms', description: 'Annual examination for all classes. See the exam routine. (Sample event)' },
  { title: 'মহান বিজয় দিবস (Victory Day)', category: 'CELEBRATION', startDate: '2026-12-16', startTime: '08:00', endTime: '12:00', venue: 'School field', description: 'Flag hoisting, parade and cultural programme. (Sample event)' },
];

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  const t0 = Date.now();
  step('Log in');
  const login = await api('POST', '/auth/login', { identifier: EMAIL, password: PASSWORD }, { auth: false });
  token = login.data?.tokens?.accessToken;
  if (!token) throw new Error('Login did not return an access token');
  const me0 = (await api('GET', '/sites/me')).data;
  const siteId: string = me0.site.id;
  const subdomain: string = me0.site.subdomain;
  console.log(`site ${siteId} (subdomain ${subdomain}), was template "${me0.site.templateKey}"`);

  step('Bundle the bangla-portal template from frontend/src/site/templates');
  const fe = loadFrontendTemplates();
  const tpl = fe.banglaPortal;
  const pages: J[] = JSON.parse(JSON.stringify(tpl.pages));
  customiseTemplatePages(pages);
  console.log(`template pages: ${pages.map((p) => p.slug || '(home)').join(', ')}`);

  step('1. Apply template (mode replace)');
  const applied = await api('POST', '/sites/me/apply-template', {
    templateKey: tpl.key, mode: 'replace',
    pages: pages.map((p) => ({ slug: p.slug, title: p.title, titleBn: p.titleBn, seo: p.seo, data: p.data })),
    theme: tpl.theme, navigation: tpl.navigation,
  });
  console.log('apply-template:', JSON.stringify(applied.data?.summary ?? applied.data ?? {}).slice(0, 200));

  step('2. School profile');
  await api('PUT', '/institution/website', {
    aboutText:
      'ঢাকা সিটি স্কুল ১৯৮৫ সালে মিরপুর, ঢাকায় প্রতিষ্ঠিত একটি সহশিক্ষা মাধ্যমিক বিদ্যালয়। প্রাক-প্রাথমিক থেকে দশম শ্রেণি পর্যন্ত বাংলা মাধ্যমে পাঠদান করা হয়। ' +
      'Dhaka City School is a co-educational secondary school in Mirpur, Dhaka, founded in 1985. It teaches from pre-primary to class 10 in Bangla medium. (Sample text)',
  });
  await api('PUT', '/sites/profile', {
    nameBn: 'ঢাকা সিটি স্কুল',
    eiin: '102030',
    establishedYear: 1985,
    mpoInfo: 'নমুনা তথ্য: প্রতিষ্ঠানটি ০১/০৫/১৯৯২ তারিখ থেকে এমপিওভুক্ত। এমপিও কোড: ৫৫০১০২০৩০। Sample: MPO-listed since 1 May 1992, MPO code 550102030.',
    recognitionInfo:
      'নমুনা তথ্য: পাঠদানের অনুমতি — নিম্ন মাধ্যমিক ১৯৮৫, মাধ্যমিক ১৯৮৮। একাডেমিক স্বীকৃতি — মাধ্যমিক ও উচ্চ মাধ্যমিক শিক্ষা বোর্ড, ঢাকা; স্মারক নং ঢাশিবো/স্বী/১২৩৪/৮৮। ' +
      'Sample: teaching permission 1985 (lower secondary) and 1988 (secondary); recognised by the Board of Intermediate and Secondary Education, Dhaka.',
    headOfInstitution: { userId: 'user-teacher-1-102030', designation: 'প্রধান শিক্ষক (Head Teacher)' },
    informationOfficer: { name: 'মোঃ সাইফুল ইসলাম (নমুনা) — Md. Saiful Islam (sample)', designation: 'Assistant Head Teacher & Information Officer', phone: '01700-000001', email: 'info-officer@example.com' },
    complaintsOfficer: { name: 'নাসরিন আক্তার (নমুনা) — Nasrin Akter (sample)', designation: 'Senior Teacher & GRS focal point', phone: '01700-000002', email: 'grs@example.com' },
  });
  console.log('profile saved');

  step('3. Staff: profiles, photos and "Show on website"');
  const hrStaff = list(await api('GET', '/hr/staff?pageSize=100'));
  const staffByUser = new Map<string, J>();
  for (const s of hrStaff) staffByUser.set(s.userId ?? s.user?.id, s);
  for (const s of STAFF) {
    const existing = staffByUser.get(s.id);
    if (existing) await api('PATCH', `/hr/staff/${existing.id}`, { designation: s.designation, department: s.department });
    else await api('POST', '/hr/staff', { userId: s.id, designation: s.designation, department: s.department, baseSalary: 30000, joiningDate: '2015-01-01' });
    await api('PUT', `/users/${s.id}`, s.teacher ? { avatarUrl: s.photo, qualification: s.qualification, subjectExpertise: s.subject } : { avatarUrl: s.photo });
  }
  const vis = list(await api('GET', '/sites/staff-visibility?pageSize=100'));
  const hide = vis.filter((u) => KEEP_HIDDEN_NAME.test(u.name ?? '') && !STAFF.some((s) => s.id === u.id)).map((u) => u.id);
  await api('PUT', '/sites/staff-visibility', { userIds: STAFF.map((s) => s.id), showOnWebsite: true });
  if (hide.length) await api('PUT', '/sites/staff-visibility', { userIds: hide, showOnWebsite: false });
  console.log(`${STAFF.length} staff shown on the website, ${hide.length} test accounts kept hidden`);

  step('4a. Managing committee');
  const committee = list(await api('GET', '/sites/committee?pageSize=100'));
  for (const [i, m] of COMMITTEE.entries()) {
    const body = { name: m.name, nameBn: m.nameBn, role: m.role, roleBn: m.roleBn, photoUrl: m.photo, phone: m.phone ?? null, showPhone: Boolean(m.showPhone), sortOrder: i + 1 };
    const found = committee.find((c) => c.name === m.name && c.role === m.role);
    if (found) await api('PUT', `/sites/committee/${found.id}`, body);
    else await api('POST', '/sites/committee', body);
  }
  console.log(`${COMMITTEE.length} committee members`);

  step('4b. Photo albums');
  const albums = list(await api('GET', '/sites/albums?pageSize=100'));
  for (const [i, a] of ALBUMS.entries()) {
    const body = { title: a.title, titleBn: a.titleBn, coverUrl: pic(`${a.seed}-1`), description: a.description, eventDate: a.eventDate, status: 'PUBLISHED', sortOrder: i + 1 };
    let album = albums.find((x) => x.title === a.title);
    if (album) await api('PUT', `/sites/albums/${album.id}`, body);
    else album = (await api('POST', '/sites/albums', body)).data;
    const detail = (await api('GET', `/sites/albums/${album.id}`)).data;
    const have = new Set((detail.photos ?? []).map((p: J) => p.url));
    for (const [n, caption] of a.captions.entries()) {
      const url = pic(`${a.seed}-${n + 1}`);
      if (!have.has(url)) await api('POST', `/sites/albums/${album.id}/photos`, { url, caption });
    }
  }
  console.log(`${ALBUMS.length} albums, ${ALBUMS.reduce((n, a) => n + a.captions.length, 0)} photos`);

  step('4c. Downloads');
  const downloads = list(await api('GET', '/sites/downloads?pageSize=100'));
  for (const [i, d] of DOWNLOADS.entries()) {
    const body = { ...d, status: 'PUBLISHED', sortOrder: i + 1 };
    const found = downloads.find((x) => x.title === d.title);
    if (found) await api('PUT', `/sites/downloads/${found.id}`, body);
    else await api('POST', '/sites/downloads', body);
  }
  console.log(`${DOWNLOADS.length} downloads`);

  step('4d. Admission circulars');
  const enquiryFormId: string | undefined = me0.site.settings?.defaultEnquiryFormId || undefined;
  const ADMISSIONS = [
    {
      session: '2027', classNames: ['Class 1', 'Class 6', 'Class 9'], title: 'Admission circular 2027 — Class 1, 6 and 9', titleBn: 'ভর্তি বিজ্ঞপ্তি ২০২৭ — ১ম, ৬ষ্ঠ ও ৯ম শ্রেণি',
      body:
        '<p>২০২৭ শিক্ষাবর্ষে ১ম, ৬ষ্ঠ ও ৯ম শ্রেণিতে ভর্তির জন্য আবেদন আহ্বান করা যাচ্ছে।</p><ul><li>আবেদনের সময়: ২০ সেপ্টেম্বর – ৩০ নভেম্বর ২০২৬</li><li>ভর্তি পরীক্ষা: ৫ ডিসেম্বর ২০২৬</li><li>আবেদন ফি: ৫০০ টাকা</li></ul>' +
        '<p>Applications are invited for admission to classes 1, 6 and 9 for the 2027 session. Admission test: 5 December 2026. (Sample circular)</p>',
      startDate: '2026-09-20', endDate: '2026-11-30', fee: 500, pdfUrl: PDF_A, ...(enquiryFormId ? { formId: enquiryFormId } : {}),
    },
    {
      session: '2026', classNames: ['KG', 'Class 1', 'Class 6'], title: 'Admission circular 2026 — KG, Class 1 and 6', titleBn: 'ভর্তি বিজ্ঞপ্তি ২০২৬ — কেজি, ১ম ও ৬ষ্ঠ শ্রেণি',
      body: '<p>২০২৬ শিক্ষাবর্ষের ভর্তি কার্যক্রম সম্পন্ন হয়েছে। The 2026 admission round is closed. (Sample circular)</p>',
      startDate: '2025-11-01', endDate: '2025-12-15', fee: 300, pdfUrl: PDF_B,
    },
  ];
  const admissions = list(await api('GET', '/sites/admissions?pageSize=100'));
  for (const [i, a] of ADMISSIONS.entries()) {
    const body = { ...a, status: 'PUBLISHED', sortOrder: i + 1 };
    const found = admissions.find((x) => x.title === a.title);
    if (found) await api('PUT', `/sites/admissions/${found.id}`, body);
    else await api('POST', '/sites/admissions', body);
  }
  console.log(`${ADMISSIONS.length} admission circulars (one open until 30 Nov 2026)`);

  step('4e. Public notices');
  const notices = list(await api('GET', '/notices?pageSize=100'));
  for (const n of NOTICES) {
    const body = { title: n.title, content: `<p>${n.bn}</p><p>${n.en}</p>`, audience: 'ALL', isActive: true, publishedAt: `${n.date}T09:00:00.000Z` };
    const found = notices.find((x) => x.title === n.title);
    if (found) await api('PUT', `/notices/${found.id}`, body);
    else await api('POST', '/notices', body);
  }
  // A leftover QA notice titled "test" would sit at the top of the public board; hide it (reversible).
  for (const n of notices.filter((x) => x.title === 'test' && x.content === 'test' && x.isActive)) await api('PUT', `/notices/${n.id}`, { isActive: false });
  console.log(`${NOTICES.length} public notices`);

  step('4f. Upcoming events');
  const years = list(await api('GET', '/session-years'));
  const year = years.find((y) => y.isCurrent) ?? years[0];
  if (!year) throw new Error('No academic year found — create one in Settings first');
  const evs: J[] = (await api('GET', '/events?when=all')).data?.events ?? [];
  for (const e of EVENTS) {
    const body = {
      title: e.title, description: e.description, academicYearId: year.id, category: e.category, type: e.type ?? 'SINGLE',
      startDate: e.startDate, ...(e.endDate ? { endDate: e.endDate } : {}), ...(e.startTime ? { startTime: e.startTime, endTime: e.endTime } : {}),
      venue: e.venue, audience: ['STUDENTS', 'GUARDIANS'],
    };
    const found = evs.find((x) => x.title === e.title);
    if (found) await api('PUT', `/events/${found.id}`, body);
    else await api('POST', '/events', { ...body, notify: false });
  }
  console.log(`${EVENTS.length} events (academic year ${year.label})`);

  step('5. Site settings, theme and navigation');
  await api('PUT', '/sites/me', {
    templateKey: tpl.key,
    theme: { ...tpl.theme, layout: 'boxed', headerStyle: 'portal', footerStyle: 'portal', pageBackground: 'dots' },
    settings: {
      siteName: 'Dhaka City School', siteNameBn: 'ঢাকা সিটি স্কুল',
      tagline: 'Knowledge, discipline, humanity — since 1985', taglineBn: 'জ্ঞান, শৃঙ্খলা, মানবিকতা — ১৯৮৫ সাল থেকে',
      logoUrl: LOGO, faviconUrl: FAVICON,
      defaultLanguage: 'bn', languages: ['bn', 'en'],
      establishedYear: 1985,
      social: { facebook: 'https://www.facebook.com/dhakacityschool.demo', youtube: 'https://www.youtube.com/@dhakacityschool-demo' },
      footerText: '© Dhaka City School, Mirpur-10, Dhaka. Demo website — all people and documents are sample data.',
      footerTextBn: '© ঢাকা সিটি স্কুল, মিরপুর-১০, ঢাকা। ডেমো ওয়েবসাইট — সকল ব্যক্তি ও নথি নমুনা তথ্য।',
      topBar: {
        showDate: true, showContact: true, showSocial: true,
        loginLinks: [
          { label: 'Teacher login', labelBn: 'শিক্ষক লগইন', href: `${FRONTEND}/login` },
          { label: 'Student / guardian login', labelBn: 'শিক্ষার্থী / অভিভাবক লগইন', href: `${FRONTEND}/login` },
        ],
      },
      // Both key spellings: the public blocks read `number`/`href`, the admin editor reads `phone`/`url` (see report).
      hotlines: [
        { label: 'National emergency service', labelBn: 'জাতীয় জরুরি সেবা', number: '999', phone: '999' },
        { label: 'Government information', labelBn: 'সরকারি তথ্য সেবা', number: '333', phone: '333' },
        { label: 'Child helpline', labelBn: 'শিশু সহায়তা', number: '1098', phone: '1098' },
        { label: 'Women & children abuse', labelBn: 'নারী ও শিশু নির্যাতন প্রতিরোধ', number: '109', phone: '109' },
        { label: 'Head teacher (sample)', labelBn: 'প্রধান শিক্ষক (নমুনা)', number: '01700-000102', phone: '01700-000102' },
        { label: 'School office (sample)', labelBn: 'অফিস (নমুনা)', number: '01711-234567', phone: '01711-234567' },
      ],
      importantLinks: [
        ['Ministry of Education', 'শিক্ষা মন্ত্রণালয়', 'https://moedu.gov.bd'],
        ['Directorate of Secondary and Higher Education', 'মাধ্যমিক ও উচ্চ শিক্ষা অধিদপ্তর', 'https://dshe.gov.bd'],
        ['Dhaka Education Board', 'ঢাকা শিক্ষা বোর্ড', 'https://dhakaeducationboard.gov.bd'],
        ['National Curriculum and Textbook Board', 'জাতীয় শিক্ষাক্রম ও পাঠ্যপুস্তক বোর্ড', 'https://nctb.gov.bd'],
        ['BANBEIS', 'ব্যানবেইস', 'https://banbeis.gov.bd'],
        ['Bangladesh National Portal', 'বাংলাদেশ জাতীয় তথ্য বাতায়ন', 'https://bangladesh.gov.bd'],
      ].map(([label, labelBn, href]) => ({ label, labelBn, href, url: href })),
      eServices: [
        ['Exam results', 'পরীক্ষার ফলাফল', 'http://www.educationboardresults.gov.bd', 'graduation'],
        ['Teachers’ portal', 'শিক্ষক বাতায়ন', 'https://www.teachers.gov.bd', 'book'],
        ['Muktopaath e-learning', 'মুক্তপাঠ', 'https://muktopaath.gov.bd', 'computer'],
        ['Online fee payment', 'অনলাইনে বেতন পরিশোধ', `${FRONTEND}/login`, 'wallet'],
      ].map(([label, labelBn, href, icon]) => ({ label, labelBn, href, url: href, icon })),
      publicResultSummary: true,
      publicFeeChart: true,
      publicLibrary: true,
    },
    navigation: { header: HEADER_NAV, footer: FOOTER_NAV },
  });
  console.log('settings, theme and navigation saved');

  step('6. Template (profile) pages + listing pages');
  const allPages = async () => list(await api('GET', '/sites/pages?pageSize=100'));
  let existing = await allPages();
  for (const key of ['teachers', 'notices', 'events', 'albums', 'classes', 'admissions']) {
    const d = fe.defaultTemplatePage(key);
    if (!d) throw new Error(`No default template page for ${key}`);
    const found = existing.find((p) => p.kind === 'TEMPLATE' && p.collectionKey === key);
    if (found) await api('PUT', `/sites/pages/${found.id}`, { title: d.title, titleBn: d.titleBn, seo: d.seo, draft: d.data });
    else await api('POST', '/sites/pages', { kind: 'TEMPLATE', collectionKey: key, title: d.title, titleBn: d.titleBn, seo: d.seo, data: d.data });
    console.log(`template page for ${key}: ${found ? 'updated' : 'created'}`);
  }
  const custom = [teachersPage(fe.pageBuilder), eventsPage(fe.pageBuilder), classesPage(fe.pageBuilder)];
  existing = await allPages();
  for (const p of custom) {
    const found = existing.find((x) => x.slug === p.slug && x.kind !== 'TEMPLATE');
    if (found) await api('PUT', `/sites/pages/${found.id}`, { title: p.title, titleBn: p.titleBn, seo: p.seo, draft: p.data });
    else await api('POST', '/sites/pages', { slug: p.slug, title: p.title, titleBn: p.titleBn, seo: p.seo, data: p.data });
    console.log(`page /${p.slug}: ${found ? 'updated' : 'created'}`);
  }
  // Menu order in the dashboard: template order, then the new listing pages.
  existing = await allPages();
  const order = [...pages.map((p) => p.slug), ...custom.map((p) => p.slug)];
  const ordered = existing.filter((p) => p.kind !== 'TEMPLATE').sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  await api('PUT', '/sites/pages/order', { ids: [...ordered, ...existing.filter((p) => p.kind === 'TEMPLATE')].map((p) => p.id) });

  step('8. Publish every page and the site');
  existing = await allPages();
  for (const p of existing) await api('POST', `/sites/pages/${p.id}/publish`, { note: 'Demo site build' });
  await api('POST', '/sites/me/publish');
  console.log(`${existing.length} pages published (${existing.filter((p) => p.kind === 'TEMPLATE').length} template pages); site published`);

  step('DSHE compliance');
  const comp = (await api('GET', '/sites/me/compliance')).data;
  for (const i of comp.items) console.log(`  ${i.status === 'filled' ? '[x]' : i.status === 'partial' ? '[~]' : '[ ]'} ${i.key} — ${i.label}${i.status !== 'filled' ? `  (fix at: ${i.fixAt})` : ''}`);
  console.log(`  score: ${comp.filled}/${comp.total}`);

  if (process.env.DEMO_SKIP_VERIFY !== '1') await verify(siteId, subdomain);

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${calls.ok} API calls.`);
  console.log(`Open: ${FRONTEND}/s/${subdomain}`);
}

/* ── navigation ──────────────────────────────────────────────────────────── */

const n = (label: string, labelBn: string, href: string, children?: J[]) => ({ label, labelBn, href, ...(children ? { children } : {}) });

const HEADER_NAV = [
  n('Home', 'হোম', '/'),
  n('About', 'প্রতিষ্ঠান পরিচিতি', '/about', [
    n('Institution profile', 'প্রতিষ্ঠানের তথ্য', '/about'),
    n('Head teacher', 'প্রধান শিক্ষকের বাণী', '/administration'),
    n('Recognition & MPO', 'স্বীকৃতি ও এমপিও', '/about'),
  ]),
  n('Administration', 'প্রশাসন', '/administration', [
    n('Managing committee', 'পরিচালনা কমিটি', '/administration'),
    n('Teachers', 'শিক্ষকবৃন্দ', '/teachers'),
    n('Staff', 'কর্মকর্তা ও কর্মচারী', '/administration'),
    n('Information & complaints officers', 'তথ্য ও অভিযোগ কর্মকর্তা', '/contact'),
  ]),
  n('Academics', 'একাডেমিক', '/academics', [
    n('Classes', 'শ্রেণিসমূহ', '/classes'),
    n('Routine', 'ক্লাস রুটিন', '/academics'),
    n('Syllabus', 'সিলেবাস', '/downloads'),
    n('Events calendar', 'অনুষ্ঠানসূচি', '/events'),
  ]),
  n('Notices', 'নোটিশ', '/notices', [
    n('Notice board', 'নোটিশ বোর্ড', '/notices'),
    n('Events', 'অনুষ্ঠান', '/events'),
  ]),
  n('Results', 'ফলাফল', '/results'),
  n('Admission', 'ভর্তি', '/admissions', [
    n('Admission circulars', 'ভর্তি বিজ্ঞপ্তি', '/admissions'),
    n('Admission form', 'ভর্তি ফরম', '/downloads'),
  ]),
  n('Gallery', 'গ্যালারি', '/gallery'),
  n('Downloads', 'ডাউনলোড', '/downloads'),
  n('Contact', 'যোগাযোগ', '/contact'),
  n('Teachers', 'শিক্ষক', '/teachers'),
];

const FOOTER_NAV = [
  n('About', 'প্রতিষ্ঠান পরিচিতি', '/about'),
  n('Administration', 'প্রশাসন', '/administration'),
  n('Our teachers', 'আমাদের শিক্ষক', '/teachers'),
  n('Notices', 'নোটিশ', '/notices'),
  n('Events', 'অনুষ্ঠান', '/events'),
  n('Results', 'ফলাফল', '/results'),
  n('Admission', 'ভর্তি', '/admissions'),
  n('Downloads', 'ডাউনলোড', '/downloads'),
  n('Contact', 'যোগাযোগ', '/contact'),
];

/* ── template page customisation (home slider, info boxes, videos …) ──────── */

function customiseTemplatePages(pages: J[]) {
  const home = pages.find((p) => p.slug === '');
  walk(home?.data?.content, (b) => {
    if (b.type === 'ImageSlider') {
      b.props.slides = [
        { image: pic('dcs-campus', 1600, 600), caption: 'Welcome to Dhaka City School', captionBn: 'ঢাকা সিটি স্কুলে স্বাগতম', href: '/about' },
        { image: pic('dcs-admission', 1600, 600), caption: 'Admission 2027 is open — apply by 30 November', captionBn: 'ভর্তি ২০২৭ চলছে — আবেদনের শেষ তারিখ ৩০ নভেম্বর', href: '/admissions' },
        { image: pic('dcs-sports-1', 1600, 600), caption: 'Annual Sports Day 2026', captionBn: 'বার্ষিক ক্রীড়া প্রতিযোগিতা ২০২৬', href: '/gallery' },
        { image: pic('dcs-science-1', 1600, 600), caption: 'Science Fair 2026', captionBn: 'বিজ্ঞান মেলা ২০২৬', href: '/gallery' },
      ];
    }
    if (b.type === 'InfoBoxGrid') {
      b.props.columns = '2';
      b.props.boxes = [
        { icon: 'book', heading: 'প্রতিষ্ঠান সংক্রান্ত তথ্য', headingBn: '', links: [l('প্রতিষ্ঠানের ইতিহাস', '/about'), l('স্বীকৃতি ও এমপিও', '/about'), l('পরিচালনা কমিটি', '/administration'), l('যোগাযোগ', '/contact')] },
        { icon: 'graduation', heading: 'শিক্ষক ও শিক্ষার্থী', headingBn: '', links: [l('শিক্ষকবৃন্দ', '/teachers'), l('শ্রেণিসমূহ', '/classes'), l('শ্রেণিভিত্তিক শিক্ষার্থী', '/academics'), l('ক্লাস রুটিন', '/academics')] },
        { icon: 'calendar', heading: 'পরীক্ষা ও ফলাফল', headingBn: '', links: [l('পরীক্ষার রুটিন', '/academics'), l('ফলাফল', '/results'), l('সিলেবাস', '/downloads'), l('অনুষ্ঠানসূচি', '/events')] },
        { icon: 'star', heading: 'ভর্তি ও অন্যান্য', headingBn: '', links: [l('ভর্তি বিজ্ঞপ্তি', '/admissions'), l('ভর্তি ফরম', '/downloads'), l('ফটো গ্যালারি', '/gallery'), l('নোটিশ বোর্ড', '/notices')] },
      ];
    }
    if (b.type === 'VideoGallery') {
      b.props.columns = '2';
      b.props.videos = [
        { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', poster: pic('dcs-video-1', 800, 450), title: 'Campus tour (sample video)', titleBn: 'ক্যাম্পাস পরিচিতি (নমুনা ভিডিও)' },
        { url: 'https://www.youtube.com/watch?v=eRsGyueVLvQ', poster: pic('dcs-video-2', 800, 450), title: 'Cultural programme (sample video)', titleBn: 'সাংস্কৃতিক অনুষ্ঠান (নমুনা ভিডিও)' },
      ];
    }
    if (b.type === 'FacebookPage') b.props.pageUrl = 'https://www.facebook.com/facebook';
  });

  const about = pages.find((p) => p.slug === 'about');
  walk(about?.data?.content, (b) => {
    if (b.type === 'RichText') {
      b.props.body =
        '<h2>Our history</h2><p>Dhaka City School started in 1985 with 120 students in a rented building in Mirpur. It received teaching permission for the secondary level in 1988, moved to its own campus in 1995 and has sent students to the SSC examination every year since 1990. (Sample text)</p>' +
        '<h2>Mission</h2><p>To give every child a sound education with discipline, curiosity and care for others.</p>';
      b.props.bodyBn =
        '<h2>ইতিহাস</h2><p>১৯৮৫ সালে মিরপুরের একটি ভাড়া বাড়িতে ১২০ জন শিক্ষার্থী নিয়ে ঢাকা সিটি স্কুলের যাত্রা শুরু হয়। ১৯৮৮ সালে মাধ্যমিক স্তরে পাঠদানের অনুমতি পায়, ১৯৯৫ সালে নিজস্ব ক্যাম্পাসে স্থানান্তরিত হয় এবং ১৯৯০ সাল থেকে প্রতি বছর এসএসসি পরীক্ষায় শিক্ষার্থী পাঠিয়ে আসছে। (নমুনা লেখা)</p>' +
        '<h2>লক্ষ্য</h2><p>শৃঙ্খলা, জিজ্ঞাসা ও মানবিকতার সঙ্গে প্রতিটি শিশুকে মানসম্মত শিক্ষা দেওয়া।</p>';
    }
    if (b.type === 'Timeline') {
      b.props.items = [
        { year: '1985', title: 'Founded in Mirpur', titleBn: 'মিরপুরে প্রতিষ্ঠা', text: 'Classes 1–8 with 120 students.', textBn: '১২০ জন শিক্ষার্থী নিয়ে ১ম–৮ম শ্রেণি।' },
        { year: '1988', title: 'Secondary permission', titleBn: 'মাধ্যমিক স্তরের অনুমতি', text: 'Classes 9 and 10 opened.', textBn: '৯ম ও ১০ম শ্রেণি চালু।' },
        { year: '1992', title: 'MPO listing', titleBn: 'এমপিওভুক্তি', text: 'Teachers brought under the MPO scheme.', textBn: 'শিক্ষকগণ এমপিওভুক্ত হন।' },
        { year: '1995', title: 'Own campus', titleBn: 'নিজস্ব ক্যাম্পাস', text: 'Moved to the Mirpur-10 campus.', textBn: 'মিরপুর-১০ ক্যাম্পাসে স্থানান্তর।' },
        { year: '2026', title: 'Digital campus', titleBn: 'ডিজিটাল ক্যাম্পাস', text: 'Online results, fees and this website.', textBn: 'অনলাইন ফলাফল, বেতন ও এই ওয়েবসাইট।' },
      ];
    }
  });
}

function l(label: string, href: string) {
  return { label, labelBn: '', href };
}

/* ── new pages built from designer blocks ────────────────────────────────── */

type B = (type: string, props?: Record<string, unknown>) => Block;
const it = (p: string, fmt?: string) => ({ src: 'item', path: p, ...(fmt ? { fmt } : {}) });
const showIf = (when: Array<{ src: string; path: string; op: string; value?: string }>, hideOn: string[] = []) => ({ _visible: { match: 'all', when, hideOn } });

/** "আমাদের শিক্ষক / Our Teachers": department chips (URL filter), a show-if banner, and a designed teacher card. */
function teachersPage(pageBuilder: (prefix: string) => B) {
  const b = pageBuilder('our-teachers');
  const chip = (en: string, bn: string, dept?: string) =>
    b('LinkButton', { label: en, labelBn: bn, href: dept ? `/teachers?dept=${encodeURIComponent(dept)}` : '/teachers', variant: 'outline', size: 'sm', align: 'start' });
  const card = b('Stack', {
    direction: 'column', gap: 'sm', align: 'center', justify: 'start', padding: 'md', surface: 'card', radius: true,
    content: [
      b('Picture', { src: '', alt: '', ratio: '1/1', fit: 'cover', radius: 'full', maxWidth: 140, _bind: { src: it('photoUrl'), alt: it('name'), href: it('_url') }, ...showIf([{ src: 'item', path: 'photoUrl', op: 'notEmpty' }]) }),
      b('Text', { tag: 'h3', size: 'lg', weight: 'bold', align: 'center', text: '', textBn: '', _bind: { text: it('name') } }),
      b('Text', { tag: 'p', size: 'sm', color: 'muted', align: 'center', text: '', textBn: '', _bind: { text: it('designation') }, ...showIf([{ src: 'item', path: 'designation', op: 'notEmpty' }]) }),
      b('Stack', {
        direction: 'row', stackOnPhone: false, gap: 'xs', align: 'center', justify: 'center', wrap: true, padding: 'none', surface: 'none', radius: false,
        content: [
          b('Badge', { text: '', textBn: '', tone: 'accent', align: 'center', _bind: { text: it('subject') }, ...showIf([{ src: 'item', path: 'subject', op: 'notEmpty' }]) }),
          b('Badge', { text: '', textBn: '', tone: 'neutral', align: 'center', _bind: { text: it('department') }, ...showIf([{ src: 'item', path: 'department', op: 'notEmpty' }]) }),
          // Show-if rule on data: a "Head" badge only for the head teacher.
          b('Badge', { text: 'Head of institution', textBn: 'প্রতিষ্ঠান প্রধান', tone: 'primary', align: 'center', ...showIf([{ src: 'item', path: 'designation', op: 'eq', value: 'Head Teacher' }]) }),
        ],
      }),
      b('LinkButton', { label: 'View profile', labelBn: 'প্রোফাইল দেখুন', href: '', variant: 'outline', size: 'sm', align: 'center', _bind: { href: it('_url') } }),
    ],
  });
  const content: Block[] = [
    b('Heading', { eyebrow: 'Administration', eyebrowBn: 'প্রশাসন', text: 'Our Teachers', textBn: 'আমাদের শিক্ষক', sub: 'Meet the teachers of {{institution.name}}. Filter by department below.', subBn: '{{institution.name}}-এর শিক্ষকবৃন্দ। নিচে বিভাগ অনুযায়ী খুঁজুন।', level: 'h1', tone: 'soft', pad: 'md' }),
    b('Section', {
      tone: 'default', pad: 'sm', width: 'default', animate: 'none', overlay: 'none',
      content: [
        b('Stack', {
          direction: 'row', stackOnPhone: false, gap: 'sm', align: 'center', justify: 'start', wrap: true, padding: 'none', surface: 'none', radius: false,
          content: [b('Text', { tag: 'span', size: 'sm', weight: 'semibold', text: 'Department:', textBn: 'বিভাগ:' }), chip('All', 'সকল'), ...DEPARTMENTS.map(([en, bn]) => chip(en, bn, en))],
        }),
        // Show-if rule on the URL: only visible while a department filter is active.
        b('Text', { tag: 'p', size: 'sm', color: 'muted', text: 'Showing teachers of the {{url.dept}} department.', textBn: 'দেখানো হচ্ছে: {{url.dept}} বিভাগের শিক্ষকবৃন্দ।', ...showIf([{ src: 'url', path: 'dept', op: 'notEmpty' }]) }),
      ],
    }),
    b('CollectionList', {
      sourceKind: 'collection', collection: 'teachers', relation: '',
      filters: [{ field: 'department', op: 'eq', source: 'url', value: 'dept' }],
      sortField: 'name', sortDir: 'asc', search: '{{url.q}}', limit: 12, paginate: 'pages',
      layout: 'grid', colsSm: '1', colsMd: '2', colsLg: '4', gap: 'md', wrap: true, tone: 'surface', pad: 'md', width: 'default',
      item: [card],
      empty: [b('Text', { tag: 'p', size: 'md', color: 'muted', align: 'center', text: 'No teachers in this department yet.', textBn: 'এই বিভাগে এখনো কোনো শিক্ষক নেই।' })],
    }),
  ];
  return {
    slug: 'teachers', title: 'Our Teachers', titleBn: 'আমাদের শিক্ষক',
    seo: { title: 'Our Teachers | {{institution.name}}', description: 'Teachers of Dhaka City School by department.' },
    data: { root: { props: { title: 'Our Teachers' } }, content, zones: {} },
  };
}

/** /events — the events collection as dated cards (the template's back link points here). */
function eventsPage(pageBuilder: (prefix: string) => B) {
  const b = pageBuilder('events-list');
  const card = b('Stack', {
    direction: 'column', gap: 'xs', align: 'stretch', justify: 'start', padding: 'md', surface: 'card', radius: true,
    content: [
      b('Badge', { text: '', textBn: '', tone: 'accent', align: 'start', _bind: { text: it('category') } }),
      b('Text', { tag: 'h3', size: 'lg', weight: 'bold', text: '', _bind: { text: it('title') } }),
      b('Text', { tag: 'p', size: 'sm', weight: 'semibold', color: 'primary', text: '', _bind: { text: it('startDate', 'date:long') } }),
      b('Text', { tag: 'p', size: 'sm', color: 'muted', text: 'Venue: {{item.venue}}', textBn: 'স্থান: {{item.venue}}', ...showIf([{ src: 'item', path: 'venue', op: 'notEmpty' }]) }),
      b('Text', { tag: 'p', size: 'sm', lines: 3, text: '', _bind: { text: it('description') } }),
      b('LinkButton', { label: 'Details', labelBn: 'বিস্তারিত', href: '', variant: 'link', size: 'sm', align: 'start', _bind: { href: it('_url') } }),
    ],
  });
  return {
    slug: 'events', title: 'Events', titleBn: 'অনুষ্ঠানসূচি',
    seo: { title: 'Events | {{institution.name}}', description: '' },
    data: {
      root: { props: { title: 'Events' } }, zones: {},
      content: [
        b('Heading', { eyebrow: 'Notices', eyebrowBn: 'নোটিশ', text: 'Events calendar', textBn: 'অনুষ্ঠানসূচি', level: 'h1', tone: 'soft', pad: 'md' }),
        b('CollectionList', {
          sourceKind: 'collection', collection: 'events', relation: '', filters: [], sortField: 'startDate', sortDir: 'asc', search: '', limit: 12, paginate: 'more',
          layout: 'grid', colsSm: '1', colsMd: '2', colsLg: '3', gap: 'md', wrap: true, tone: 'default', pad: 'md', width: 'default', item: [card],
          empty: [b('Text', { tag: 'p', color: 'muted', align: 'center', text: 'No events yet.', textBn: 'এখনো কোনো অনুষ্ঠান নেই।' })],
        }),
      ],
    },
  };
}

/** /classes — every class with a link to its profile page. */
function classesPage(pageBuilder: (prefix: string) => B) {
  const b = pageBuilder('classes-list');
  const card = b('Stack', {
    direction: 'column', gap: 'xs', align: 'stretch', justify: 'start', padding: 'md', surface: 'card', radius: true,
    content: [
      b('Text', { tag: 'h3', size: 'xl', weight: 'bold', text: '', _bind: { text: it('name') } }),
      b('Text', { tag: 'p', size: 'sm', color: 'muted', text: 'Sections: {{item.sectionNames}}', textBn: 'শাখা: {{item.sectionNames}}', ...showIf([{ src: 'item', path: 'sectionNames', op: 'notEmpty' }]) }),
      b('Text', { tag: 'p', size: 'sm', color: 'muted', text: 'Students: {{item.studentCount}}', textBn: 'শিক্ষার্থী: {{item.studentCount}}', ...showIf([{ src: 'item', path: 'studentCount', op: 'notEmpty' }]) }),
      b('LinkButton', { label: 'View class', labelBn: 'শ্রেণির পাতা', href: '', variant: 'outline', size: 'sm', align: 'start', _bind: { href: it('_url') } }),
    ],
  });
  return {
    slug: 'classes', title: 'Classes', titleBn: 'শ্রেণিসমূহ',
    seo: { title: 'Classes | {{institution.name}}', description: '' },
    data: {
      root: { props: { title: 'Classes' } }, zones: {},
      content: [
        b('Heading', { eyebrow: 'Academics', eyebrowBn: 'একাডেমিক', text: 'Classes', textBn: 'শ্রেণিসমূহ', level: 'h1', tone: 'soft', pad: 'md' }),
        b('CollectionList', {
          sourceKind: 'collection', collection: 'classes', relation: '', filters: [], sortField: 'level', sortDir: 'asc', search: '', limit: 50, paginate: 'none',
          layout: 'grid', colsSm: '2', colsMd: '3', colsLg: '4', gap: 'md', wrap: true, tone: 'default', pad: 'md', width: 'default', item: [card], empty: [],
        }),
      ],
    },
  };
}

/* ── verification through the public API ─────────────────────────────────── */

async function verify(siteId: string, subdomain: string) {
  step('9. Verify through the public API');
  const pub = (p: string) => api('GET', `/public/sites${p}`, undefined, { auth: false, raw: true });
  const problems: string[] = [];
  const blobs: string[] = [];
  const check = (label: string, r: { status: number; text: string }, want = 200) => {
    blobs.push(r.text);
    const ok = r.status === want;
    if (!ok) problems.push(`${label}: HTTP ${r.status} (wanted ${want})`);
    console.log(`  ${ok ? 'ok ' : 'BAD'} ${r.status} ${label}`);
    return ok;
  };

  const resolved = await pub(`/resolve?slug=${encodeURIComponent(subdomain)}`);
  check('resolve', resolved);
  const res = resolved.json.data ?? {};
  const routes: J[] = res.templateRoutes ?? [];
  console.log(`  resolve: ${res.pages?.length ?? 0} pages, templateRoutes: ${routes.map((r) => `${r.base}→${r.pageSlug}`).join(', ')}`);
  for (const p of res.pages ?? []) check(`page /${p.slug}`, await pub(`/${siteId}/pages/${p.slug === '' ? '_home' : p.slug}`));

  const counts: Record<string, number> = {};
  for (const key of ['teachers', 'staff', 'committee', 'classes', 'subjects', 'notices', 'events', 'albums', 'admissions', 'downloads', 'holidays', 'exams']) {
    const r = await pub(`/${siteId}/collections/${key}?pageSize=50`);
    if (check(`collection ${key}`, r)) counts[key] = r.json.meta?.total ?? (r.json.data ?? []).length;
    const route = routes.find((x) => x.collection === key);
    const first = (r.json.data ?? [])[0];
    if (route && first?.slug) {
      check(`template page ${route.pageSlug}`, await pub(`/${siteId}/pages/${route.pageSlug}`));
      const item = await pub(`/${siteId}/collections/${key}/items/${encodeURIComponent(first.slug)}`);
      check(`${route.base}/${first.slug}`, item);
    }
  }
  console.log(`  collection totals: ${JSON.stringify(counts)}`);
  check('collection students (must be 404)', await pub(`/${siteId}/collections/students`), 404);
  for (const d of ['notices', 'events', 'teachers', 'profile', 'staff', 'committee', 'albums', 'downloads', 'admissions', 'class-stats', 'result-summary', 'fee-chart', 'holidays']) {
    check(`data/${d}`, await pub(`/${siteId}/data/${d}`));
  }
  const filtered = await pub(`/${siteId}/collections/teachers?filter[department][eq]=Science&sort=name`);
  check('teachers filtered by department=Science', filtered);
  console.log(`  Science teachers: ${(filtered.json.data ?? []).map((t: J) => t.name).join(', ')}`);

  // Privacy: no student names, emails, phones or birth dates anywhere in what we fetched.
  const everything = blobs.join('\n');
  const students = list(await api('GET', '/students?pageSize=100').catch(() => ({ data: [] })));
  const leaks: string[] = [];
  for (const s of students) {
    const name = [s.firstName ?? s.user?.firstName, s.lastName ?? s.user?.lastName].filter(Boolean).join(' ').trim();
    if (name.length > 3 && everything.includes(name)) leaks.push(`student name "${name}"`);
    const email = s.email ?? s.user?.email;
    if (email && everything.includes(email)) leaks.push(`student email ${email}`);
  }
  for (const k of ['dateOfBirth', 'guardian', 'rollNumber', 'passwordHash', 'salary', 'baseSalary']) if (everything.includes(`"${k}"`)) leaks.push(`key "${k}"`);
  console.log(`  privacy scan over ${blobs.length} public responses, ${students.length} students checked: ${leaks.length ? `LEAKS: ${leaks.join('; ')}` : 'no student personal data found'}`);
  if (leaks.length) problems.push(...leaks);

  try {
    const shell = await fetch(`${FRONTEND}/s/${subdomain}`);
    const html = await shell.text();
    console.log(`  frontend shell ${FRONTEND}/s/${subdomain}: HTTP ${shell.status}${html.includes('id="root"') ? ' (app root present)' : ''}`);
  } catch (e) {
    console.log(`  frontend shell not reachable: ${(e as Error).message}`);
  }

  console.log(problems.length ? `\nVERIFY: ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}` : '\nVERIFY: all checks passed');
}

main().catch((e) => {
  console.error(`\nFAILED: ${(e as Error).message}`);
  process.exit(1);
});
