// =============================================================================
// Onboarding checklist — pure computation from real counts (no DB).
// Unit-tested in tests/saas-logic.test.ts.
//
// A step is `done` when the underlying data exists. An admin may also mark a
// step as skipped (e.g. a coaching centre with no grading scale); skipped
// keys are persisted in OnboardingProgress.completedSteps.
// =============================================================================

export interface OnboardingFacts {
  profileComplete: boolean;
  hasLogo: boolean;
  academicYears: number;
  classes: number;
  sections: number;
  subjects: number;
  teachers: number;
  students: number;
  feeHeads: number;
  /** null when the grading tables aren't available yet (migration pending). */
  gradingScales: number | null;
  notices: number;
}

export interface OnboardingStepDef {
  key: string;
  title: string;
  description: string;
  href: string;
  /** Optional steps don't block "setup complete". */
  optional?: boolean;
  isDone: (f: OnboardingFacts) => boolean;
  count?: (f: OnboardingFacts) => number | null;
}

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    key: 'profile',
    title: 'Complete institution profile',
    description: 'Add your school’s name, phone, email and address.',
    href: '/settings?tab=profile',
    isDone: (f) => f.profileComplete,
  },
  {
    key: 'logo',
    title: 'Upload your logo',
    description: 'Shown on the sidebar, ID cards, receipts and report cards.',
    href: '/settings?tab=profile',
    isDone: (f) => f.hasLogo,
  },
  {
    key: 'academic_year',
    title: 'Create an academic year',
    description: 'Session years anchor admissions, results and promotion.',
    href: '/academics/session-years',
    isDone: (f) => f.academicYears > 0,
    count: (f) => f.academicYears,
  },
  {
    key: 'classes',
    title: 'Add classes',
    description: 'Set up the classes your institution teaches.',
    href: '/academics/classes',
    isDone: (f) => f.classes > 0,
    count: (f) => f.classes,
  },
  {
    key: 'sections',
    title: 'Add sections',
    description: 'Split classes into sections such as A and B.',
    href: '/academics/sections',
    isDone: (f) => f.sections > 0,
    count: (f) => f.sections,
  },
  {
    key: 'subjects',
    title: 'Add subjects',
    description: 'Subjects drive timetables, exams and marksheets.',
    href: '/academics/subjects',
    isDone: (f) => f.subjects > 0,
    count: (f) => f.subjects,
  },
  {
    key: 'teacher',
    title: 'Add at least one teacher',
    description: 'Teachers take attendance and enter marks.',
    href: '/teacher/add',
    isDone: (f) => f.teachers > 0,
    count: (f) => f.teachers,
  },
  {
    key: 'students',
    title: 'Admit students',
    description: 'Add students one by one or import a spreadsheet.',
    href: '/students/admission',
    isDone: (f) => f.students > 0,
    count: (f) => f.students,
  },
  {
    key: 'fee_heads',
    title: 'Set up fee heads',
    description: 'Tuition, admission, exam and other fee categories.',
    href: '/fees',
    isDone: (f) => f.feeHeads > 0,
    count: (f) => f.feeHeads,
  },
  {
    key: 'grading_scale',
    title: 'Configure a grading scale',
    description: 'Grade bands and GPA used on report cards.',
    href: '/grading',
    optional: true,
    isDone: (f) => (f.gradingScales ?? 0) > 0,
    count: (f) => f.gradingScales,
  },
  {
    key: 'notices',
    title: 'Publish your first notice',
    description: 'Let staff, students and guardians know you’re live.',
    href: '/notices',
    optional: true,
    isDone: (f) => f.notices > 0,
    count: (f) => f.notices,
  },
];

export const ONBOARDING_STEP_KEYS = ONBOARDING_STEPS.map((s) => s.key);

export interface OnboardingItem {
  key: string;
  title: string;
  description: string;
  href: string;
  optional: boolean;
  done: boolean;
  skipped: boolean;
  count: number | null;
}

export interface OnboardingChecklist {
  items: OnboardingItem[];
  completed: number; // done or skipped
  total: number;
  percent: number;
  requiredRemaining: number;
  allDone: boolean;
  dismissed: boolean;
  nextStep: OnboardingItem | null;
}

export function computeChecklist(
  facts: OnboardingFacts,
  progress: { skippedSteps: string[]; dismissed: boolean },
): OnboardingChecklist {
  const skipped = new Set(progress.skippedSteps);
  const items: OnboardingItem[] = ONBOARDING_STEPS.map((s) => {
    const done = s.isDone(facts);
    return {
      key: s.key,
      title: s.title,
      description: s.description,
      href: s.href,
      optional: Boolean(s.optional),
      done,
      skipped: !done && skipped.has(s.key),
      count: s.count ? s.count(facts) : null,
    };
  });
  const completed = items.filter((i) => i.done || i.skipped).length;
  const requiredRemaining = items.filter((i) => !i.optional && !i.done && !i.skipped).length;
  const total = items.length;
  return {
    items,
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    requiredRemaining,
    allDone: completed === total,
    dismissed: progress.dismissed,
    nextStep: items.find((i) => !i.done && !i.skipped) ?? null,
  };
}

/** Apply a skip/unskip to the stored list, ignoring unknown keys. */
export function updateSkipped(current: string[], skip?: string, unskip?: string): string[] {
  const set = new Set(current.filter((k) => ONBOARDING_STEP_KEYS.includes(k)));
  if (skip && ONBOARDING_STEP_KEYS.includes(skip)) set.add(skip);
  if (unskip) set.delete(unskip);
  return ONBOARDING_STEP_KEYS.filter((k) => set.has(k));
}
