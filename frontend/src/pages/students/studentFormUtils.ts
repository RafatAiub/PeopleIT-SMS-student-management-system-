// Shared helpers for the student edit form (StudentEditDrawer), used by both
// the staff list view and the student self-service portal view. Kept next to
// the pages that use it rather than in components/ (private to this screen).

export interface ClassMeta {
  id: string;
  name: string;
}

export interface EditFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: string;
  classId: string;
  sectionId: string;
  rollNumber: string;
  department: string;
  status: string;
  address: string;
  bloodGroup: string;
  religion: string;
  nationality: string;
  avatarUrl: string;
}

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const RELIGIONS = ['Islam', 'Hinduism', 'Christianity', 'Buddhism', 'Others'];

export const emptyEditFormData: EditFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  gender: 'MALE',
  classId: '',
  sectionId: '',
  rollNumber: '',
  department: '',
  status: 'ACTIVE',
  address: '',
  bloodGroup: '',
  religion: '',
  nationality: 'Bangladeshi',
  avatarUrl: '',
};

// Class names are free text (e.g. "Class 9", "Grade 10") — detect the grade
// by the trailing number so this stays in sync with the same rule enforced
// server-side in student.service.ts.
export function isDepartmentRequiredForClass(classId: string, classes: ClassMeta[]): boolean {
  const cls = classes.find((c) => c.id === classId);
  if (!cls?.name) return false;
  const match = String(cls.name).match(/(\d+)\s*$/);
  const grade = match ? Number(match[1]) : null;
  return grade === 9 || grade === 10;
}

export function validateEditField(
  name: string,
  value: string,
  formState: EditFormData,
  classes: ClassMeta[],
): string {
  if (name === 'firstName' && !value.trim()) return 'First name is required';
  if (name === 'lastName' && !value.trim()) return 'Last name is required';
  if (name === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
  if (name === 'department' && !value.trim() && isDepartmentRequiredForClass(formState.classId, classes)) {
    return 'Department is required for Class 9 & 10 students';
  }
  return '';
}

export function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = () => {
        resolve(event.target?.result as string);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      resolve('');
    };
    reader.readAsDataURL(file);
  });
}
