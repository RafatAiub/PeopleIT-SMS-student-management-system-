// Shared types for the Students Admission wizard. Field names, defaults and
// shapes are unchanged from the original single-page form — only the layout
// was split into steps.

export interface CreateFormData {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  gender: 'MALE' | 'FEMALE';
  classId: string;
  sectionId: string;
  rollNumber: string;
  department: string;
  address: string;
  permanentAddress: string;
  bloodGroup: string;
  religion: string;
  nationality: string;
  avatarUrl: string;
  dateOfBirth: string;
  categoryId: string;
  caste: string;
  admissionDate: string;
  height: string;
  weight: string;
  hobbies: string[];
  // Optional profile extras (Wave C) — never required by the wizard.
  previousSchool: string;
  previousClass: string;
  medicalNotes: string;
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
}

export interface GuardianFormData {
  guardianId: string;
  relationship: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  occupation: string;
  avatarUrl: string;
}

export type UploadedFile = { dataUrl: string; name: string; mimeType: string };

export type GuardianMode = 'PARENT' | 'GUARDIAN';

export interface SectionOption {
  id: string;
  name: string;
  classId?: string;
  class?: { id?: string; name?: string };
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface GuardianSearchResult {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  occupation?: string;
  avatarUrl?: string;
  relationship?: string;
}

/** Data shown on the post-submit "Result" (credentials) screen. Only echoes
 * what the admissions clerk just typed in — nothing fetched or invented. */
export interface AdmissionResult {
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  sectionLabel: string;
  categoryLabel: string;
  guardianName: string;
}

export const WIZARD_STEP_COUNT = 5;

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export const STEP_TITLES: Record<WizardStep, string> = {
  1: 'Student Details',
  2: 'Academic Placement',
  3: 'Guardian',
  4: 'Photo & Documents',
  5: 'Review & Submit',
};
