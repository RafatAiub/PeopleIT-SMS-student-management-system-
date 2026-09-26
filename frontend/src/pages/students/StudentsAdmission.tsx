import React from 'react';
import { UserPlus } from 'lucide-react';
import { Button, Card, PageHeader } from '@/components/ui';
import { useAdmissionForm } from './admission/useAdmissionForm';
import { StepIndicator } from './admission/StepIndicator';
import { Step1StudentDetails } from './admission/Step1StudentDetails';
import { Step2AcademicPlacement } from './admission/Step2AcademicPlacement';
import { Step3Guardian } from './admission/Step3Guardian';
import { Step4PhotoDocuments } from './admission/Step4PhotoDocuments';
import { Step5Review } from './admission/Step5Review';
import { StepResult } from './admission/StepResult';
import { STEP_TITLES } from './admission/types';

/**
 * Students Admission — multi-step wizard.
 *
 * Every field, default value, option list, validation rule and API call
 * sequence is unchanged from the original single-page form; only the layout
 * was split into steps (see ./admission/*). State and handlers live in
 * useAdmissionForm so this file stays a thin page shell.
 */
const StudentsAdmission = () => {
  const form = useAdmissionForm();

  const pageTitle = (
    <span className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
        <UserPlus className="w-5 h-5" />
      </span>
      Students Admission
    </span>
  );

  if (form.submittedResult) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pageTitle}
          description="Registration complete — share the credentials below with the student, or print this page."
        />
        <StepResult result={form.submittedResult} onAddAnother={form.startAnother} />
      </div>
    );
  }

  // Pressing Enter inside a step's input shouldn't jump straight to the final
  // submit (which validates every step's fields, not just the current one) —
  // only let Enter submit once the reviewer is actually on the last step.
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' && form.step < 5 && target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title={pageTitle}
        description="Register a new student. The form clears itself after each submission so you can add the next one right away."
      />

      <Card>
        <StepIndicator step={form.step} highestStepReached={form.highestStepReached} onStepClick={form.goToStep} />

        <form onSubmit={form.handleCreateSubmit} onKeyDown={handleFormKeyDown} className="max-w-5xl mt-2">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{STEP_TITLES[form.step]}</h3>

          {form.step === 1 && <Step1StudentDetails form={form} />}
          {form.step === 2 && <Step2AcademicPlacement form={form} />}
          {form.step === 3 && <Step3Guardian form={form} />}
          {form.step === 4 && <Step4PhotoDocuments form={form} />}
          {form.step === 5 && <Step5Review form={form} onEditStep={form.goToStep} />}

          {/* Sticky footer: Back / Next / Submit */}
          <div className="sticky bottom-0 -mx-5 mt-6 px-5 py-3 flex items-center justify-between gap-3 border-t border-slate-200 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
            <Button type="button" variant="outline" onClick={form.goBack} disabled={form.step === 1}>
              Back
            </Button>
            {form.step < 5 ? (
              <Button type="button" variant="primary" onClick={form.goNext}>
                Next
              </Button>
            ) : (
              <Button type="submit" variant="gradient" isLoading={form.isSubmitting}>
                {form.isSubmitting ? 'Adding...' : 'Submit'}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
};

export default StudentsAdmission;
