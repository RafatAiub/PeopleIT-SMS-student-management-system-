import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Edit2 } from 'lucide-react';
import apiClient from '../../../api/client';
import { Button, Card, DescriptionList, ErrorState, Input, Modal, Skeleton, Textarea } from '../../../components/ui';
import { useT } from '../../../i18n';
import { useCustomFieldDefinitions } from '../../settings/custom-fields/customFields.queries';
import { CustomFieldInputs, formatCustomFieldValue } from '../../settings/custom-fields/CustomFieldInputs';
import {
  toFormState,
  toPayload,
  validateCustomFields,
  type CustomFieldDefinition,
  type CustomFieldFormState,
} from '../../settings/custom-fields/customFields.types';

// Overview-tab cards for the Wave C profile extras (health, emergency
// contact, previous schooling) and institution-defined custom fields, plus a
// staff edit modal that saves them through PUT /students/:id.

export interface StudentExtras {
  id: string;
  previousSchool?: string | null;
  previousClass?: string | null;
  medicalNotes?: string | null;
  allergies?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  customFields?: Record<string, string | number | null> | null;
}

const SectionTitle: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
    {action}
  </div>
);

export const ProfileExtras: React.FC<{ student: StudentExtras; canWrite: boolean; onSaved: () => void }> = ({
  student,
  canWrite,
  onSaved,
}) => {
  const t = useT();
  const defsQuery = useCustomFieldDefinitions();
  const defs = defsQuery.data || [];
  const [editOpen, setEditOpen] = useState(false);

  const emergency = [
    student.emergencyContactName,
    student.emergencyContactRelation ? `(${student.emergencyContactRelation})` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const editButton = canWrite ? (
    <Button variant="ghost" size="sm" leftIcon={<Edit2 className="w-4 h-4" />} onClick={() => setEditOpen(true)}>
      {t('Edit')}
    </Button>
  ) : undefined;

  return (
    <>
      <Card className="p-5 sm:p-6">
        <SectionTitle title={t('Health & emergency contact')} action={editButton} />
        <DescriptionList
          columns={3}
          items={[
            { label: t('Medical notes'), value: student.medicalNotes },
            { label: t('Allergies'), value: student.allergies },
            { label: t('Emergency contact'), value: emergency || null },
            { label: t('Emergency phone'), value: student.emergencyContactPhone },
            { label: t('Previous school'), value: student.previousSchool },
            { label: t('Previous class'), value: student.previousClass },
          ]}
        />
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle title={t('Additional details')} action={defs.length ? editButton : undefined} />
        {defsQuery.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : defsQuery.isError ? (
          <ErrorState message={t('Could not load custom fields.')} onRetry={() => defsQuery.refetch()} />
        ) : defs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('No custom fields are configured for this institution.')}
          </p>
        ) : (
          <DescriptionList
            columns={3}
            items={defs.map((def) => ({
              label: def.label,
              value: formatCustomFieldValue(def, student.customFields?.[def.key]),
            }))}
          />
        )}
      </Card>

      {canWrite && (
        <EditExtrasModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          student={student}
          definitions={defs}
          onSaved={() => {
            setEditOpen(false);
            onSaved();
          }}
        />
      )}
    </>
  );
};

type ExtrasForm = {
  previousSchool: string;
  previousClass: string;
  medicalNotes: string;
  allergies: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
};

const toForm = (s: StudentExtras): ExtrasForm => ({
  previousSchool: s.previousSchool || '',
  previousClass: s.previousClass || '',
  medicalNotes: s.medicalNotes || '',
  allergies: s.allergies || '',
  emergencyContactName: s.emergencyContactName || '',
  emergencyContactPhone: s.emergencyContactPhone || '',
  emergencyContactRelation: s.emergencyContactRelation || '',
});

const EditExtrasModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  student: StudentExtras;
  definitions: CustomFieldDefinition[];
  onSaved: () => void;
}> = ({ isOpen, onClose, student, definitions, onSaved }) => {
  const t = useT();
  const [form, setForm] = useState<ExtrasForm>(toForm(student));
  const [custom, setCustom] = useState<CustomFieldFormState>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(toForm(student));
    setCustom(toFormState(student.customFields));
    setErrors({});
    setCustomErrors({});
  }, [isOpen, student]);

  const set = (key: keyof ExtrasForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    const phone = form.emergencyContactPhone.trim();
    if (phone && !/^[+]?[\d\s()-]{7,20}$/.test(phone)) nextErrors.emergencyContactPhone = t('Enter a valid phone number');
    const nextCustomErrors = validateCustomFields(definitions, custom);
    setErrors(nextErrors);
    setCustomErrors(nextCustomErrors);
    if (Object.keys(nextErrors).length || Object.keys(nextCustomErrors).length) return;

    // Empty inputs clear the stored value (null), so staff can remove data.
    const nullable = (v: string) => (v.trim() ? v.trim() : null);
    setSubmitting(true);
    try {
      await apiClient.put(`/students/${student.id}`, {
        previousSchool: nullable(form.previousSchool),
        previousClass: nullable(form.previousClass),
        medicalNotes: nullable(form.medicalNotes),
        allergies: nullable(form.allergies),
        emergencyContactName: nullable(form.emergencyContactName),
        emergencyContactPhone: nullable(form.emergencyContactPhone),
        emergencyContactRelation: nullable(form.emergencyContactRelation),
        ...(definitions.length ? { customFields: toPayload(definitions, custom) } : {}),
      });
      toast.success(t('Profile updated'));
      onSaved();
    } catch (err: any) {
      const serverErrors: { field?: string; message?: string }[] = Array.isArray(err.response?.data?.errors)
        ? err.response.data.errors
        : [];
      const mapped: Record<string, string> = {};
      for (const item of serverErrors) {
        const match = item.field ? /customFields\.(.+)$/.exec(item.field) : null;
        if (match && item.message) mapped[match[1]] = item.message;
      }
      if (Object.keys(mapped).length) setCustomErrors(mapped);
      toast.error(serverErrors[0]?.message || err.response?.data?.message || t('Failed to update student'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Edit additional details')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="student-extras-form" isLoading={submitting}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <form id="student-extras-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Textarea label={t('Medical notes')} rows={2} maxLength={2000} value={form.medicalNotes} onChange={set('medicalNotes')} />
          <Textarea label={t('Allergies')} rows={2} maxLength={500} value={form.allergies} onChange={set('allergies')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label={t('Emergency contact name')} maxLength={150} value={form.emergencyContactName} onChange={set('emergencyContactName')} />
          <Input
            label={t('Emergency contact phone')}
            maxLength={20}
            value={form.emergencyContactPhone}
            onChange={set('emergencyContactPhone')}
            error={errors.emergencyContactPhone}
          />
          <Input label={t('Relation')} maxLength={50} value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={t('Previous school')} maxLength={200} value={form.previousSchool} onChange={set('previousSchool')} />
          <Input label={t('Previous class')} maxLength={100} value={form.previousClass} onChange={set('previousClass')} />
        </div>
        {definitions.length > 0 && (
          <div className="pt-1">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">{t('Additional details')}</h4>
            <CustomFieldInputs
              definitions={definitions}
              values={custom}
              errors={customErrors}
              onChange={(key, value) => {
                setCustom((p) => ({ ...p, [key]: value }));
                if (customErrors[key]) setCustomErrors((p) => ({ ...p, [key]: '' }));
              }}
            />
          </div>
        )}
      </form>
    </Modal>
  );
};
