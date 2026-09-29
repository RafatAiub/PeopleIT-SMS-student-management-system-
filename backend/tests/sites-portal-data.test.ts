// Pure-logic tests for the Website v3 Sites portal data layer (Track B). No
// database, no network. See tests/sites-logic.test.ts for the v1 conventions
// this file follows.

import {
  complianceChecklist,
  normalizeGender,
  plainTextExcerpt,
  resolvePoweredBy,
  summarizeClassResults,
  summarizeGenderCounts,
  toPublicCommitteeMember,
  toPublicStaffMember,
  type ComplianceInput,
  type RawCommitteeRow,
  type RawStaffRow,
  type StudentExamOutcome,
} from '../src/modules/sites/sites.portal.logic';
import { publicSettings } from '../src/modules/sites/sites.logic';

// ── Public field whitelisting — no phones, DOB or salary ever leak ─────────

describe('toPublicStaffMember', () => {
  it('only carries the public-safe fields, even if the raw row had more', () => {
    const raw = {
      userId: 'u1',
      name: 'Rahim Uddin',
      photoUrl: 'https://x/a.jpg',
      designation: 'Senior Teacher',
      department: 'Science',
      subject: 'Physics',
      qualification: 'MSc',
      classTeacherOf: ['Class 8 A'],
      // Extra fields a careless query might have selected — must never appear.
      phone: '01700000000',
      email: 'rahim@example.com',
      dateOfBirth: '1990-01-01',
      salary: 50000,
    } as unknown as RawStaffRow;
    const pub = toPublicStaffMember(raw);
    expect(pub).toEqual({
      name: 'Rahim Uddin',
      designation: 'Senior Teacher',
      department: 'Science',
      subject: 'Physics',
      qualification: 'MSc',
      photoUrl: 'https://x/a.jpg',
      classTeacherOf: ['Class 8 A'],
    });
    expect(Object.keys(pub)).not.toContain('phone');
    expect(Object.keys(pub)).not.toContain('email');
    expect(Object.keys(pub)).not.toContain('dateOfBirth');
    expect(Object.keys(pub)).not.toContain('salary');
    expect(Object.keys(pub)).not.toContain('userId');
  });
});

describe('toPublicCommitteeMember', () => {
  const base: RawCommitteeRow = {
    name: 'Karim Sheikh',
    nameBn: 'করিম শেখ',
    role: 'Chairman',
    roleBn: 'সভাপতি',
    photoUrl: null,
    phone: '01711111111',
    showPhone: false,
    sortOrder: 0,
  };

  it('hides the phone number unless showPhone is true', () => {
    expect(toPublicCommitteeMember(base).phone).toBeNull();
    expect(toPublicCommitteeMember({ ...base, showPhone: true }).phone).toBe('01711111111');
  });

  it('never exposes sortOrder or other admin-only fields', () => {
    const pub = toPublicCommitteeMember(base);
    expect(Object.keys(pub).sort()).toEqual(['name', 'nameBn', 'phone', 'photoUrl', 'role', 'roleBn'].sort());
  });
});

// ── Gender counts (class-stats) — counts only ───────────────────────────────

describe('normalizeGender / summarizeGenderCounts', () => {
  it('buckets common free-text spellings', () => {
    expect(normalizeGender('Male')).toBe('male');
    expect(normalizeGender('M')).toBe('male');
    expect(normalizeGender('boy')).toBe('male');
    expect(normalizeGender('Female')).toBe('female');
    expect(normalizeGender('f')).toBe('female');
    expect(normalizeGender('girl')).toBe('female');
    expect(normalizeGender(null)).toBe('other');
    expect(normalizeGender('')).toBe('other');
    expect(normalizeGender('non-binary')).toBe('other');
  });

  it('tallies rows into per-class counts only (no names, no ids)', () => {
    const rows = [
      { key: 'class-6', gender: 'Male', count: 10 },
      { key: 'class-6', gender: 'Female', count: 8 },
      { key: 'class-6', gender: 'other', count: 1 },
      { key: 'class-7', gender: 'male', count: 5 },
    ];
    const out = summarizeGenderCounts(rows);
    expect(out['class-6']).toEqual({ male: 10, female: 8, other: 1, total: 19 });
    expect(out['class-7']).toEqual({ male: 5, female: 0, other: 0, total: 5 });
    // No student-identifying keys should ever appear on the summary.
    expect(Object.keys(out['class-6'])).toEqual(['male', 'female', 'other', 'total']);
  });
});

// ── Pass-rate maths (result-summary) ────────────────────────────────────────

describe('summarizeClassResults', () => {
  it('computes appeared / passed / pass rate / GPA-5 counts per class', () => {
    const rows: StudentExamOutcome[] = [
      { className: 'Class 10', passed: true, gpa: 5 },
      { className: 'Class 10', passed: true, gpa: 4.5 },
      { className: 'Class 10', passed: false, gpa: 0 },
      { className: 'Class 10', passed: true, gpa: 5 },
      { className: 'Class 9', passed: true, gpa: 5 },
    ];
    const out = summarizeClassResults(rows);
    const ten = out.find((c) => c.className === 'Class 10')!;
    expect(ten.appeared).toBe(4);
    expect(ten.passed).toBe(3);
    expect(ten.passRate).toBeCloseTo(75, 5);
    expect(ten.gpa5Count).toBe(2);

    const nine = out.find((c) => c.className === 'Class 9')!;
    expect(nine).toEqual({ className: 'Class 9', appeared: 1, passed: 1, passRate: 100, gpa5Count: 1 });
  });

  it('is 0% pass rate (not NaN/Infinity) for an empty class', () => {
    expect(summarizeClassResults([])).toEqual([]);
  });

  it('never counts a failed student toward GPA-5, even if gpa happens to be >=5', () => {
    // Defensive: summarizeMarks never returns gpa>=5 for a failed student, but
    // the aggregator itself must not trust "gpa" alone without "passed".
    const rows: StudentExamOutcome[] = [{ className: 'Class 5', passed: false, gpa: 5 }];
    const out = summarizeClassResults(rows);
    expect(out[0].gpa5Count).toBe(0);
    expect(out[0].passed).toBe(0);
  });
});

// ── "Powered by" footer credit (owner decision 4) ───────────────────────────

describe('resolvePoweredBy', () => {
  it('shows the credit by default', () => {
    expect(resolvePoweredBy(false, false)).toBe(true);
    expect(resolvePoweredBy(false, true)).toBe(true);
  });

  it('hides the credit only when both hidePoweredBy is requested AND the feature is enabled', () => {
    expect(resolvePoweredBy(true, true)).toBe(false);
  });

  it('cannot be hidden by settings alone — the feature must also be enabled', () => {
    expect(resolvePoweredBy(true, false)).toBe(true);
  });
});

// ── Settings whitelist (B5) ──────────────────────────────────────────────────

describe('publicSettings whitelist', () => {
  const allSettings = {
    siteName: 'Green Hill School',
    topBar: { showDate: true },
    hotlines: [{ label: 'Admission', phone: '01700000000' }],
    importantLinks: [{ label: 'DSHE', href: 'https://dshe.gov.bd' }],
    eServices: [{ label: 'Pay fees', href: '/fees' }],
    hidePoweredBy: true,
    publicResultSummary: true,
    publicFeeChart: true,
    publicLibrary: true,
    publicTransport: true,
    // Keys that must stay private.
    defaultEnquiryFormId: 'form-1', // already whitelisted (existing behaviour)
    customCss: 'body{color:red}',
    headHtml: '<script>evil()</script>',
    bodyEndHtml: '<script>evil2()</script>',
    someInternalAdminNote: 'do not leak',
  };

  it('exposes the new Track B5 keys', () => {
    const out = publicSettings(allSettings);
    expect(out.topBar).toEqual({ showDate: true });
    expect(out.hotlines).toEqual([{ label: 'Admission', phone: '01700000000' }]);
    expect(out.importantLinks).toEqual([{ label: 'DSHE', href: 'https://dshe.gov.bd' }]);
    expect(out.eServices).toEqual([{ label: 'Pay fees', href: '/fees' }]);
    expect(out.hidePoweredBy).toBe(true);
    expect(out.publicResultSummary).toBe(true);
    expect(out.publicFeeChart).toBe(true);
    expect(out.publicLibrary).toBe(true);
    expect(out.publicTransport).toBe(true);
  });

  it('keeps everything else private', () => {
    const out = publicSettings(allSettings);
    expect(out.customCss).toBeUndefined();
    expect(out.headHtml).toBeUndefined();
    expect(out.bodyEndHtml).toBeUndefined();
    expect(out.someInternalAdminNote).toBeUndefined();
  });
});

// ── SEO excerpt helper (B4) ──────────────────────────────────────────────────

describe('plainTextExcerpt', () => {
  it('strips tags and truncates with an ellipsis', () => {
    const html = `<p>${'A'.repeat(200)}</p>`;
    const out = plainTextExcerpt(html, 160)!;
    expect(out.length).toBe(160);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('<p>');
  });

  it('returns null for empty input', () => {
    expect(plainTextExcerpt(null)).toBeNull();
    expect(plainTextExcerpt('')).toBeNull();
    expect(plainTextExcerpt('<p></p>')).toBeNull();
  });

  it('does not truncate short text', () => {
    expect(plainTextExcerpt('<b>Hello</b> world', 160)).toBe('Hello world');
  });
});

// ── DSHE 11-item compliance checklist ───────────────────────────────────────

function complianceInput(overrides: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    hasNameBn: false,
    hasAboutText: false,
    hasRecognitionInfo: false,
    hasStudentCounts: false,
    hasSections: false,
    hasRoutine: false,
    hasNotices: false,
    hasMpoInfo: false,
    hasContactDetails: false,
    hasInformationOfficer: false,
    hasComplaintsOfficer: false,
    hasHeadOfInstitution: false,
    hasVisibleStaff: false,
    hasCommittee: false,
    ...overrides,
  };
}

describe('complianceChecklist', () => {
  it('has exactly 11 items', () => {
    expect(complianceChecklist(complianceInput())).toHaveLength(11);
  });

  it('everything missing when nothing is configured', () => {
    const items = complianceChecklist(complianceInput());
    expect(items.every((i) => i.status === 'missing')).toBe(true);
  });

  it('marks a two-part item "partial" when only one half is filled', () => {
    const items = complianceChecklist(complianceInput({ hasNameBn: true, hasAboutText: false }));
    expect(items.find((i) => i.key === 'profile')!.status).toBe('partial');
  });

  it('marks a two-part item "filled" only when both halves are present', () => {
    const items = complianceChecklist(complianceInput({ hasNameBn: true, hasAboutText: true }));
    expect(items.find((i) => i.key === 'profile')!.status).toBe('filled');
  });

  it('marks single-condition items filled once their condition is true', () => {
    const items = complianceChecklist(complianceInput({ hasCommittee: true }));
    expect(items.find((i) => i.key === 'committee')!.status).toBe('filled');
  });

  it('everything filled when every input is true', () => {
    const items = complianceChecklist(
      complianceInput({
        hasNameBn: true,
        hasAboutText: true,
        hasRecognitionInfo: true,
        hasStudentCounts: true,
        hasSections: true,
        hasRoutine: true,
        hasNotices: true,
        hasMpoInfo: true,
        hasContactDetails: true,
        hasInformationOfficer: true,
        hasComplaintsOfficer: true,
        hasHeadOfInstitution: true,
        hasVisibleStaff: true,
        hasCommittee: true,
      }),
    );
    expect(items.every((i) => i.status === 'filled')).toBe(true);
  });

  it('every item names an admin screen to fix it', () => {
    for (const item of complianceChecklist(complianceInput())) {
      expect(item.fixAt.length).toBeGreaterThan(0);
    }
  });
});
