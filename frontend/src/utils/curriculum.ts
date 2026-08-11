// Shared NCTB-aligned curriculum helpers — used by MarksEntry.tsx (exam
// marks entry) and TimetableGrid.tsx (routine builder palette) so both
// features draw subjects from the same class/department taxonomy instead of
// maintaining separate lists that can silently drift apart. The real source
// of truth is the backend GET /curriculum/subjects endpoint (`curriculum`
// module, SubjectOffering model); everything here is the client-side
// fallback used when that institution has no SubjectOffering rows seeded
// yet, or the request fails.

export const DEPARTMENTS = ['Science', 'Commerce', 'Arts', 'None'];

export const isSeniorClass = (className: string): boolean =>
  className.includes('9') || className.includes('10') || className.includes('11') || className.includes('12');

export const FALLBACK_SUBJECTS_JUNIOR = [
  'Bangla', 'English', 'Mathematics', 'General Science', 'Social Science', 'Religion & Moral Education', 'ICT'
];

const FALLBACK_COMPULSORY_SENIOR = [
  'Bangla 1st Paper', 'Bangla 2nd Paper', 'English 1st Paper', 'English 2nd Paper', 'General Mathematics', 'Religion & Moral Education', 'ICT'
];

const FALLBACK_SCIENCE_SUBJECTS = ['Physics', 'Chemistry', 'Higher Mathematics', 'Biology'];
const FALLBACK_COMMERCE_SUBJECTS = ['Accounting', 'Finance & Banking', 'Business Entrepreneurship', 'General Science'];
const FALLBACK_ARTS_SUBJECTS = ['History', 'Geography', 'Economics', 'Civics', 'General Science'];

export function getFallbackSubjects(className: string, dept: string): string[] {
  if (!isSeniorClass(className) || dept === 'None') {
    return FALLBACK_SUBJECTS_JUNIOR;
  }

  if (dept === 'Science') return [...FALLBACK_COMPULSORY_SENIOR, ...FALLBACK_SCIENCE_SUBJECTS];
  if (dept === 'Commerce') return [...FALLBACK_COMPULSORY_SENIOR, ...FALLBACK_COMMERCE_SUBJECTS];
  if (dept === 'Arts') return [...FALLBACK_COMPULSORY_SENIOR, ...FALLBACK_ARTS_SUBJECTS];

  return FALLBACK_SUBJECTS_JUNIOR;
}
