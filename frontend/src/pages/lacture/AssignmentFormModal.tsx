import React from 'react';
import { ClipboardList } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Textarea, Select } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { RESOURCE_TYPES, emptyAssignmentForm } from './lectureShared';
import AttachmentField from './AttachmentField';

export type AssignmentForm = typeof emptyAssignmentForm;

interface AssignmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEdit: boolean;
  form: AssignmentForm;
  onChange: (patch: Partial<AssignmentForm>) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  disabled?: boolean;
  classSectionPicker?: React.ReactNode;
}

export default function AssignmentFormModal({
  isOpen,
  onClose,
  isEdit,
  form,
  onChange,
  onSubmit,
  saving,
  disabled,
  classSectionPicker,
}: AssignmentFormModalProps) {
  const t = useT();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <ClipboardList className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
          {isEdit ? t('Edit Assignment') : t('Add Assignment')}
        </span>
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="assignment-form" variant="primary" isLoading={saving} disabled={saving || disabled}>
            {isEdit ? t('Save Changes') : t('Add Assignment')}
          </Button>
        </>
      }
    >
      <form id="assignment-form" onSubmit={onSubmit} className="space-y-4">
        {classSectionPicker}

        <Input label={t('Subject')} required placeholder="e.g. Mathematics" value={form.subject} onChange={(e) => onChange({ subject: e.target.value })} />
        <Input label={t('Title')} required placeholder="e.g. Worksheet 3 - Fractions" value={form.title} onChange={(e) => onChange({ title: e.target.value })} />
        <Textarea label={t('Instructions (optional)')} rows={3} placeholder="What should students do for this assignment?" value={form.instructions} onChange={(e) => onChange({ instructions: e.target.value })} />
        <Input label={t('Due Date')} required type="date" value={form.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} />
        <Select label={t('Attachment Type (optional)')} value={form.resourceType} onChange={(e) => onChange({ resourceType: e.target.value })} placeholder={t('No attachment')}>
          {RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        {form.resourceType && (
          <AttachmentField resourceType={form.resourceType} value={form.fileUrl} onChange={(url) => onChange({ fileUrl: url })} label="Attachment" />
        )}
      </form>
    </Modal>
  );
}
