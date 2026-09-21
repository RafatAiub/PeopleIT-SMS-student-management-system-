import React, { useState, useEffect } from 'react';
import { UserPlus } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

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
});

const StudentsAdmission = () => {
  const [classes, setClasses] = useState<any[]>([]);
  const [createSections, setCreateSections] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [createFormData, setCreateFormData] = useState(emptyCreateFormData);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchClasses = async () => {
    try {
      const response = await apiClient.get('/students/meta/classes');
      setClasses(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch classes metadata', error);
      toast.error('Failed to load class list');
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

  useEffect(() => {
    fetchClasses();
    fetchCategories();
  }, []);

  // Class names are free text (e.g. "Class 9", "Grade 10") — detect the
  // grade by the trailing number so this stays in sync with the same rule
  // enforced server-side in student.service.ts.
  const isDepartmentRequiredForClass = (classId: string): boolean => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls?.name) return false;
    const match = String(cls.name).match(/(\d+)\s*$/);
    const grade = match ? Number(match[1]) : null;
    return grade === 9 || grade === 10;
  };

  const fetchSectionsForCreate = async (classId: string) => {
    if (!classId) {
      setCreateSections([]);
      setCreateFormData((prev) => ({ ...prev, sectionId: '' }));
      return;
    }
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      setCreateSections(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch sections', err);
    }
  };

  const validateCreateField = (name: string, value: string, formState = createFormData): string => {
    const trimmed = value.trim();
    if (name === 'studentId') {
      if (!trimmed) return 'Student ID is required';
      if (!/^[A-Za-z0-9/_-]{2,50}$/.test(trimmed)) return 'Use only letters, numbers, - / _ (2-50 characters)';
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
    if (name === 'department' && !trimmed && isDepartmentRequiredForClass(formState.classId)) {
      return 'Department is required for Class 9 & 10 students';
    }
    return '';
  };

  const handleCreateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const nextFormState = { ...createFormData, [name]: value };
    setCreateFormData(nextFormState);
    if (createErrors[name]) setCreateErrors((prev) => ({ ...prev, [name]: '' }));

    if (name === 'classId') {
      fetchSectionsForCreate(value);
      // Re-validate department against the newly selected class immediately,
      // so switching into Class 9/10 surfaces the requirement right away.
      setCreateErrors((prev) => ({ ...prev, department: validateCreateField('department', nextFormState.department, nextFormState) }));
    }
  };

  const handleCreateBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCreateErrors((prev) => ({ ...prev, [name]: validateCreateField(name, value) }));
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

  const handleCreatePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file);
      setCreateFormData((prev) => ({ ...prev, avatarUrl: compressed }));
    }
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
      };
      await apiClient.post('/students', payload);
      toast.success('Student added successfully');
      // Admissions-desk flow: clear the form back to empty (with a fresh
      // admissionDate) so the next student can be entered right away,
      // rather than navigating away.
      setCreateFormData(emptyCreateFormData());
      setCreateErrors({});
      setCreateSections([]);
    } catch (error: any) {
      console.error('Failed to create student', error);
      toast.error(error.response?.data?.message || 'Failed to create student');
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

      <div className="glass-card p-6 rounded-2xl max-w-3xl">
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student ID / Admission No</label>
            <input
              type="text"
              name="studentId"
              required
              placeholder="e.g. STU-2026-001"
              value={createFormData.studentId}
              onChange={handleCreateChange}
              onBlur={handleCreateBlur}
              className={`input-field ${createErrors.studentId ? 'border-rose-500 focus:ring-rose-500' : ''}`}
            />
            {createErrors.studentId && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.studentId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name</label>
              <input
                type="text"
                name="firstName"
                required
                placeholder="e.g. John"
                value={createFormData.firstName}
                onChange={handleCreateChange}
                onBlur={handleCreateBlur}
                className={`input-field ${createErrors.firstName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {createErrors.firstName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
              <input
                type="text"
                name="lastName"
                required
                placeholder="e.g. Doe"
                value={createFormData.lastName}
                onChange={handleCreateChange}
                onBlur={handleCreateBlur}
                className={`input-field ${createErrors.lastName ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {createErrors.lastName && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.lastName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class</label>
              <select
                name="classId"
                value={createFormData.classId}
                onChange={handleCreateChange}
                className="input-field"
              >
                <option value="">-- No Class Assigned --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Section</label>
              <select
                name="sectionId"
                value={createFormData.sectionId}
                onChange={handleCreateChange}
                disabled={!createFormData.classId}
                className="input-field disabled:opacity-50"
              >
                <option value="">-- Select Section --</option>
                {createSections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {isDepartmentRequiredForClass(createFormData.classId) && (
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

          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender</label>
              <select
                name="gender"
                value={createFormData.gender}
                onChange={handleCreateChange}
                className="input-field appearance-none"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Phone</label>
              <input
                type="text"
                name="phone"
                placeholder="e.g. +8801700000000"
                value={createFormData.phone}
                onChange={handleCreateChange}
                onBlur={handleCreateBlur}
                className={`input-field ${createErrors.phone ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {createErrors.phone && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.phone}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
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
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Login Password</label>
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
            {createErrors.password ? (
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{createErrors.password}</p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sets up the student's login — this account also appears under User Management.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blood Group</label>
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Religion</label>
              <select
                name="religion"
                value={createFormData.religion}
                onChange={handleCreateChange}
                className="input-field"
              >
                <option value="">Select Religion</option>
                <option value="Islam">Islam</option>
                <option value="Hinduism">Hinduism</option>
                <option value="Christianity">Christianity</option>
                <option value="Buddhism">Buddhism</option>
                <option value="Others">Others</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nationality</label>
              <input
                type="text"
                name="nationality"
                placeholder="e.g. Bangladeshi"
                value={createFormData.nationality}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Profile Photo</label>
              {createFormData.avatarUrl && (
                <img
                  src={createFormData.avatarUrl}
                  alt="Preview"
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-white/10 mb-2"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleCreatePhotoChange}
                className="w-full text-slate-700 dark:text-slate-300 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-600/10 file:text-primary-600 dark:file:text-primary-400 hover:file:bg-primary-600/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth</label>
              <input
                type="date"
                name="dateOfBirth"
                value={createFormData.dateOfBirth}
                onChange={handleCreateChange}
                className="input-field"
              />
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Caste</label>
              <input
                type="text"
                name="caste"
                placeholder="e.g. General"
                value={createFormData.caste}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Admission Date</label>
              <input
                type="date"
                name="admissionDate"
                value={createFormData.admissionDate}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Height</label>
              <input
                type="text"
                name="height"
                placeholder="e.g. 4'8&quot;"
                value={createFormData.height}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Weight</label>
              <input
                type="text"
                name="weight"
                placeholder="e.g. 35 kg"
                value={createFormData.weight}
                onChange={handleCreateChange}
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Address</label>
            <textarea
              name="address"
              rows={2}
              value={createFormData.address}
              onChange={handleCreateChange}
              placeholder="Enter permanent address"
              className="input-field resize-none"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="submit" variant="gradient" isLoading={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Student'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentsAdmission;
