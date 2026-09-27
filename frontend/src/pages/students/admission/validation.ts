// Validation rules copied verbatim from the original StudentsAdmission.tsx —
// same fields, same regexes, same messages. Only reorganised so each wizard
// step can run just its own subset, plus a full pass before the final submit.

import type { CreateFormData, GuardianFormData, SectionOption, WizardStep } from './types';

export const HOBBY_OPTIONS = ['Reading', 'Singing', 'Dancing'];

// Kept as a function (not a static object) so every fresh admission after a
// successful submit gets today's date again for admissionDate, not the date
// the page happened to first load.
export const emptyCreateFormData = (): CreateFormData => ({
  studentId: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  gender: 'MALE',
  classId: '',
  sectionId: '',
  rollNumber: '',
  department: '',
  address: '',
  permanentAddress: '',
  bloodGroup: '',
  religion: '',
  nationality: 'Bangladeshi',
  avatarUrl: '',
  dateOfBirth: '',
  categoryId: '',
  caste: '',
  admissionDate: new Date().toISOString().slice(0, 10),
  height: '',
  weight: '',
  hobbies: [],
  previousSchool: '',
  previousClass: '',
  medicalNotes: '',
  allergies: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
});

export const emptyGuardianData = (): GuardianFormData => ({
  guardianId: '',
  relationship: 'GUARDIAN',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  gender: 'MALE',
  dateOfBirth: '',
  occupation: '',
  avatarUrl: '',
});

// Class names are free text (e.g. "Class 9", "Grade 10") — detect the
// grade by the trailing number so this stays in sync with the same rule
// enforced server-side in student.service.ts.
export const isDepartmentRequiredForClass = (sections: SectionOption[], sectionId: string): boolean => {
  const section = sections.find((s) => s.id === sectionId);
  const className = section?.class?.name;
  if (!className) return false;
  const match = String(className).match(/(\d+)\s*$/);
  const grade = match ? Number(match[1]) : null;
  return grade === 9 || grade === 10;
};

export const validateCreateField = (
  name: string,
  value: string,
  formState: CreateFormData,
  sections: SectionOption[],
): string => {
  const trimmed = value.trim();
  if (name === 'studentId') {
    if (!trimmed) return 'GR Number is required';
  }
  if (name === 'firstName') {
    if (!trimmed) return 'First name is required';
    if (trimmed.length > 100) return 'First name must be under 100 characters';
    if (!/^[A-Za-z .'-]+$/.test(trimmed)) return 'First name has invalid characters';
  }
  if (name === 'lastName') {
    if (!trimmed) return 'Last name is required';
    if (trimmed.length > 100) return 'Last name must be under 100 characters';
    if (!/^[A-Za-z .'-]+$/.test(trimmed)) return 'Last name has invalid characters';
  }
  if (name === 'email') {
    if (!trimmed) return 'Email is required to create the student login';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address';
  }
  if (name === 'password' && value.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (name === 'phone' && trimmed && !/^[+]?[\d\s()-]{7,20}$/.test(trimmed)) {
    return 'Enter a valid phone number';
  }
  // Optional — only checked when something was typed.
  if (name === 'emergencyContactPhone' && trimmed && !/^[+]?[\d\s()-]{7,20}$/.test(trimmed)) {
    return 'Enter a valid phone number';
  }
  if (name === 'rollNumber' && trimmed && !/^[A-Za-z0-9-]{1,50}$/.test(trimmed)) {
    return 'Roll number has invalid characters';
  }
  if (name === 'department' && !trimmed && isDepartmentRequiredForClass(sections, formState.sectionId)) {
    return 'Department is required for Class 9 & 10 students';
  }
  return '';
};

// Which of the rule-checked fields live on which wizard step — used to run
// only that step's validations on "Next", and all of them before submit.
export const STEP_FIELDS: Record<WizardStep, string[]> = {
  1: ['firstName', 'lastName', 'email', 'password', 'phone', 'emergencyContactPhone'],
  2: ['studentId', 'rollNumber', 'department'],
  3: [],
  4: [],
  5: [],
};

// Exactly the fields validated by the original submit handler, in the same
// order (used for focusing the first invalid field and for the final gate).
export const SUBMIT_VALIDATION_FIELDS = ['studentId', 'firstName', 'lastName', 'email', 'password', 'phone', 'emergencyContactPhone', 'rollNumber', 'department'];

export const validateFields = (
  fields: string[],
  formState: CreateFormData,
  sections: SectionOption[],
): Record<string, string> => {
  const next: Record<string, string> = {};
  for (const field of fields) {
    const raw = formState[field as keyof CreateFormData];
    const value = typeof raw === 'string' ? raw : '';
    const err = validateCreateField(field, value, formState, sections);
    if (err) next[field] = err;
  }
  return next;
};
