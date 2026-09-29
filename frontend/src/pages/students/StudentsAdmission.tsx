import React, { useState, useEffect, useRef } from 'react';
import { UserPlus, XCircle } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

const HOBBY_OPTIONS = ['Reading', 'Singing', 'Dancing'];

// Kept as a function (not a static object) so every fresh admission after a
// successful submit gets today's date again for admissionDate, not the date
// the page happened to first load.
const emptyCreateFormData = () => ({
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
  hobbies: [] as string[],
});

const emptyGuardianData = () => ({
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

type UploadedFile = { dataUrl: string; name: string; mimeType: string };

// Matches the reference's "text field + Upload button" file-picker pattern —
// a hidden native input triggered by either the button or the read-only
// display field, so the visual doesn't depend on a native file input's
// browser-specific chrome.
const UploadButtonField: React.FC<{
  label: string;
  required?: boolean;
  fileName: string;
  accept: string;
  onFileSelected: (file: File) => void;
  helperText?: string;
}> = ({ label, required, fileName, accept, onFileSelected, helperText }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={fileName}
          placeholder={label}
          onClick={() => inputRef.current?.click()}
          className="input-field flex-1 cursor-pointer bg-slate-50 dark:bg-white/5"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold whitespace-nowrap"
        >
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
            e.target.value = '';
          }}
        />
      </div>
      {helperText && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
};

const StudentsAdmission = () => {
  const [allSections, setAllSections] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [createFormData, setCreateFormData] = useState(emptyCreateFormData);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [photoFileName, setPhotoFileName] = useState('');
  const [birthCertificate, setBirthCertificate] = useState<UploadedFile | null>(null);
  const [lastPassingResult, setLastPassingResult] = useState<UploadedFile | null>(null);

  const [guardianMode, setGuardianMode] = useState<'PARENT' | 'GUARDIAN'>('GUARDIAN');
  const [guardianData, setGuardianData] = useState(emptyGuardianData);
  const [guardianPhotoFileName, setGuardianPhotoFileName] = useState('');
  const [guardianQuery, setGuardianQuery] = useState('');
  const [guardianResults, setGuardianResults] = useState<any[]>([]);
  const [showGuardianDropdown, setShowGuardianDropdown] = useState(false);

  const fetchAllSections = async () => {
    try {
      const res = await apiClient.get('/academics/sections');
      setAllSections(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch class sections', error);
      toast.error('Failed to load class/section list');
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await apiClient.get('/academics/student-categories');
      setCategories(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch student categories', error);
    }
  };

  // Prefills GR Number with a suggested "{year}-{sequence}" value, shown
  // read-only like the reference — the server still enforces uniqueness, so
  // a stale suggestion (e.g. two tabs open at once) surfaces as a normal
  // "already exists" error and re-suggests rather than silently colliding.
  const suggestNextStudentId = async () => {
    try {
      const res = await apiClient.get('/students', { params: { pageSize: 1 } });
      const total = Number(res.data?.meta?.total) || 0;
      const year = new Date().getFullYear();
      const next = String(total + 1).padStart(4, '0');
      setCreateFormData((prev) => ({ ...prev, studentId: `${year}-${next}` }));
    } catch (error) {
      console.error('Failed to suggest next GR number', error);
    }
  };

  useEffect(() => {
    fetchAllSections();
    fetchCategories();
    suggestNextStudentId();
  }, []);

  // Class names are free text (e.g. "Class 9", "Grade 10") — detect the
  // grade by the trailing number so this stays in sync with the same rule
  // enforced server-side in student.service.ts.
  const isDepartmentRequiredForClass = (sectionId: string): boolean => {
    const section = allSections.find((s) => s.id === sectionId);
    const className = section?.class?.name;
    if (!className) return false;
    const match = String(className).match(/(\d+)\s*$/);
    const grade = match ? Number(match[1]) : null;
    return grade === 9 || grade === 10;
  };

  const validateCreateField = (name: string, value: string, formState = createFormData): string => {
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
    if (name === 'rollNumber' && trimmed && !/^[A-Za-z0-9-]{1,50}$/.test(trimmed)) {
      return 'Roll number has invalid characters';
    }
    if (name === 'department' && !trimmed && isDepartmentRequiredForClass(formState.sectionId)) {
      return 'Department is required for Class 9 & 10 students';
    }
    return '';
  };

  const handleCreateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const nextFormState: typeof createFormData = { ...createFormData, [name]: value } as typeof createFormData;
    setCreateFormData(nextFormState);
    if (createErrors[name]) setCreateErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleCreateBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCreateErrors((prev) => ({ ...prev, [name]: validateCreateField(name, value) }));
  };

  const handleClassSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sectionId = e.target.value;
    const section = allSections.find((s) => s.id === sectionId);
    const classId = section?.classId || section?.class?.id || '';
    const nextFormState = { ...createFormData, sectionId, classId };
    setCreateFormData(nextFormState);
    setCreateErrors((prev) => ({ ...prev, department: validateCreateField('department', nextFormState.department, nextFormState) }));
  };

  const toggleHobby = (hobby: string) => {
    setCreateFormData((prev) => {
      const has = prev.hobbies.includes(hobby);
      return { ...prev, hobbies: has ? prev.hobbies.filter((h) => h !== hobby) : [...prev.hobbies, hobby] };
    });
  };

  const compressImage = (file: File): Promise<string> => {
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

          // Get base64 string compressed
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
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoSelected = async (file: File) => {
    const compressed = await compressImage(file);
    setCreateFormData((prev) => ({ ...prev, avatarUrl: compressed }));
    setPhotoFileName(file.name);
  };

  const handleGuardianPhotoSelected = async (file: File) => {
    const compressed = await compressImage(file);
    setGuardianData((prev) => ({ ...prev, avatarUrl: compressed }));
    setGuardianPhotoFileName(file.name);
  };

  const handleDocumentSelected = async (
    file: File,
    setter: React.Dispatch<React.SetStateAction<UploadedFile | null>>,
  ) => {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('File must be under 4MB');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setter({ dataUrl, name: file.name, mimeType: file.type });
  };

  const handleGuardianModeChange = (mode: 'PARENT' | 'GUARDIAN') => {
    setGuardianMode(mode);
    setGuardianData((prev) => ({ ...prev, relationship: mode === 'GUARDIAN' ? 'GUARDIAN' : 'FATHER' }));
  };

  const handleGuardianChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setGuardianData((prev) => ({ ...prev, [name]: value, ...(name !== 'guardianId' ? { guardianId: '' } : {}) }));
    if (name === 'email') setGuardianQuery(value);
  };

  const selectGuardian = (g: any) => {
    setGuardianData({
      guardianId: g.id,
      relationship: g.relationship || 'GUARDIAN',
      firstName: g.firstName || '',
      lastName: g.lastName || '',
      phone: g.phone || '',
      email: g.email || '',
      gender: g.gender || 'MALE',
      dateOfBirth: g.dateOfBirth ? String(g.dateOfBirth).slice(0, 10) : '',
      occupation: g.occupation || '',
      avatarUrl: g.avatarUrl || '',
    });
    setGuardianPhotoFileName(g.avatarUrl ? 'Existing photo' : '');
    setGuardianQuery(g.email || `${g.firstName} ${g.lastName}`);
    setGuardianResults([]);
    setShowGuardianDropdown(false);
  };

  const clearGuardianSelection = () => {
    setGuardianData({ ...emptyGuardianData(), relationship: guardianMode === 'GUARDIAN' ? 'GUARDIAN' : 'FATHER' });
    setGuardianQuery('');
    setGuardianResults([]);
    setGuardianPhotoFileName('');
  };

  const guardianSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleGuardianSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGuardianQuery(value);
    setGuardianData((prev) => ({ ...prev, guardianId: '', email: value }));
    setShowGuardianDropdown(true);

    if (guardianSearchTimeout.current) clearTimeout(guardianSearchTimeout.current);
    if (!value.trim()) {
      setGuardianResults([]);
      return;
    }
    guardianSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiClient.get('/guardians', { params: { search: value.trim(), pageSize: 5 } });
        setGuardianResults(res.data.data || []);
      } catch (error) {
        console.error('Guardian search failed', error);
      }
    }, 300);
  };

  const resetAllState = () => {
    setCreateFormData(emptyCreateFormData());
    setCreateErrors({});
    setPhotoFileName('');
    setBirthCertificate(null);
    setLastPassingResult(null);
    setGuardianMode('GUARDIAN');
    clearGuardianSelection();
    suggestNextStudentId();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fieldsToValidate = ['studentId', 'firstName', 'lastName', 'email', 'password', 'phone', 'rollNumber', 'department'];
    const nextErrors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      const err = validateCreateField(field, (createFormData as any)[field] || '');
      if (err) nextErrors[field] = err;
    }
    if (Object.keys(nextErrors).length > 0) {
      setCreateErrors(nextErrors);
      const firstInvalidField = fieldsToValidate.find((f) => nextErrors[f]);
      if (firstInvalidField) {
        (e.target as HTMLFormElement).querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      }
      toast.error('Please fix the highlighted fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        studentId: createFormData.studentId,
        firstName: createFormData.firstName,
        lastName: createFormData.lastName,
        email: createFormData.email,
        password: createFormData.password,
        phone: createFormData.phone || undefined,
        gender: createFormData.gender,
        classId: createFormData.classId || undefined,
        sectionId: createFormData.sectionId || undefined,
        rollNumber: createFormData.rollNumber || undefined,
        department: createFormData.department || undefined,
        address: createFormData.address || undefined,
        permanentAddress: createFormData.permanentAddress || undefined,
        bloodGroup: createFormData.bloodGroup || undefined,
        religion: createFormData.religion || undefined,
        nationality: createFormData.nationality || undefined,
        avatarUrl: createFormData.avatarUrl || undefined,
        dateOfBirth: createFormData.dateOfBirth || undefined,
        categoryId: createFormData.categoryId || undefined,
        caste: createFormData.caste || undefined,
        admissionDate: createFormData.admissionDate || undefined,
        height: createFormData.height || undefined,
        weight: createFormData.weight || undefined,
        hobbies: createFormData.hobbies.length > 0 ? createFormData.hobbies.join(',') : undefined,
      };
      const created = await apiClient.post('/students', payload);
      const studentId: string = created.data?.data?.id;
      toast.success('Student added successfully');

      // Secondary steps (documents + guardian linking) are best-effort — a
      // failure here shouldn't undo or mask the successful student creation
      // above, since the student can always have these added later from
      // Student Details.
      if (studentId && birthCertificate) {
        try {
          await apiClient.post(`/students/${studentId}/documents`, {
            name: birthCertificate.name,
            type: 'BIRTH_CERT',
            fileUrl: birthCertificate.dataUrl,
            mimeType: birthCertificate.mimeType,
          });
        } catch (err) {
          console.error('Failed to upload birth certificate', err);
          toast.error('Student saved, but the birth certificate upload failed — add it later from Student Details.');
        }
      }

      if (studentId && lastPassingResult) {
        try {
          await apiClient.post(`/students/${studentId}/documents`, {
            name: lastPassingResult.name,
            type: 'LAST_RESULT',
            fileUrl: lastPassingResult.dataUrl,
            mimeType: lastPassingResult.mimeType,
          });
        } catch (err) {
          console.error('Failed to upload last passing result', err);
          toast.error('Student saved, but the last passing result upload failed — add it later from Student Details.');
        }
      }

      const hasGuardianInput = guardianData.guardianId || (guardianData.firstName && guardianData.lastName && guardianData.phone);
      if (studentId && hasGuardianInput) {
        try {
          let guardianId = guardianData.guardianId;
          if (!guardianId) {
            const guardianRes = await apiClient.post('/guardians', {
              firstName: guardianData.firstName,
              lastName: guardianData.lastName,
              relationship: guardianData.relationship,
              phone: guardianData.phone,
              email: guardianData.email || undefined,
              gender: guardianData.gender || undefined,
              occupation: guardianData.occupation || undefined,
              dateOfBirth: guardianData.dateOfBirth || undefined,
              avatarUrl: guardianData.avatarUrl || undefined,
            });
            guardianId = guardianRes.data?.data?.id;
          }
          if (guardianId) {
            await apiClient.post(`/guardians/students/${studentId}/link`, {
              guardianId,
              relationship: guardianData.relationship,
              isPrimary: true,
            });
          }
        } catch (err: any) {
          console.error('Failed to save guardian details', err);
          toast.error(err.response?.data?.message || 'Student saved, but guardian details could not be saved — add them later from the Guardians page.');
        }
      }

      // Admissions-desk flow: clear the form back to empty (with a fresh
      // admissionDate and GR Number suggestion) so the next student can be
      // entered right away, rather than navigating away.
      resetAllState();
    } catch (error: any) {
      console.error('Failed to create student', error);
      toast.error(error.response?.data?.message || 'Failed to create student');
      // A stale GR Number suggestion (two admissions clerks racing) surfaces
      // as a 409 here — refresh it so the next submit attempt has a fresh one.
      if (error.response?.status === 409) {
        suggestNextStudentId();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <UserPlus className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Students Admission</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
            Register a new student. The form clears itself after each submission so you can add the next one right away.
          </p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Students</h3>
        <form onSubmit={handleCreateSubmit} className="space-y-4 max-w-5xl">
          {/* Row: First Name | Last Name | Mobile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name <span className="text-rose-500">*</span></label>
              <input
                type="text"
                name="firstName"
                required
                placeholder="First Name"
                value={createFormData.firstName}
                onChange={handleCreateChange}
                onBlur={handleCreateBlur}
                className={`input-field ${createErrors.firstName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {createErrors.firstName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name <span className="text-rose-500">*</span></label>
              <input
                type="text"
                name="lastName"
                required
                placeholder="Last Name"
                value={createFormData.lastName}
                onChange={handleCreateChange}
                onBlur={handleCreateBlur}
                className={`input-field ${createErrors.lastName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {createErrors.lastName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.lastName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mobile</label>
              <input
                type="text"
                name="phone"
                placeholder="Mobile"
                value={createFormData.phone}
                onChange={handleCreateChange}
                onBlur={handleCreateBlur}
                className={`input-field ${createErrors.phone ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {createErrors.phone && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.phone}</p>}
            </div>
          </div>

          {/* Row: Gender | Image | Date of Birth */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender <span className="text-rose-500">*</span></label>
              <div className="flex items-center gap-6 h-10">
                {(['MALE', 'FEMALE'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={createFormData.gender === g}
                      onChange={handleCreateChange}
                      className="w-4 h-4 accent-primary-500 cursor-pointer"
                    />
                    {g.charAt(0) + g.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
            <UploadButtonField
              label="Image"
              required
              fileName={photoFileName}
              accept="image/*"
              onFileSelected={handlePhotoSelected}
              helperText="Recommended image size: 120x120px (square)"
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth <span className="text-rose-500">*</span></label>
              <input
                type="date"
                name="dateOfBirth"
                value={createFormData.dateOfBirth}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
          </div>

          {/* Row: Class Section | Category | GR Number */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Section</label>
              <select
                name="sectionId"
                value={createFormData.sectionId}
                onChange={handleClassSectionChange}
                className="input-field"
              >
                <option value="">-- Select Class Section --</option>
                {allSections.map((s) => (
                  <option key={s.id} value={s.id}>{s.class?.name} - {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <select
                name="categoryId"
                value={createFormData.categoryId}
                onChange={handleCreateChange}
                className="input-field"
              >
                <option value="">-- Select Category --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">GR Number</label>
              <input
                type="text"
                name="studentId"
                readOnly
                value={createFormData.studentId}
                className="input-field bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 cursor-not-allowed"
              />
              {createErrors.studentId && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.studentId}</p>}
            </div>
          </div>

          {/* Extra (not in the reference — required by this app's existing class-placement rules) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Roll Number</label>
              <input
                type="text"
                name="rollNumber"
                value={createFormData.rollNumber}
                onChange={handleCreateChange}
                onBlur={handleCreateBlur}
                placeholder="e.g. 15"
                className={`input-field ${createErrors.rollNumber ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {createErrors.rollNumber && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.rollNumber}</p>}
            </div>
            {isDepartmentRequiredForClass(createFormData.sectionId) && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Department <span className="text-rose-500">*</span>
                </label>
                <select
                  name="department"
                  required
                  value={createFormData.department}
                  onChange={handleCreateChange}
                  onBlur={handleCreateBlur}
                  className={`input-field ${createErrors.department ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                >
                  <option value="">Select Department</option>
                  <option value="Science">Science</option>
                  <option value="Commerce">Commerce</option>
                  <option value="Arts">Arts</option>
                </select>
                {createErrors.department ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.department}</p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Required for Class 9 &amp; 10 students</p>
                )}
              </div>
            )}
          </div>

          {/* Login Credentials (not in the reference — required to create this app's student portal login) */}
          <div className="pt-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Login Credentials</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Sets up the student's portal login — this account also appears under User Management.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email <span className="text-rose-500">*</span></label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="e.g. john.doe@school.edu"
                  value={createFormData.email}
                  onChange={handleCreateChange}
                  onBlur={handleCreateBlur}
                  className={`input-field ${createErrors.email ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                />
                {createErrors.email && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.email}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password <span className="text-rose-500">*</span></label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={createFormData.password}
                  onChange={handleCreateChange}
                  onBlur={handleCreateBlur}
                  className={`input-field ${createErrors.password ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                />
                {createErrors.password && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.password}</p>}
              </div>
            </div>
          </div>

          {/* Row: Caste | Religion | Admission Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Caste</label>
              <input
                type="text"
                name="caste"
                placeholder="Caste"
                value={createFormData.caste}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Religion</label>
              <input
                type="text"
                name="religion"
                placeholder="Religion"
                value={createFormData.religion}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Admission Date <span className="text-rose-500">*</span></label>
              <input
                type="date"
                name="admissionDate"
                value={createFormData.admissionDate}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
          </div>

          {/* Row: Blood Group | Height | Weight */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blood Group <span className="text-rose-500">*</span></label>
              <select
                name="bloodGroup"
                value={createFormData.bloodGroup}
                onChange={handleCreateChange}
                className="input-field"
              >
                <option value="">Select Blood Group</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Height <span className="text-rose-500">*</span></label>
              <input
                type="text"
                name="height"
                placeholder="Height"
                value={createFormData.height}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Weight <span className="text-rose-500">*</span></label>
              <input
                type="text"
                name="weight"
                placeholder="Weight"
                value={createFormData.weight}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
          </div>

          {/* Current Address (full width) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Address <span className="text-rose-500">*</span></label>
            <input
              type="text"
              name="address"
              placeholder="Current Address"
              value={createFormData.address}
              onChange={handleCreateChange}
              className="input-field"
            />
          </div>

          {/* Permanent Address (full width) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Permanent Address <span className="text-rose-500">*</span></label>
            <input
              type="text"
              name="permanentAddress"
              placeholder="Permanent Address"
              value={createFormData.permanentAddress}
              onChange={handleCreateChange}
              className="input-field"
            />
          </div>

          {/* Row: Birth Certificate | Hobby | Nationality */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UploadButtonField
              label="Birth Certificate"
              required
              fileName={birthCertificate?.name || ''}
              accept="image/*,application/pdf"
              onFileSelected={(file) => handleDocumentSelected(file, setBirthCertificate)}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Hobby</label>
              <div className="space-y-2">
                {HOBBY_OPTIONS.map((hobby) => (
                  <label key={hobby} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createFormData.hobbies.includes(hobby)}
                      onChange={() => toggleHobby(hobby)}
                      className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer"
                    />
                    {hobby}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nationality <span className="text-rose-500">*</span></label>
              <input
                type="text"
                name="nationality"
                placeholder="Nationality"
                value={createFormData.nationality}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
          </div>

          {/* Row: Last Passing Result */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UploadButtonField
              label="Last Passing Result"
              required
              fileName={lastPassingResult?.name || ''}
              accept="image/*,application/pdf"
              onFileSelected={(file) => handleDocumentSelected(file, setLastPassingResult)}
            />
          </div>

          {/* Parents / Guardian toggle */}
          <div className="pt-2 border-t border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-6 mt-4 mb-4">
              <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  checked={guardianMode === 'PARENT'}
                  onChange={() => handleGuardianModeChange('PARENT')}
                  className="w-4 h-4 accent-primary-500 cursor-pointer"
                />
                Parents Details
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  checked={guardianMode === 'GUARDIAN'}
                  onChange={() => handleGuardianModeChange('GUARDIAN')}
                  className="w-4 h-4 accent-primary-500 cursor-pointer"
                />
                Guardian Details
              </label>
            </div>

            {guardianMode === 'PARENT' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Relationship</label>
                <div className="flex items-center gap-6 h-10">
                  {(['FATHER', 'MOTHER'] as const).map((rel) => (
                    <label key={rel} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="relationship"
                        value={rel}
                        checked={guardianData.relationship === rel}
                        onChange={handleGuardianChange}
                        className="w-4 h-4 accent-primary-500 cursor-pointer"
                      />
                      {rel.charAt(0) + rel.slice(1).toLowerCase()}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Guardian Email (full width) */}
            <div className="mb-4 relative">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guardian Email <span className="text-rose-500">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  value={guardianQuery}
                  onChange={handleGuardianSearchChange}
                  onFocus={() => setShowGuardianDropdown(true)}
                  onBlur={() => setTimeout(() => setShowGuardianDropdown(false), 150)}
                  placeholder="Search for Guardian Email"
                  className="input-field pr-9"
                />
                {guardianData.guardianId && (
                  <button
                    type="button"
                    onClick={clearGuardianSelection}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
                    title="Clear selected guardian"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showGuardianDropdown && guardianResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-lg max-h-48 overflow-y-auto">
                  {guardianResults.map((g) => (
                    <button
                      type="button"
                      key={g.id}
                      onMouseDown={() => selectGuardian(g)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-primary-500/10 text-slate-700 dark:text-slate-200"
                    >
                      <div className="font-medium">{g.firstName} {g.lastName}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{g.email || g.phone}</div>
                    </button>
                  ))}
                </div>
              )}
              {guardianData.guardianId && (
                <p className="text-xs text-accent-600 dark:text-accent-400 mt-1">Linking existing guardian — fields below are read-only.</p>
              )}
            </div>

            {/* Row: Guardian First Name | Guardian Last Name | Guardian Mobile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guardian First Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  name="firstName"
                  value={guardianData.firstName}
                  onChange={handleGuardianChange}
                  readOnly={!!guardianData.guardianId}
                  placeholder="Guardian First Name"
                  className={`input-field ${guardianData.guardianId ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guardian Last Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  name="lastName"
                  value={guardianData.lastName}
                  onChange={handleGuardianChange}
                  readOnly={!!guardianData.guardianId}
                  placeholder="Guardian Last Name"
                  className={`input-field ${guardianData.guardianId ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guardian Mobile <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  name="phone"
                  value={guardianData.phone}
                  onChange={handleGuardianChange}
                  readOnly={!!guardianData.guardianId}
                  placeholder="Guardian Mobile"
                  className={`input-field ${guardianData.guardianId ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>

            {/* Row: Gender (guardian's) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender <span className="text-rose-500">*</span></label>
                <div className="flex items-center gap-6 h-10">
                  {(['MALE', 'FEMALE'] as const).map((g) => (
                    <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={guardianData.gender === g}
                        onChange={handleGuardianChange}
                        disabled={!!guardianData.guardianId}
                        className="w-4 h-4 accent-primary-500 cursor-pointer"
                      />
                      {g.charAt(0) + g.slice(1).toLowerCase()}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Row: Guardian Date of Birth | Guardian Occupation | Guardian Image */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guardian Date of Birth <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={guardianData.dateOfBirth}
                  onChange={handleGuardianChange}
                  readOnly={!!guardianData.guardianId}
                  className={`input-field ${guardianData.guardianId ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guardian Occupation <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  name="occupation"
                  value={guardianData.occupation}
                  onChange={handleGuardianChange}
                  readOnly={!!guardianData.guardianId}
                  placeholder="Guardian Occupation"
                  className={`input-field ${guardianData.guardianId ? 'opacity-70 cursor-not-allowed' : ''}`}
                />
              </div>
              {!guardianData.guardianId ? (
                <UploadButtonField
                  label="Guardian Image"
                  required
                  fileName={guardianPhotoFileName}
                  accept="image/*"
                  onFileSelected={handleGuardianPhotoSelected}
                />
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guardian Image</label>
                  {guardianData.avatarUrl && (
                    <img
                      src={guardianData.avatarUrl}
                      alt="Guardian preview"
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10"
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 flex justify-start gap-3">
            <Button type="submit" variant="gradient" isLoading={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Submit'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentsAdmission;
