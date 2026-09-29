// =============================================================================
// Sites portal — pure logic (no database, no network) for Track B's public
// data layer. Unit-tested in tests/sites-portal-data.test.ts.
//
//   - public-safe staff/committee field whitelisting
//   - gender-count and pass-rate maths for class-stats / result-summary
//   - the "Powered by" footer-credit rule (owner decision 4)
//   - the DSHE 11-item compliance checklist (§1 of WEBSITE_V3_PLAN.md)
// =============================================================================

// ── Staff directory (public-safe fields only) ───────────────────────────────

export type StaffCategory = 'head' | 'teachers' | 'staff';

/** Raw shape read from the database — never returned as-is (see toPublicStaff). */
export interface RawStaffRow {
  userId: string;
  name: string;
  photoUrl: string | null;
  designation: string | null;
  department: string | null;
  subject: string | null;
  qualification: string | null;
  classTeacherOf: string[];
}

/** Exactly the fields a visitor may see — no phone, email, DOB, address or salary. */
export interface PublicStaffMember {
  name: string;
  designation: string | null;
  department: string | null;
  subject: string | null;
  qualification: string | null;
  photoUrl: string | null;
  classTeacherOf: string[];
}

export function toPublicStaffMember(row: RawStaffRow): PublicStaffMember {
  return {
    name: row.name,
    designation: row.designation,
    department: row.department,
    subject: row.subject,
    qualification: row.qualification,
    photoUrl: row.photoUrl,
    classTeacherOf: row.classTeacherOf,
  };
}

// ── Committee (phone hidden unless the school opted it in) ─────────────────

export interface RawCommitteeRow {
  name: string;
  nameBn: string | null;
  role: string;
  roleBn: string | null;
  photoUrl: string | null;
  phone: string | null;
  showPhone: boolean;
  sortOrder: number;
}

export interface PublicCommitteeMember {
  name: string;
  nameBn: string | null;
  role: string;
  roleBn: string | null;
  photoUrl: string | null;
  phone: string | null;
}

export function toPublicCommitteeMember(row: RawCommitteeRow): PublicCommitteeMember {
  return {
    name: row.name,
    nameBn: row.nameBn,
    role: row.role,
    roleBn: row.roleBn,
    photoUrl: row.photoUrl,
    phone: row.showPhone ? row.phone : null,
  };
}

// ── Gender counts (class-stats) ─────────────────────────────────────────────

export interface GenderCounts {
  male: number;
  female: number;
  other: number;
  total: number;
}

function emptyGenderCounts(): GenderCounts {
  return { male: 0, female: 0, other: 0, total: 0 };
}

/** Free-text Student.gender → one of the three public buckets. */
export function normalizeGender(value: string | null | undefined): 'male' | 'female' | 'other' {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'male' || v === 'm' || v === 'boy') return 'male';
  if (v === 'female' || v === 'f' || v === 'girl') return 'female';
  return 'other';
}

/** Tallies (classId | className, gender) rows into per-class gender counts — counts only, no names. */
export function summarizeGenderCounts(rows: { key: string; gender: string | null; count: number }[]): Record<string, GenderCounts> {
  const out: Record<string, GenderCounts> = {};
  for (const row of rows) {
    const bucket = (out[row.key] ??= emptyGenderCounts());
    const g = normalizeGender(row.gender);
    bucket[g] += row.count;
    bucket.total += row.count;
  }
  return out;
}

// ── Result summary (pass-rate maths) ────────────────────────────────────────

export interface StudentExamOutcome {
  className: string;
  passed: boolean;
  gpa: number;
}

export interface ClassResultSummary {
  className: string;
  appeared: number;
  passed: number;
  passRate: number; // 0-100, rounded to 2 decimals
  gpa5Count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Per-class appeared/passed/pass-rate/GPA-5 counts — no student names or ids. */
export function summarizeClassResults(rows: StudentExamOutcome[]): ClassResultSummary[] {
  const byClass = new Map<string, StudentExamOutcome[]>();
  for (const row of rows) {
    const list = byClass.get(row.className) ?? [];
    list.push(row);
    byClass.set(row.className, list);
  }
  return [...byClass.entries()]
    .map(([className, list]) => {
      const appeared = list.length;
      const passed = list.filter((r) => r.passed).length;
      const gpa5Count = list.filter((r) => r.passed && r.gpa >= 5).length;
      return {
        className,
        appeared,
        passed,
        passRate: appeared > 0 ? round2((passed / appeared) * 100) : 0,
        gpa5Count,
      };
    })
    .sort((a, b) => a.className.localeCompare(b.className));
}

// ── "Powered by" footer credit (owner decision 4) ───────────────────────────

/**
 * The credit is shown by default. `settings.hidePoweredBy` is honoured only
 * when the institution's plan also carries the `website_remove_branding`
 * feature — so a school can never remove it just by editing site settings.
 */
export function resolvePoweredBy(hidePoweredBy: boolean, featureEnabled: boolean): boolean {
  return !(hidePoweredBy && featureEnabled);
}

// ── SEO helper for detail responses (B4) ────────────────────────────────────

/** Strips HTML tags/whitespace and truncates — a safe description for a detail page's SEO block. */
export function plainTextExcerpt(html: string | null | undefined, maxLength = 160): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

// ── DSHE 11-item compliance checklist (§1 of WEBSITE_V3_PLAN.md) ───────────

export type ComplianceStatus = 'filled' | 'partial' | 'missing';

export interface ComplianceItem {
  key: string;
  labelBn: string;
  label: string;
  status: ComplianceStatus;
  /** Which admin screen fixes this item. */
  fixAt: string;
}

/** Everything the checklist needs, pre-computed by the service (counts, booleans). */
export interface ComplianceInput {
  hasNameBn: boolean;
  hasAboutText: boolean;
  hasRecognitionInfo: boolean;
  hasStudentCounts: boolean; // at least one ACTIVE student
  hasSections: boolean; // at least one Section
  hasRoutine: boolean; // at least one TimetableSlot
  hasNotices: boolean; // at least one active Notice
  hasMpoInfo: boolean;
  hasContactDetails: boolean; // address + (phone or email)
  hasInformationOfficer: boolean;
  hasComplaintsOfficer: boolean;
  hasHeadOfInstitution: boolean;
  hasVisibleStaff: boolean; // at least one showOnWebsite=true TEACHER/staff
  hasCommittee: boolean; // at least one SiteCommitteeMember
}

function two(a: boolean, b: boolean): ComplianceStatus {
  if (a && b) return 'filled';
  if (a || b) return 'partial';
  return 'missing';
}
function one(a: boolean): ComplianceStatus {
  return a ? 'filled' : 'missing';
}

export function complianceChecklist(input: ComplianceInput): ComplianceItem[] {
  return [
    {
      key: 'profile',
      labelBn: 'প্রতিষ্ঠান পরিচিতি',
      label: 'Institution introduction',
      status: two(input.hasNameBn, input.hasAboutText),
      fixAt: 'Website > Profile',
    },
    {
      key: 'recognition',
      labelBn: 'পাঠদানের অনুমতি ও স্বীকৃতি',
      label: 'Teaching permission and recognition',
      status: one(input.hasRecognitionInfo),
      fixAt: 'Website > Profile',
    },
    {
      key: 'class_gender_counts',
      labelBn: 'শ্রেণি ও লিঙ্গভিত্তিক শিক্ষার্থী',
      label: 'Students by class and gender',
      status: one(input.hasStudentCounts),
      fixAt: 'Students (automatic once students are enrolled)',
    },
    {
      key: 'sections',
      labelBn: 'শ্রেণিভিত্তিক অনুমোদিত শাখা',
      label: 'Approved sections per class',
      status: one(input.hasSections),
      fixAt: 'Academics > Classes & Sections (automatic)',
    },
    {
      key: 'teaching_info',
      labelBn: 'পাঠদান তথ্য (রুটিন, নোটিশ)',
      label: 'Routine and notices',
      status: two(input.hasRoutine, input.hasNotices),
      fixAt: 'Academics > Routine, and Notices',
    },
    {
      key: 'mpo',
      labelBn: 'এমপিও/জাতীয়করণ',
      label: 'MPO and nationalisation',
      status: one(input.hasMpoInfo),
      fixAt: 'Website > Profile',
    },
    {
      key: 'contact',
      labelBn: 'যোগাযোগ',
      label: 'Contact details',
      status: one(input.hasContactDetails),
      fixAt: 'Settings > Institution Profile',
    },
    {
      key: 'information_officer',
      labelBn: 'তথ্যসেবা কেন্দ্র',
      label: 'Information service officer',
      status: one(input.hasInformationOfficer),
      fixAt: 'Website > Profile',
    },
    {
      key: 'complaints_officer',
      labelBn: 'অভিযোগ নিষ্পত্তি কর্মকর্তা',
      label: 'Complaints officer',
      status: one(input.hasComplaintsOfficer),
      fixAt: 'Website > Profile',
    },
    {
      key: 'people',
      labelBn: 'প্রধান, শিক্ষক ও কর্মচারী',
      label: 'Head, teachers and staff',
      status: two(input.hasHeadOfInstitution, input.hasVisibleStaff),
      fixAt: 'Website > Profile, and Website > Staff visibility',
    },
    {
      key: 'committee',
      labelBn: 'ম্যানেজিং কমিটি',
      label: 'Managing committee',
      status: one(input.hasCommittee),
      fixAt: 'Website > Committee',
    },
  ];
}
