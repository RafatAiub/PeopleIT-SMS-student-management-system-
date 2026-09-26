import React from 'react';
import { Input } from '@/components/ui';
import { HOBBY_OPTIONS } from './validation';
import type { AdmissionFormApi } from './useAdmissionForm';

// Step 1: student's own identity + personal details + portal login. Same
// fields as the original form's first rows plus the "Login Credentials"
// section — only the class/section/category/roll/GR-number/documents fields
// moved to their own steps.
export const Step1StudentDetails: React.FC<{ form: AdmissionFormApi }> = ({ form }) => {
  const { createFormData: data, createErrors: errors, handleCreateChange, handleCreateBlur, toggleHobby } = form;

  return (
    <div className="space-y-4">
      {/* Row: First Name | Last Name | Mobile */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="First Name"
          required
          name="firstName"
          placeholder="First Name"
          value={data.firstName}
          onChange={handleCreateChange}
          onBlur={handleCreateBlur}
          error={errors.firstName}
        />
        <Input
          label="Last Name"
          required
          name="lastName"
          placeholder="Last Name"
          value={data.lastName}
          onChange={handleCreateChange}
          onBlur={handleCreateBlur}
          error={errors.lastName}
        />
        <Input
          label="Mobile"
          name="phone"
          placeholder="Mobile"
          value={data.phone}
          onChange={handleCreateChange}
          onBlur={handleCreateBlur}
          error={errors.phone}
        />
      </div>

      {/* Row: Gender | Date of Birth */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Gender <span className="text-rose-500">*</span>
          </label>
          <div className="flex items-center gap-6 h-10">
            {(['MALE', 'FEMALE'] as const).map((g) => (
              <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  checked={data.gender === g}
                  onChange={handleCreateChange}
                  className="w-4 h-4 accent-primary-500 cursor-pointer"
                />
                {g.charAt(0) + g.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
        </div>
        <Input
          label="Date of Birth"
          required
          type="date"
          name="dateOfBirth"
          value={data.dateOfBirth}
          onChange={handleCreateChange}
        />
      </div>

      {/* Login Credentials (not in the reference — required to create this app's student portal login) */}
      <div className="pt-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Login Credentials</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Sets up the student's portal login — this account also appears under User Management.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Email"
            required
            type="email"
            name="email"
            placeholder="e.g. john.doe@school.edu"
            value={data.email}
            onChange={handleCreateChange}
            onBlur={handleCreateBlur}
            error={errors.email}
          />
          <Input
            label="Password"
            required
            type="password"
            name="password"
            minLength={8}
            placeholder="••••••••"
            value={data.password}
            onChange={handleCreateChange}
            onBlur={handleCreateBlur}
            error={errors.password}
          />
        </div>
      </div>

      {/* Row: Caste | Religion */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input label="Caste" name="caste" placeholder="Caste" value={data.caste} onChange={handleCreateChange} />
        <Input label="Religion" name="religion" placeholder="Religion" value={data.religion} onChange={handleCreateChange} />
        <Input
          label="Nationality"
          required
          name="nationality"
          placeholder="Nationality"
          value={data.nationality}
          onChange={handleCreateChange}
        />
      </div>

      {/* Row: Blood Group | Height | Weight */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Blood Group <span className="text-rose-500">*</span>
          </label>
          <select name="bloodGroup" value={data.bloodGroup} onChange={handleCreateChange} className="input-field">
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
        <Input label="Height" required name="height" placeholder="Height" value={data.height} onChange={handleCreateChange} />
        <Input label="Weight" required name="weight" placeholder="Weight" value={data.weight} onChange={handleCreateChange} />
      </div>

      {/* Current Address (full width) */}
      <Input
        label="Current Address"
        required
        name="address"
        placeholder="Current Address"
        value={data.address}
        onChange={handleCreateChange}
      />

      {/* Permanent Address (full width) */}
      <Input
        label="Permanent Address"
        required
        name="permanentAddress"
        placeholder="Permanent Address"
        value={data.permanentAddress}
        onChange={handleCreateChange}
      />

      {/* Hobby */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Hobby</label>
        <div className="space-y-2">
          {HOBBY_OPTIONS.map((hobby) => (
            <label key={hobby} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={data.hobbies.includes(hobby)}
                onChange={() => toggleHobby(hobby)}
                className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer"
              />
              {hobby}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
