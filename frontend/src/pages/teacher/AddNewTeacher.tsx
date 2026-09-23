import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';

const emptyFormData = () => ({
  firstName: '',
  lastName: '',
  gender: 'MALE',
  email: '',
  password: '',
  phone: '',
  avatarUrl: '',
  dateOfBirth: '',
  qualification: '',
  address: '',
  permanentAddress: '',
  canManageStudents: false,
});

const AddNewTeacher = () => {
  const [formData, setFormData] = useState(emptyFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [photoFileName, setPhotoFileName] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX = 400;
          let { width, height } = img;
          if (width > height) {
            if (width > MAX) { height = Math.round((height * MAX) / width); width = MAX; }
          } else if (height > MAX) { width = Math.round((width * MAX) / height); height = MAX; }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => resolve(event.target?.result as string);
        img.src = event.target?.result as string;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setFormData((prev) => ({ ...prev, avatarUrl: compressed }));
    setPhotoFileName(file.name);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.firstName.trim()) errs.firstName = 'First name is required';
    if (!formData.lastName.trim()) errs.lastName = 'Last name is required';
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errs.email = 'Enter a valid email address';
    if (!formData.password || formData.password.length < 8) errs.password = 'Password must be at least 8 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/users', {
        role: 'TEACHER',
        firstName: formData.firstName,
        lastName: formData.lastName,
        gender: formData.gender,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || undefined,
        avatarUrl: formData.avatarUrl || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        qualification: formData.qualification || undefined,
        address: formData.address || undefined,
        permanentAddress: formData.permanentAddress || undefined,
        canManageStudents: formData.canManageStudents,
      });
      toast.success('Teacher added successfully');
      setFormData(emptyFormData());
      setPhotoFileName('');
      setErrors({});
    } catch (error: any) {
      console.error('Failed to create teacher', error);
      toast.error(error.response?.data?.message || 'Failed to create teacher');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
          <UserPlus className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Add New Teacher</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Register a new teacher account.</p>
        </div>
      </div>

      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Create Teacher</h3>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">First Name <span className="text-rose-500">*</span></label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder="First Name"
                className={`input-field ${errors.firstName ? 'border-rose-500' : ''}`} />
              {errors.firstName && <p className="text-xs text-rose-600 mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Last Name <span className="text-rose-500">*</span></label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Last Name"
                className={`input-field ${errors.lastName ? 'border-rose-500' : ''}`} />
              {errors.lastName && <p className="text-xs text-rose-600 mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gender <span className="text-rose-500">*</span></label>
              <div className="flex items-center gap-6 h-10">
                {(['MALE', 'FEMALE'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input type="radio" checked={formData.gender === g} onChange={() => setFormData((p) => ({ ...p, gender: g }))}
                      className="w-4 h-4 accent-primary-500 cursor-pointer" />
                    {g.charAt(0) + g.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email <span className="text-rose-500">*</span></label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Email"
                className={`input-field ${errors.email ? 'border-rose-500' : ''}`} />
              {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mobile</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} placeholder="Mobile" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Image</label>
              <div className="flex gap-2">
                <input type="text" readOnly value={photoFileName} placeholder="Image"
                  onClick={() => document.getElementById('teacher-photo-input')?.click()}
                  className="input-field flex-1 cursor-pointer bg-slate-50 dark:bg-white/5" />
                <button type="button" onClick={() => document.getElementById('teacher-photo-input')?.click()}
                  className="px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold whitespace-nowrap">Upload</button>
                <input id="teacher-photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Recommended image size: 120x120px (square)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date of Birth <span className="text-rose-500">*</span></label>
              <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Qualification <span className="text-rose-500">*</span></label>
              <input type="text" name="qualification" value={formData.qualification} onChange={handleChange} placeholder="Qualification" className="input-field" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Address <span className="text-rose-500">*</span></label>
              <input type="text" name="address" value={formData.address} onChange={handleChange} placeholder="Current Address" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Permanent Address <span className="text-rose-500">*</span></label>
              <input type="text" name="permanentAddress" value={formData.permanentAddress} onChange={handleChange} placeholder="Permanent Address" className="input-field" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Login Password <span className="text-rose-500">*</span></label>
            <input type="password" name="password" value={formData.password} onChange={handleChange} minLength={8} placeholder="••••••••"
              className={`input-field max-w-md ${errors.password ? 'border-rose-500' : ''}`} />
            {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer pt-2">
            <input type="checkbox" checked={formData.canManageStudents}
              onChange={(e) => setFormData((p) => ({ ...p, canManageStudents: e.target.checked }))}
              className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer" />
            Grant permission to manage students and parents
          </label>
          <p className="text-xs text-blue-600 dark:text-blue-400 -mt-2">
            Note :- By giving the permission of manage student and parent to teacher, teacher can manage student's and parent's data.
          </p>

          <div className="pt-4">
            <Button type="submit" variant="gradient" isLoading={submitting}>{submitting ? 'Adding...' : 'Submit'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddNewTeacher;
