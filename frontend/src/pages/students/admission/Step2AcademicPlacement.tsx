import React from 'react';
import { Input, ErrorState, Skeleton } from '@/components/ui';
import { CustomFieldInputs } from '@/pages/settings/custom-fields/CustomFieldInputs';
import type { AdmissionFormApi } from './useAdmissionForm';

// Previous schooling + institution-defined custom fields. Rendered even when
// the class list fails to load, so a required custom field is never hidden.
const AdditionalDetails: React.FC<{ form: AdmissionFormApi }> = ({ form }) => {
  const {
    createFormData: data,
    handleCreateChange,
    customFieldDefs,
    customFieldsLoading,
    customFieldValues,
    customFieldErrors,
    handleCustomFieldChange,
    handleCustomFieldBlur,
  } = form;

  return (
    <>
      <div className="pt-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Previous Schooling</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Optional.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Previous School"
            name="previousSchool"
            maxLength={200}
            value={data.previousSchool}
            onChange={handleCreateChange}
          />
          <Input
            label="Previous Class"
            name="previousClass"
            maxLength={100}
            placeholder="e.g. Class 5"
            value={data.previousClass}
            onChange={handleCreateChange}
          />
        </div>
      </div>

      {customFieldsLoading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : customFieldDefs.length > 0 ? (
        <div className="pt-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Additional Details</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Fields defined by your institution.</p>
          <CustomFieldInputs
            definitions={customFieldDefs}
            values={customFieldValues}
            errors={customFieldErrors}
            onChange={handleCustomFieldChange}
            onBlur={handleCustomFieldBlur}
          />
        </div>
      ) : null}
    </>
  );
};

// Step 2: class/section, category, GR Number, roll number, department
// (conditional on class 9/10) and admission date — the same "academic
// placement" fields from the original form, grouped together.
export const Step2AcademicPlacement: React.FC<{ form: AdmissionFormApi }> = ({ form }) => {
  const {
    createFormData: data,
    createErrors: errors,
    handleCreateChange,
    handleCreateBlur,
    handleClassSectionChange,
    allSections,
    sectionsLoading,
    sectionsError,
    refetchSections,
    categories,
    categoriesLoading,
    categoriesError,
    refetchCategories,
    isDepartmentRequired,
  } = form;

  if (sectionsError || categoriesError) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Couldn't load class/section or category list"
          message="These are needed to place the student. Retry, or leave them blank and add placement later from Student Details."
          onRetry={() => {
            if (sectionsError) refetchSections();
            if (categoriesError) refetchCategories();
          }}
        />
        <AdditionalDetails form={form} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Row: Class Section | Category | GR Number */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Class Section</label>
          <select
            name="sectionId"
            value={data.sectionId}
            onChange={handleClassSectionChange}
            disabled={sectionsLoading}
            className="input-field"
          >
            <option value="">{sectionsLoading ? 'Loading…' : '-- Select Class Section --'}</option>
            {allSections.map((s) => (
              <option key={s.id} value={s.id}>{s.class?.name} - {s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
          <select
            name="categoryId"
            value={data.categoryId}
            onChange={handleCreateChange}
            disabled={categoriesLoading}
            className="input-field"
          >
            <option value="">{categoriesLoading ? 'Loading…' : '-- Select Category --'}</option>
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
            value={data.studentId}
            className="input-field bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 cursor-not-allowed"
          />
          {errors.studentId && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errors.studentId}</p>}
        </div>
      </div>

      {/* Row: Roll Number | Department */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Roll Number"
          name="rollNumber"
          placeholder="e.g. 15"
          value={data.rollNumber}
          onChange={handleCreateChange}
          onBlur={handleCreateBlur}
          error={errors.rollNumber}
        />
        {isDepartmentRequired(data.sectionId) && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Department <span className="text-rose-500">*</span>
            </label>
            <select
              name="department"
              required
              value={data.department}
              onChange={handleCreateChange}
              onBlur={handleCreateBlur}
              className={`input-field ${errors.department ? 'border-rose-500 focus:ring-rose-500' : ''}`}
            >
              <option value="">Select Department</option>
              <option value="Science">Science</option>
              <option value="Commerce">Commerce</option>
              <option value="Arts">Arts</option>
            </select>
            {errors.department ? (
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errors.department}</p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Required for Class 9 &amp; 10 students</p>
            )}
          </div>
        )}
      </div>

      {/* Admission Date */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Admission Date"
          required
          type="date"
          name="admissionDate"
          value={data.admissionDate}
          onChange={handleCreateChange}
        />
      </div>

      <AdditionalDetails form={form} />
    </div>
  );
};
