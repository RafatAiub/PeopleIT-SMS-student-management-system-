import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button, Alert, DescriptionList } from '@/components/ui';
import { PrintLayout } from '@/components/print/PrintLayout';
import type { AdmissionResult } from './types';

// Result screen shown right after a successful submit. Everything shown here
// is data the admissions clerk just typed in on the previous steps (student
// name, GR Number, login email/password, placement, guardian name) — nothing
// fetched or invented. Added per the redesign spec: printable via
// PrintLayout, plus "Add Another Student" to continue the admissions-desk
// flow (the original form's behaviour of clearing itself for the next entry).
export const StepResult: React.FC<{ result: AdmissionResult; onAddAnother: () => void }> = ({ result, onAddAnother }) => {
  return (
    <div className="space-y-4">
      <Alert tone="success" title="Student added successfully">
        Share the login email and password below with the student — the password is not stored anywhere else and cannot be shown again after you leave this page.
      </Alert>

      <PrintLayout title="Admission Confirmation" reference={`GR Number ${result.studentId}`}>
        <div className="flex items-center gap-3 mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          <div>
            <p className="text-base font-semibold">{result.firstName} {result.lastName}</p>
            <p className="text-xs text-slate-600">Admission completed</p>
          </div>
        </div>
        <DescriptionList
          columns={2}
          items={[
            { label: 'GR Number', value: result.studentId },
            { label: 'Class Section', value: result.sectionLabel || '—' },
            { label: 'Category', value: result.categoryLabel || '—' },
            { label: 'Guardian', value: result.guardianName || '—' },
            { label: 'Login Email', value: result.email },
            { label: 'Login Password', value: result.password },
          ]}
        />
      </PrintLayout>

      <div className="flex justify-start">
        <Button type="button" variant="gradient" onClick={onAddAnother}>
          Add Another Student
        </Button>
      </div>
    </div>
  );
};
