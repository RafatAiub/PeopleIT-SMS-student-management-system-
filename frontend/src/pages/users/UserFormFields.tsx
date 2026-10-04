import React from 'react';
import { Input, Select, Textarea } from '@/components/ui';
import GuardianChildrenLinker from './GuardianChildrenLinker';
import type { ClassOption, SectionOption, StudentOption } from './users.types';

export interface UserFormValuesShape {
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  avatarUrl: string;
  email?: string;
  password?: string;
  isActive?: boolean;
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
  qualification: string;
  subjectExpertise: string;
  joiningDate: string;
  relationship: string;
}

interface UserFormFieldsProps {
  mode: 'create' | 'edit';
  values: UserFormValuesShape;
  errors: Record<string, string>;
  onFieldChange: (name: string, value: string) => void;
  onFieldBlur: (name: string, value: string) => void;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  roleOptions: { value: string; label: string }[];
  classes: ClassOption[];
  sections: SectionOption[];
  guardianChildren: StudentOption[];
  onGuardianChildrenChange: (students: StudentOption[]) => void;
}

const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const RELIGION_OPTIONS = ['Islam', 'Hinduism', 'Christianity', 'Buddhism', 'Other'];

export default function UserFormFields({
  mode,
  values,
  errors,
  onFieldChange,
  onFieldBlur,
  onAvatarChange,
  roleOptions,
  classes,
  sections,
  guardianChildren,
  onGuardianChildrenChange,
}: UserFormFieldsProps) {
  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onFieldChange(e.target.name, e.target.value);
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => onFieldBlur(e.target.name, e.target.value);

  return (
    <div className="space-y-6">
      {/* Basic Details */}
      <div>
        <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4 uppercase tracking-wider">Basic Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="First Name"
            name="firstName"
            required
            data-autofocus
            placeholder="e.g. John"
            value={values.firstName}
            onChange={onChange}
            onBlur={onBlur}
            error={errors.firstName}
          />
          <Input
            label="Last Name"
            name="lastName"
            required
            placeholder="e.g. Doe"
            value={values.lastName}
            onChange={onChange}
            onBlur={onBlur}
            error={errors.lastName}
          />
          {mode === 'create' && (
            <>
              <Input
                label="Email"
                type="email"
                name="email"
                required
                placeholder="e.g. john.doe@school.edu"
                value={values.email || ''}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.email}
              />
              <Input
                label="Password"
                type="password"
                name="password"
                required
                minLength={8}
                placeholder="••••••••"
                value={values.password || ''}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.password}
              />
            </>
          )}
          <Select label="Role" name="role" value={values.role} onChange={onChange} options={roleOptions} />
          <Input
            label="Phone"
            name="phone"
            placeholder="e.g. +8801700000000"
            value={values.phone}
            onChange={onChange}
          />
          {mode === 'edit' && (
            <Select
              label="Status"
              name="isActive"
              value={values.isActive ? 'true' : 'false'}
              onChange={onChange}
              options={[
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
            />
          )}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Profile Photo {mode === 'create' && <span className="text-rose-600">*</span>}
            </label>
            <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              {values.avatarUrl ? (
                <img src={values.avatarUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-white/10" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-600/10 border border-primary-200 dark:border-primary-500/20 flex items-center justify-center text-[10px] text-primary-600 dark:text-primary-400 font-semibold">No Photo</div>
              )}
              <input
                type="file"
                accept="image/*"
                required={mode === 'create'}
                onChange={onAvatarChange}
                className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary-50 dark:file:bg-primary-600/25 file:text-primary-600 dark:file:text-primary-400 hover:file:bg-primary-100 dark:hover:file:bg-primary-600/35 cursor-pointer file:transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Conditional Student Details */}
      {values.role === 'STUDENT' && (
        <div className="animate-fadeIn">
          <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-4 uppercase tracking-wider">Student Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Class"
              name="classId"
              value={values.classId}
              onChange={onChange}
              placeholder="Select Class"
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Section"
              name="sectionId"
              value={values.sectionId}
              onChange={onChange}
              placeholder="Select Section"
              options={sections.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Input label="Roll Number" name="rollNumber" placeholder="e.g. 15" value={values.rollNumber} onChange={onChange} />
            <Input label="Admission Date" type="date" name="admissionDate" value={values.admissionDate} onChange={onChange} />
            <Input label="Date of Birth" type="date" name="dateOfBirth" value={values.dateOfBirth} onChange={onChange} />
            <Select label="Gender" name="gender" value={values.gender} onChange={onChange} options={GENDER_OPTIONS.map((g) => ({ value: g, label: g }))} />
            <Select label="Blood Group" name="bloodGroup" value={values.bloodGroup} onChange={onChange} options={BLOOD_GROUP_OPTIONS.map((g) => ({ value: g, label: g }))} />
            <Select label="Religion" name="religion" value={values.religion} onChange={onChange} options={RELIGION_OPTIONS.map((g) => ({ value: g, label: g }))} />
            <Input label="Nationality" name="nationality" placeholder="e.g. Bangladeshi" value={values.nationality} onChange={onChange} />
            <div className="md:col-span-2">
              <Textarea label="Address" name="address" rows={2} placeholder="e.g. 385 Goran Road, Dhaka" value={values.address} onChange={onChange} />
            </div>
          </div>
        </div>
      )}

      {/* Conditional Teacher Details */}
      {values.role === 'TEACHER' && (
        <div className="animate-fadeIn">
          <h4 className="text-sm font-semibold text-primary-600 dark:text-purple-400 mb-4 uppercase tracking-wider">Teacher Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Qualification" name="qualification" placeholder="e.g. MSc in Mathematics, BEd" value={values.qualification} onChange={onChange} />
            <Input label="Subject Expertise" name="subjectExpertise" placeholder="e.g. Mathematics, Physics" value={values.subjectExpertise} onChange={onChange} />
            <Input label="Joining Date" type="date" name="joiningDate" value={values.joiningDate} onChange={onChange} />
          </div>
        </div>
      )}

      {/* Conditional Guardian Details */}
      {values.role === 'GUARDIAN' && (
        <GuardianChildrenLinker
          selected={guardianChildren}
          onChange={onGuardianChildrenChange}
          relationship={values.relationship}
          onRelationshipChange={(value) => onFieldChange('relationship', value)}
        />
      )}
    </div>
  );
}
