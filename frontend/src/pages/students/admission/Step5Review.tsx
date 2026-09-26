import React from 'react';
import { DescriptionList } from '@/components/ui';
import type { AdmissionFormApi } from './useAdmissionForm';
import type { WizardStep } from './types';

// Step 5: read-only summary of everything entered on the previous steps,
// grouped the same way, each group linking back to its step for edits.
// Nothing here is computed beyond simple lookups (section/category labels) —
// the actual submit still runs the full validation + API call sequence.
export const Step5Review: React.FC<{ form: AdmissionFormApi; onEditStep: (step: WizardStep) => void }> = ({ form, onEditStep }) => {
  const { createFormData: data, guardianData, guardianMode, photoFileName, birthCertificate, lastPassingResult, allSections, categories } = form;

  const section = allSections.find((s) => s.id === data.sectionId);
  const category = categories.find((c) => c.id === data.categoryId);

  const EditLink: React.FC<{ step: WizardStep }> = ({ step }) => (
    <button type="button" onClick={() => onEditStep(step)} className="text-xs font-semibold text-primary-600 hover:underline">
      Edit
    </button>
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Student Details</h4>
          <EditLink step={1} />
        </div>
        <DescriptionList
          columns={3}
          items={[
            { label: 'First Name', value: data.firstName },
            { label: 'Last Name', value: data.lastName },
            { label: 'Mobile', value: data.phone },
            { label: 'Gender', value: data.gender },
            { label: 'Date of Birth', value: data.dateOfBirth },
            { label: 'Email', value: data.email },
            { label: 'Caste', value: data.caste },
            { label: 'Religion', value: data.religion },
            { label: 'Nationality', value: data.nationality },
            { label: 'Blood Group', value: data.bloodGroup },
            { label: 'Height', value: data.height },
            { label: 'Weight', value: data.weight },
            { label: 'Current Address', value: data.address },
            { label: 'Permanent Address', value: data.permanentAddress },
            { label: 'Hobbies', value: data.hobbies.length ? data.hobbies.join(', ') : '—' },
          ]}
        />
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Academic Placement</h4>
          <EditLink step={2} />
        </div>
        <DescriptionList
          columns={3}
          items={[
            { label: 'GR Number', value: data.studentId },
            { label: 'Class Section', value: section ? `${section.class?.name || ''} - ${section.name}` : '—' },
            { label: 'Category', value: category?.name || '—' },
            { label: 'Roll Number', value: data.rollNumber || '—' },
            { label: 'Department', value: data.department || '—' },
            { label: 'Admission Date', value: data.admissionDate },
          ]}
        />
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Guardian ({guardianMode === 'PARENT' ? 'Parent' : 'Guardian'})</h4>
          <EditLink step={3} />
        </div>
        {guardianData.firstName || guardianData.guardianId ? (
          <DescriptionList
            columns={3}
            items={[
              { label: 'Name', value: `${guardianData.firstName} ${guardianData.lastName}`.trim() || '—' },
              { label: 'Relationship', value: guardianData.relationship },
              { label: 'Mobile', value: guardianData.phone || '—' },
              { label: 'Email', value: guardianData.email || '—' },
              { label: 'Occupation', value: guardianData.occupation || '—' },
              { label: 'Linked existing?', value: guardianData.guardianId ? 'Yes' : 'No (will be created)' },
            ]}
          />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No guardian details entered — this can be added later from the Guardians page.</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Photo &amp; Documents</h4>
          <EditLink step={4} />
        </div>
        <DescriptionList
          columns={3}
          items={[
            { label: 'Photo', value: photoFileName || '—' },
            { label: 'Birth Certificate', value: birthCertificate?.name || '—' },
            { label: 'Last Passing Result', value: lastPassingResult?.name || '—' },
          ]}
        />
      </section>
    </div>
  );
};
