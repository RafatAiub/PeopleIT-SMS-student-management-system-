import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { Drawer } from '../../components/ui/Drawer';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import {
  BLOOD_GROUPS,
  RELIGIONS,
  ClassMeta,
  EditFormData,
  compressImage,
  emptyEditFormData,
  isDepartmentRequiredForClass,
  validateEditField,
} from './studentFormUtils';

interface SectionMeta {
  id: string;
  name: string;
}

interface StudentEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'staff' exposes class/section/roll/status; 'student' is personal-data only (self-service). */
  mode: 'staff' | 'student';
  student: any | null;
  /** Only needed in 'staff' mode, for the class picker + department requirement rule. */
  classes?: ClassMeta[];
  onSaved: () => void;
}

export const StudentEditDrawer: React.FC<StudentEditDrawerProps> = ({
  isOpen,
  onClose,
  mode,
  student,
  classes = [],
  onSaved,
}) => {
  const isStudentMode = mode === 'student';
  const [formData, setFormData] = useState<EditFormData>(emptyEditFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [availableSections, setAvailableSections] = useState<SectionMeta[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSectionsForEdit = async (classId: string, selectFirst: boolean) => {
    if (!classId) {
      setAvailableSections([]);
      setFormData((prev) => ({ ...prev, sectionId: '' }));
      return;
    }
    try {
      const res = await apiClient.get(`/students/meta/sections?classId=${classId}`);
      const sections: SectionMeta[] = res.data.data || [];
      setAvailableSections(sections);
      if (selectFirst) {
        setFormData((prev) => ({ ...prev, sectionId: sections.length > 0 ? sections[0].id : '' }));
      }
    } catch (err) {
      console.error('Failed to load sections', err);
    }
  };

  useEffect(() => {
    if (!isOpen || !student) return;
    setErrors({});
    const studentClassId = student.class?.id || '';

    // Students only edit their own personal fields — class/section are
    // staff-managed, and /students/meta/sections is a staff-only endpoint
    // that would 403 for a STUDENT caller here.
    if (!isStudentMode && studentClassId) {
      fetchSectionsForEdit(studentClassId, false).then(() => {
        setFormData((prev) => ({ ...prev, sectionId: student.section?.id || '' }));
      });
    } else {
      setAvailableSections([]);
    }

    setFormData({
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      email: student.email || '',
      phone: student.phone || '',
      gender: student.gender || 'MALE',
      classId: studentClassId,
      sectionId: student.section?.id || '',
      rollNumber: student.rollNumber || '',
      department: student.department || '',
      status: student.status || 'ACTIVE',
      address: student.address || '',
      bloodGroup: student.bloodGroup || '',
      religion: student.religion || '',
      nationality: student.nationality || 'Bangladeshi',
      avatarUrl: student.avatarUrl || student.user?.avatarUrl || '',
    });
  }, [isOpen, student, isStudentMode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const nextFormState = { ...formData, [name]: value };
    setFormData(nextFormState);
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));

    if (name === 'classId') {
      fetchSectionsForEdit(value, true);
      setErrors((prev) => ({
        ...prev,
        department: validateEditField('department', nextFormState.department, nextFormState, classes),
      }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: validateEditField(name, value, formData, classes) }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const compressed = await compressImage(file);
      setFormData((prev) => ({ ...prev, avatarUrl: compressed }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;

    const fieldsToValidate = isStudentMode
      ? ['firstName', 'lastName', 'email']
      : ['firstName', 'lastName', 'email', 'department'];
    const nextErrors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      const err = validateEditField(field, (formData as any)[field] || '', formData, classes);
      if (err) nextErrors[field] = err;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstInvalidField = fieldsToValidate.find((f) => nextErrors[f]);
      if (firstInvalidField) {
        (e.target as HTMLFormElement).querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      }
      toast.error('Please fix the highlighted fields');
      return;
    }

    setIsSubmitting(true);

    const payload: any = isStudentMode
      ? {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || undefined,
          gender: formData.gender,
          address: formData.address || undefined,
          bloodGroup: formData.bloodGroup || undefined,
          religion: formData.religion || undefined,
          nationality: formData.nationality || undefined,
          avatarUrl: formData.avatarUrl || undefined,
        }
      : {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          gender: formData.gender,
          rollNumber: formData.rollNumber || undefined,
          department: formData.department || undefined,
          status: formData.status,
          classId: formData.classId || undefined,
          sectionId: formData.sectionId || undefined,
          address: formData.address || undefined,
          bloodGroup: formData.bloodGroup || undefined,
          religion: formData.religion || undefined,
          nationality: formData.nationality || undefined,
          avatarUrl: formData.avatarUrl || undefined,
        };

    try {
      await apiClient.put(`/students/${student.id}`, payload);
      toast.success('Profile updated successfully');
      onClose();
      onSaved();
    } catch (error: any) {
      console.error('Failed to update student', error);
      toast.error(error.response?.data?.message || 'Failed to update student');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen && !!student}
      onClose={onClose}
      title={isStudentMode ? 'Edit Personal Data' : 'Edit Student Profile'}
      width="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="student-edit-form" variant="primary" isLoading={isSubmitting}>
            {isSubmitting ? 'Saving…' : isStudentMode ? 'Save Profile' : 'Update Student'}
          </Button>
        </>
      }
    >
      <form id="student-edit-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="First Name"
            name="firstName"
            required
            value={formData.firstName}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.firstName}
          />
          <Input
            label="Last Name"
            name="lastName"
            required
            value={formData.lastName}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.lastName}
          />
        </div>

        {!isStudentMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Class"
              name="classId"
              value={formData.classId}
              onChange={handleChange}
              placeholder="-- No Class Assigned --"
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Section"
              name="sectionId"
              value={formData.sectionId}
              onChange={handleChange}
              disabled={!formData.classId}
              placeholder="-- Select Section --"
              options={availableSections.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        )}

        {!isStudentMode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Roll Number"
              name="rollNumber"
              placeholder="e.g. 15"
              value={formData.rollNumber}
              onChange={handleChange}
            />
            <Select
              label="Status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'GRADUATED', label: 'Graduated' },
                { value: 'TRANSFERRED', label: 'Transferred' },
              ]}
            />
          </div>
        )}

        {!isStudentMode && isDepartmentRequiredForClass(formData.classId, classes) && (
          <Select
            label="Department"
            name="department"
            required
            value={formData.department}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.department}
            helperText={!errors.department ? 'Required for Class 9 & 10 students' : undefined}
            placeholder="Select Department"
            options={[
              { value: 'Science', label: 'Science' },
              { value: 'Commerce', label: 'Commerce' },
              { value: 'Arts', label: 'Arts' },
            ]}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Gender"
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            options={[
              { value: 'MALE', label: 'Male' },
              { value: 'FEMALE', label: 'Female' },
              { value: 'OTHER', label: 'Other' },
            ]}
          />
          <Input
            label="Phone"
            name="phone"
            placeholder="e.g. +8801700000000"
            value={formData.phone}
            onChange={handleChange}
          />
        </div>

        {!isStudentMode && (
          <Input
            label="Email"
            type="email"
            name="email"
            placeholder="e.g. john.doe@school.edu"
            value={formData.email}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.email}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Blood Group"
            name="bloodGroup"
            value={formData.bloodGroup}
            onChange={handleChange}
            placeholder="Select Blood Group"
            options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))}
          />
          <Select
            label="Religion"
            name="religion"
            value={formData.religion}
            onChange={handleChange}
            placeholder="Select Religion"
            options={RELIGIONS.map((r) => ({ value: r, label: r }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nationality"
            name="nationality"
            placeholder="e.g. Bangladeshi"
            value={formData.nationality}
            onChange={handleChange}
          />
          <div className="flex flex-col">
            <label className="field-label">Profile Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full text-slate-700 dark:text-slate-300 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary-600/10 file:text-primary-600 dark:file:text-primary-400 hover:file:bg-primary-600/20"
            />
          </div>
        </div>

        <Textarea
          label="Address"
          name="address"
          rows={2}
          value={formData.address}
          onChange={handleChange}
          placeholder="Enter permanent address"
        />
      </form>
    </Drawer>
  );
};
