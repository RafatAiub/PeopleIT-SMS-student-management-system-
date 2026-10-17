import React, { useEffect, useState } from 'react';
import { Modal, Input, Textarea, Select, Button, Alert } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { useEnquiryAssignees } from './enquiries.queries';
import { useDuplicateCheck, useStages } from './crm.api';
import { stageLabel } from './crm.logic';
import {
  EMPTY_ENQUIRY_FORM,
  PRIORITY_OPTIONS,
  SOURCE_OPTIONS,
  enquiryToFormValues,
  type Enquiry,
  type EnquiryFormValues,
  type Priority,
} from './enquiries.types';

interface EnquiryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** null = create mode, otherwise the enquiry being edited. */
  enquiry: Enquiry | null;
  onSubmit: (values: EnquiryFormValues) => void;
  isSubmitting: boolean;
  /** T4: open an existing enquiry flagged as a likely duplicate. */
  onOpenExisting?: (id: string) => void;
}

type FormErrors = Partial<Record<'studentName' | 'phone' | 'email', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s-]{5,19}$/;

function validate(values: EnquiryFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.studentName.trim()) errors.studentName = 'Student name is required';
  else if (values.studentName.length > 150) errors.studentName = 'Must be 150 characters or fewer';
  if (!values.phone.trim()) errors.phone = 'Phone number is required';
  else if (!PHONE_PATTERN.test(values.phone.trim())) errors.phone = 'Enter a valid phone number';
  if (values.email.trim() && !EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address';
  return errors;
}

export default function EnquiryFormModal({ isOpen, onClose, enquiry, onSubmit, isSubmitting, onOpenExisting }: EnquiryFormModalProps) {
  const t = useT();
  const { lang } = useLocale();
  const { data: assignees = [] } = useEnquiryAssignees();
  const { data: stages = [] } = useStages();
  const [probe, setProbe] = useState({ studentName: '', guardianName: '', phone: '', email: '' });
  const [values, setValues] = useState<EnquiryFormValues>(EMPTY_ENQUIRY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    setValues(enquiry ? enquiryToFormValues(enquiry) : EMPTY_ENQUIRY_FORM);
    setErrors({});
    setTouched({});
    setProbe({ studentName: '', guardianName: '', phone: '', email: '' });
  }, [isOpen, enquiry]);

  // Duplicate check (create only), refreshed when the person's key fields settle.
  useEffect(() => {
    if (!isOpen || enquiry) return;
    const id = setTimeout(
      () => setProbe({ studentName: values.studentName.trim(), guardianName: values.guardianName.trim(), phone: values.phone.trim(), email: values.email.trim() }),
      500,
    );
    return () => clearTimeout(id);
  }, [isOpen, enquiry, values.studentName, values.guardianName, values.phone, values.email]);
  const dups = useDuplicateCheck(probe, isOpen && !enquiry && (probe.phone.length >= 6 || probe.email.includes('@') || probe.studentName.length >= 3));

  const handleBlur = (field: keyof FormErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(values));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setTouched({ studentName: true, phone: true, email: true });
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  const assigneeOptions = [
    { value: '', label: t('Unassigned') },
    ...assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={enquiry ? t('Edit enquiry') : t('New enquiry')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="enquiryForm" variant="gradient" isLoading={isSubmitting}>
            {enquiry ? t('Save changes') : t('Create enquiry')}
          </Button>
        </>
      }
    >
      <form id="enquiryForm" onSubmit={handleSubmit} className="space-y-5">
        {!enquiry && (dups.data?.length ?? 0) > 0 && (
          <Alert tone="warning" title={t('This person may already be in your enquiries')}>
            <ul className="mt-1 space-y-1">
              {dups.data!.slice(0, 5).map((d) => (
                <li key={d.id} className="text-sm flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.studentName}</span>
                  <span>{d.phone}</span>
                  {d.stage && <span className="text-xs">({d.stage.name})</span>}
                  {onOpenExisting && (
                    <button type="button" className="text-xs font-semibold text-primary-700 dark:text-primary-300 underline" onClick={() => onOpenExisting(d.id)}>
                      {t('Open it')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('Student name')}
            required
            data-autofocus
            value={values.studentName}
            onChange={(e) => setValues((p) => ({ ...p, studentName: e.target.value }))}
            onBlur={() => handleBlur('studentName')}
            error={touched.studentName ? errors.studentName : undefined}
            maxLength={150}
          />
          <Input
            label={t('Guardian name')}
            value={values.guardianName}
            onChange={(e) => setValues((p) => ({ ...p, guardianName: e.target.value }))}
            maxLength={150}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('Phone')}
            required
            value={values.phone}
            onChange={(e) => setValues((p) => ({ ...p, phone: e.target.value }))}
            onBlur={() => handleBlur('phone')}
            error={touched.phone ? errors.phone : undefined}
            placeholder="01700000000"
          />
          <Input
            label={t('Email')}
            type="email"
            value={values.email}
            onChange={(e) => setValues((p) => ({ ...p, email: e.target.value }))}
            onBlur={() => handleBlur('email')}
            error={touched.email ? errors.email : undefined}
            placeholder="you@example.com"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('Class interested')}
            value={values.classInterested}
            onChange={(e) => setValues((p) => ({ ...p, classInterested: e.target.value }))}
            maxLength={100}
          />
          <Select
            label={t('Source')}
            value={values.source}
            onChange={(e) => setValues((p) => ({ ...p, source: e.target.value }))}
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={t('Stage')}
            value={values.stageId || stages[0]?.id || ''}
            onChange={(e) => setValues((p) => ({ ...p, stageId: e.target.value }))}
            options={stages.map((s) => ({ value: s.id, label: stageLabel(s, lang) }))}
          />
          <Select
            label={t('Owner')}
            value={values.assignedToUserId}
            onChange={(e) => setValues((p) => ({ ...p, assignedToUserId: e.target.value }))}
            options={assigneeOptions}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
          <Input
            label={t('Next step')}
            value={values.nextStep}
            maxLength={300}
            placeholder={t('e.g. Call father about the campus visit')}
            onChange={(e) => setValues((p) => ({ ...p, nextStep: e.target.value }))}
          />
          <Select
            label={t('Priority')}
            value={values.priority}
            onChange={(e) => setValues((p) => ({ ...p, priority: e.target.value as Priority }))}
            options={PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
          />
        </div>

        <Input
          label={t('Next step due')}
          type="datetime-local"
          value={values.followUpAt}
          onChange={(e) => setValues((p) => ({ ...p, followUpAt: e.target.value }))}
        />

        <Textarea
          label={t('Notes')}
          rows={4}
          value={values.notes}
          onChange={(e) => setValues((p) => ({ ...p, notes: e.target.value }))}
          placeholder={t('Any details about this enquiry...')}
        />
      </form>
    </Modal>
  );
}
