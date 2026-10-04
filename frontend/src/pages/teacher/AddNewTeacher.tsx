import React, { useState } from 'react';
import { User, Phone, Briefcase, ShieldCheck, Upload } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { Button, Card, CardHeader, Input, Checkbox, PageHeader, Alert } from '../../components/ui';

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
      <PageHeader title="Add New Teacher" description="Register a new teacher account." />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        {/* Personal */}
        <Card>
          <CardHeader icon={<User className="w-4 h-4" />} title="Personal Information" description="Name, gender and date of birth." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="teacher-first-name"
              name="firstName"
              label="First Name"
              required
              value={formData.firstName}
              onChange={handleChange}
              placeholder="First Name"
              error={errors.firstName}
            />
            <Input
              id="teacher-last-name"
              name="lastName"
              label="Last Name"
              required
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Last Name"
              error={errors.lastName}
            />
            <div>
              <label className="field-label">Gender <span className="text-red-600 dark:text-red-400 ml-0.5" aria-hidden>*</span></label>
              <div className="flex items-center gap-6 h-10">
                {(['MALE', 'FEMALE'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      checked={formData.gender === g}
                      onChange={() => setFormData((p) => ({ ...p, gender: g }))}
                      className="w-4 h-4 accent-primary-500 cursor-pointer"
                    />
                    {g.charAt(0) + g.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </div>
            <Input
              id="teacher-dob"
              name="dateOfBirth"
              type="date"
              label="Date of Birth"
              value={formData.dateOfBirth}
              onChange={handleChange}
            />
            <div className="sm:col-span-2">
              <label className="field-label">Photo</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={photoFileName}
                  placeholder="No file chosen"
                  onClick={() => document.getElementById('teacher-photo-input')?.click()}
                  className="input-field flex-1 cursor-pointer bg-slate-50 dark:bg-white/5"
                />
                <Button type="button" variant="secondary" onClick={() => document.getElementById('teacher-photo-input')?.click()}>
                  <Upload className="w-4 h-4" />
                  Upload
                </Button>
                <input id="teacher-photo-input" type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>
              <p className="field-hint">Recommended image size: 120x120px (square)</p>
            </div>
          </div>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader icon={<Phone className="w-4 h-4" />} title="Contact Information" description="How to reach this teacher." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="teacher-phone"
              name="phone"
              label="Mobile"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Mobile"
            />
            <div className="hidden sm:block" aria-hidden />
            <Input
              id="teacher-address"
              name="address"
              label="Current Address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Current Address"
            />
            <Input
              id="teacher-permanent-address"
              name="permanentAddress"
              label="Permanent Address"
              value={formData.permanentAddress}
              onChange={handleChange}
              placeholder="Permanent Address"
            />
          </div>
        </Card>

        {/* Professional */}
        <Card>
          <CardHeader icon={<Briefcase className="w-4 h-4" />} title="Professional Information" description="Qualification and permissions." />
          <div className="space-y-4">
            <Input
              id="teacher-qualification"
              name="qualification"
              label="Qualification"
              value={formData.qualification}
              onChange={handleChange}
              placeholder="Qualification"
              containerClassName="sm:max-w-md"
            />
            <Checkbox
              label="Grant permission to manage students and parents"
              checked={formData.canManageStudents}
              onChange={(e) => setFormData((p) => ({ ...p, canManageStudents: e.target.checked }))}
            />
            <Alert tone="info">
              By giving the permission of manage student and parent to teacher, teacher can manage student's and parent's data.
            </Alert>
          </div>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader icon={<ShieldCheck className="w-4 h-4" />} title="Account" description="Login email and password." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="teacher-email"
              name="email"
              type="email"
              label="Email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="Email"
              error={errors.email}
            />
            <Input
              id="teacher-password"
              name="password"
              type="password"
              label="Login Password"
              required
              minLength={8}
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              error={errors.password}
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" variant="gradient" isLoading={submitting} fullWidth className="sm:w-auto">
            {submitting ? 'Adding...' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddNewTeacher;
