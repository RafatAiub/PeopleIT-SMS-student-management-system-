export type UserRoleValue =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TEACHER'
  | 'STUDENT'
  | 'GUARDIAN'
  | 'ACCOUNTANT'
  | 'LIBRARIAN'
  | 'TRANSPORT_OFFICER'
  | 'MANAGEMENT';

export interface StudentProfile {
  id: string;
  rollNumber: string | null;
  admissionDate: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  religion: string | null;
  nationality: string | null;
  address: string | null;
  classId: string | null;
  sectionId: string | null;
}

export interface TeacherProfile {
  id: string;
  qualification: string | null;
  subjectExpertise: string | null;
  joiningDate: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  address: string | null;
  permanentAddress: string | null;
  canManageStudents: boolean | null;
}

export interface GuardianLinkedStudent {
  isPrimary: boolean;
  student: { id: string; studentId: string; firstName: string; lastName: string };
}

export interface GuardianProfile {
  id: string;
  relationship: string | null;
  occupation: string | null;
  nidNumber: string | null;
  emergencyPhone: string | null;
  students: GuardianLinkedStudent[];
}

export interface UserRow {
  id: string;
  email: string;
  role: UserRoleValue;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  studentProfile: StudentProfile | null;
  teacherProfile: TeacherProfile | null;
  guardianProfile: GuardianProfile | null;
}

export interface ClassOption {
  id: string;
  name: string;
}

export interface SectionOption {
  id: string;
  name: string;
}

export interface StudentOption {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
}

// Roles assignable by a non-super-admin. SUPER_ADMIN is only ever offered
// (and only ever editable) when the acting user is themselves a super admin —
// the backend returns 403 for anyone else creating/updating one.
export const ASSIGNABLE_ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'STUDENT', label: 'Student' },
  { value: 'GUARDIAN', label: 'Guardian' },
];

export const SUPER_ADMIN_ROLE_OPTION = { value: 'SUPER_ADMIN', label: 'Super Admin' };

export const RELATIONSHIP_OPTIONS = ['FATHER', 'MOTHER', 'GUARDIAN'];

export interface AddUserFormValues {
  email: string;
  password: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string;
  // Student specifics
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  religion: string;
  nationality: string;
  address: string;
  admissionDate: string;
  rollNumber: string;
  classId: string;
  sectionId: string;
  // Teacher specifics
  qualification: string;
  subjectExpertise: string;
  joiningDate: string;
  // Guardian specifics
  relationship: string;
}

export interface EditUserFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  isActive: boolean;
  avatarUrl: string;
  // Student specifics
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  religion: string;
  nationality: string;
  address: string;
  admissionDate: string;
  rollNumber: string;
  classId: string;
  sectionId: string;
  // Teacher specifics
  qualification: string;
  subjectExpertise: string;
  joiningDate: string;
  // Guardian specifics
  relationship: string;
}

const todayIso = () => new Date().toISOString().split('T')[0];

export function emptyAddUserForm(): AddUserFormValues {
  return {
    email: '',
    password: '',
    role: 'TEACHER',
    firstName: '',
    lastName: '',
    phone: '',
    avatarUrl: '',
    dateOfBirth: '',
    gender: 'Male',
    bloodGroup: 'A+',
    religion: 'Islam',
    nationality: 'Bangladeshi',
    address: '',
    admissionDate: todayIso(),
    rollNumber: '',
    classId: '',
    sectionId: '',
    qualification: '',
    subjectExpertise: '',
    joiningDate: todayIso(),
    relationship: 'FATHER',
  };
}

export type PendingRole = 'STUDENT' | 'GUARDIAN' | 'TEACHER';

export interface PendingRegistration {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  requestedRole: PendingRole;
  emailVerified: boolean;
  createdAt: string;
}
