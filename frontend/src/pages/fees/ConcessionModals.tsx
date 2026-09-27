import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Textarea, Checkbox, Skeleton, Alert } from '../../components/ui';
import { useT } from '../../i18n';
import { describeConcession } from './concessionUtils';
import { StudentPicker } from './StudentPicker';
import { useFeeCategoriesList } from './hooks';
import { useActiveConcessionOptions, useAssignConcession, useSaveConcession } from './feeExtras.queries';
import type { Concession, ConcessionType, StudentSearchResult } from './types';

// ── Create / edit a concession ──────────────────────────────────────────────

interface ConcessionFormModalProps {
  isOpen: boolean;
  concession: Concession | null;
  onClose: () => void;
}

export const ConcessionFormModal: React.FC<ConcessionFormModalProps> = ({ isOpen, concession, onClose }) => {
  const t = useT();
  const save = useSaveConcession();
  const { data: categoriesData } = useFeeCategoriesList(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<ConcessionType>('PERCENT');
  const [value, setValue] = useState('');
  const [feeCategoryId, setFeeCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setName(concession?.name ?? '');
    setType(concession?.type ?? 'PERCENT');
    setValue(concession ? String(Number(concession.value)) : '');
    setFeeCategoryId(concession?.feeCategoryId ?? '');
    setDescription(concession?.description ?? '');
    setIsActive(concession?.isActive ?? true);
    setErrors({});
  }, [isOpen, concession]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const num = Number(value);
    if (!name.trim()) next.name = t('Name is required');
    if (!value || Number.isNaN(num) || num <= 0) next.value = t('Value must be greater than zero');
    else if (type === 'PERCENT' && num > 100) next.value = t('A percentage cannot exceed 100%');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      await save.mutateAsync({
        id: concession?.id,
        name: name.trim(),
        type,
        value: num,
        feeCategoryId: feeCategoryId || null,
        description: description.trim() || null,
        isActive,
      });
      toast.success(concession ? t('Concession updated') : t('Concession created'));
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to save concession'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={concession ? t('Edit concession') : t('New concession')} size="md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input id="concession-name" label={t('Name')} required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder={t('e.g. Sibling discount')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label={t('Type')}
            value={type}
            onChange={(e) => setType(e.target.value as ConcessionType)}
            options={[
              { value: 'PERCENT', label: t('Percentage (%)') },
              { value: 'FIXED', label: t('Fixed amount (৳)') },
            ]}
          />
          <Input
            id="concession-value"
            label={type === 'PERCENT' ? t('Value (%)') : t('Value (৳)')}
            type="number"
            min={0}
            step="0.01"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={errors.value}
          />
        </div>
        <Select
          label={t('Applies to')}
          value={feeCategoryId}
          onChange={(e) => setFeeCategoryId(e.target.value)}
          options={[
            { value: '', label: t('Whole invoice (all fee categories)') },
            ...(categoriesData?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
          helperText={
            feeCategoryId
              ? type === 'FIXED'
                ? t('Fixed amount off each matching line.')
                : t('Percentage off each matching line.')
              : type === 'FIXED'
                ? t('One fixed amount off the whole invoice, spread across its lines.')
                : t('Percentage off every line.')
          }
        />
        <Textarea label={t('Description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <Checkbox label={t('Active')} description={t('Inactive concessions are not applied to new invoices.')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" isLoading={save.isPending}>{concession ? t('Save changes') : t('Create concession')}</Button>
        </div>
      </form>
    </Modal>
  );
};

// ── Assign a concession to a student ────────────────────────────────────────

interface AssignConcessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected student (e.g. from the create-invoice flow). */
  student?: StudentSearchResult | null;
  concessionId?: string;
}

export const AssignConcessionModal: React.FC<AssignConcessionModalProps> = ({ isOpen, onClose, student: presetStudent, concessionId: presetConcession }) => {
  const t = useT();
  const assign = useAssignConcession();
  const { data: options = [], isLoading, isError, refetch } = useActiveConcessionOptions(isOpen);

  const [student, setStudent] = useState<StudentSearchResult | null>(null);
  const [concessionId, setConcessionId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setStudent(presetStudent ?? null);
    setConcessionId(presetConcession ?? '');
    setValidFrom('');
    setValidTo('');
    setNote('');
    setErrors({});
  }, [isOpen, presetStudent, presetConcession]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!student) next.student = t('Please select a student');
    if (!concessionId) next.concession = t('Choose a concession');
    if (validFrom && validTo && validTo < validFrom) next.validTo = t('Valid-to must be on or after valid-from');
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      await assign.mutateAsync({
        studentId: student!.id,
        concessionId,
        validFrom: validFrom || null,
        validTo: validTo || null,
        note: note.trim() || null,
      });
      toast.success(t('Concession assigned'));
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to assign concession'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Assign concession')} description={t('Active concessions are applied automatically to new invoices for this student.')} size="md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className="field-label">{t('Student')} *</label>
          {presetStudent ? (
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {presetStudent.firstName} {presetStudent.lastName} <span className="text-slate-500">({presetStudent.studentId})</span>
            </p>
          ) : (
            <StudentPicker value={student} onChange={setStudent} error={errors.student} />
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-10" />
        ) : isError ? (
          <Alert tone="danger" action={<Button size="xs" variant="ghost" onClick={() => refetch()}>{t('Retry')}</Button>}>
            {t('Failed to load concessions.')}
          </Alert>
        ) : options.length === 0 ? (
          <Alert tone="info">{t('No active concessions yet. Create one in the Concessions tab first.')}</Alert>
        ) : (
          <Select
            label={t('Concession')}
            required
            value={concessionId}
            onChange={(e) => setConcessionId(e.target.value)}
            placeholder={t('-- Choose --')}
            options={options.map((c) => ({
              value: c.id,
              label: `${c.name} — ${describeConcession(c)}${c.feeCategory ? ` (${c.feeCategory.name})` : ''}`,
            }))}
            error={errors.concession}
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label={t('Valid from')} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} helperText={t('Leave empty for immediately')} />
          <Input label={t('Valid to')} type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} error={errors.validTo} helperText={t('Leave empty for no end date')} />
        </div>
        <Input label={t('Note')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Optional')} />
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" isLoading={assign.isPending} disabled={options.length === 0}>{t('Assign')}</Button>
        </div>
      </form>
    </Modal>
  );
};
