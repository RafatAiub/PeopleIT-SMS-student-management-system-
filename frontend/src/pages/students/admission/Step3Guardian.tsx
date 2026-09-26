import React from 'react';
import { XCircle } from 'lucide-react';
import { Alert } from '@/components/ui';
import { UploadButtonField } from './UploadButtonField';
import type { AdmissionFormApi } from './useAdmissionForm';

// Step 3: create-a-new-guardian OR link-an-existing-guardian, exactly as in
// the original form (same search, same read-only-when-linked behaviour, same
// Parent/Guardian relationship toggle).
export const Step3Guardian: React.FC<{ form: AdmissionFormApi }> = ({ form }) => {
  const {
    guardianMode,
    guardianData,
    guardianPhotoFileName,
    guardianQuery,
    guardianResults,
    showGuardianDropdown,
    guardianSearchError,
    setShowGuardianDropdown,
    handleGuardianModeChange,
    handleGuardianChange,
    selectGuardian,
    clearGuardianSelection,
    handleGuardianSearchChange,
    retryGuardianSearch,
    handleGuardianPhotoSelected,
  } = form;

  return (
    <div>
      <div className="flex items-center gap-6 mb-4">
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

      {/* Guardian Email (search / link existing) */}
      <div className="mb-4 relative">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Guardian Email <span className="text-rose-500">*</span>
        </label>
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
        {guardianSearchError && (
          <div className="mt-2">
            <Alert tone="danger" title="Guardian search failed" action={
              <button type="button" onClick={retryGuardianSearch} className="text-xs font-semibold underline">Retry</button>
            }>
              Couldn't search existing guardians. You can retry, or fill in the fields below to create a new one.
            </Alert>
          </div>
        )}
        {guardianData.guardianId && (
          <p className="text-xs text-accent-600 dark:text-accent-400 mt-1">Linking existing guardian — fields below are read-only.</p>
        )}
      </div>

      {/* Row: Guardian First Name | Guardian Last Name | Guardian Mobile */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Guardian First Name <span className="text-rose-500">*</span>
          </label>
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Guardian Last Name <span className="text-rose-500">*</span>
          </label>
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Guardian Mobile <span className="text-rose-500">*</span>
          </label>
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Guardian Date of Birth <span className="text-rose-500">*</span>
          </label>
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
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Guardian Occupation <span className="text-rose-500">*</span>
          </label>
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
  );
};
