import React, { useEffect, useState } from 'react';
import { Modal, Input, Select, Button, Alert } from '@/components/ui';
import { useT } from '@/i18n';
import { useClassOptions } from './enquiries.queries';
import { buildConvertDefaults, EMPTY_CONVERT_FORM, type ConvertFormValues, type Enquiry } from './enquiries.types';

interface ConvertEnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  enquiry: Enquiry | null;
  onSubmit: (values: ConvertFormValues) => void;
  isSubmitting: boolean;
}

type FormErrors = Partial<Record<'firstName' | 'lastName' | 'guardianFirstName' | 'guardianLastName' | 'guardianPhone', string>>;

function validate(values: ConvertFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.firstName.trim()) errors.firstName = 'First name is required';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required';
  if (!values.guardianFirstName.trim()) errors.guardianFirstName = 'Guardian first name is required';
  if (!values.guardianLastName.trim()) errors.guardianLastName = 'Guardian last name is required';
  if (!values.guardianPhone.trim()) errors.guardianPhone = 'Guardian phone is required';
  return errors;
}

/** Prefills first/last name and guardian name from the enquiry (see
 * enquiries.types.ts buildConvertDefaults / splitName), then posts to
 * POST /enquiries/:id/convert, which creates a PENDING online application. */
export default function ConvertEnquiryModal({ isOpen, onClose, enquiry, onSubmit, isSubmitting }: ConvertEnquiryModalProps) {
  const t = useT();
  const { data: classes = [], isLoading: classesLoading } = useClassOptions();
  const [values, setValues] = useState<ConvertFormValues>(EMPTY_CONVERT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen || !enquiry) return;
    setValues(buildConvertDefaults(enquiry));
    setErrors({});
    setTouched({});
  }, [isOpen, enquiry]);

  const handleBlur = (field: keyof FormErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(values));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setTouched({ firstName: true, lastName: true, guardianFirstName: true, guardianLastName: true, guardianPhone: true });
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Convert to online application')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="convertEnquiryForm" variant="gradient" isLoading={isSubmitting}>
            {t('Create application')}
          </Button>
        </>
      }
    >
      <form id="convertEnquiryForm" onSubmit={handleSubmit} className="space-y-5">
        <Alert tone="info">
          {t('This creates a pending online application for review on the Online Registrations screen. Fields are prefilled from the enquiry — review and correct them before submitting.')}
        </Alert>

        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Student details')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('First name')}
            required
            data-autofocus
            value={values.firstName}
            onChange={(e) => setValues((p) => ({ ...p, firstName: e.target.value }))}
            onBlur={() => handleBlur('firstName')}
            error={touched.firstName ? errors.firstName : undefined}
          />
          <Input
            label={t('Last name')}
            required
            value={values.lastName}
            onChange={(e) => setValues((p) => ({ ...p, lastName: e.target.value }))}
            onBlur={() => handleBlur('lastName')}
            error={touched.lastName ? errors.lastName : undefined}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('Date of birth')}
            type="date"
            value={values.dateOfBirth}
            onChange={(e) => setValues((p) => ({ ...p, dateOfBirth: e.target.value }))}
          />
          <Select
            label={t('Gender')}
            value={values.gender}
            onChange={(e) => setValues((p) => ({ ...p, gender: e.target.value as ConvertFormValues['gender'] }))}
            placeholder={t('-- Select --')}
            options={[
              { value: 'MALE', label: t('Male') },
              { value: 'FEMALE', label: t('Female') },
              { value: 'OTHER', label: t('Other') },
            ]}
          />
        </div>

        <Select
          label={t('Applying for class')}
          value={values.classId}
          onChange={(e) => setValues((p) => ({ ...p, classId: e.target.value }))}
          placeholder={classesLoading ? t('Loading...') : t('-- Select class --')}
          options={classes.map((c) => ({ value: c.id, label: c.name }))}
          disabled={classesLoading}
        />

        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">{t('Guardian details')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('Guardian first name')}
            required
            value={values.guardianFirstName}
            onChange={(e) => setValues((p) => ({ ...p, guardianFirstName: e.target.value }))}
            onBlur={() => handleBlur('guardianFirstName')}
            error={touched.guardianFirstName ? errors.guardianFirstName : undefined}
          />
          <Input
            label={t('Guardian last name')}
            required
            value={values.guardianLastName}
            onChange={(e) => setValues((p) => ({ ...p, guardianLastName: e.target.value }))}
            onBlur={() => handleBlur('guardianLastName')}
            error={touched.guardianLastName ? errors.guardianLastName : undefined}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('Guardian phone')}
            required
            value={values.guardianPhone}
            onChange={(e) => setValues((p) => ({ ...p, guardianPhone: e.target.value }))}
            onBlur={() => handleBlur('guardianPhone')}
            error={touched.guardianPhone ? errors.guardianPhone : undefined}
          />
          <Input
            label={t('Guardian email')}
            type="email"
            value={values.guardianEmail}
            onChange={(e) => setValues((p) => ({ ...p, guardianEmail: e.target.value }))}
          />
        </div>
      </form>
    </Modal>
  );
}
