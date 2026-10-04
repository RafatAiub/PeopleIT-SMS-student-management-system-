import React from 'react';
import { BookOpen } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Textarea, Select } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { RESOURCE_TYPES, emptyMaterialForm } from './lectureShared';
import AttachmentField from './AttachmentField';

export type MaterialForm = typeof emptyMaterialForm;

interface LectureMaterialFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEdit: boolean;
  form: MaterialForm;
  onChange: (patch: Partial<MaterialForm>) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  disabled?: boolean;
  /** Class/Section selects — only the teacher/admin Stream needs these; the
   * student's own Stream is implicitly scoped to their own class. */
  classSectionPicker?: React.ReactNode;
  note?: React.ReactNode;
}

export default function LectureMaterialFormModal({
  isOpen,
  onClose,
  isEdit,
  form,
  onChange,
  onSubmit,
  saving,
  disabled,
  classSectionPicker,
  note,
}: LectureMaterialFormModalProps) {
  const t = useT();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <BookOpen className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
          {isEdit ? t('Edit Lecture Material') : t('Add Lecture Material')}
        </span>
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="lecture-material-form" variant="primary" isLoading={saving} disabled={saving || disabled}>
            {isEdit ? t('Save Changes') : t('Add Material')}
          </Button>
        </>
      }
    >
      <form id="lecture-material-form" onSubmit={onSubmit} className="space-y-4">
        {note}
        {classSectionPicker}

        <Input label={t('Subject')} required placeholder="e.g. Mathematics" value={form.subject} onChange={(e) => onChange({ subject: e.target.value })} />
        <Input label={t('Title')} required placeholder="e.g. Chapter 4 - Algebra Basics" value={form.title} onChange={(e) => onChange({ title: e.target.value })} />
        <Textarea label={t('Description (optional)')} rows={2} placeholder="Short summary of this material" value={form.description} onChange={(e) => onChange({ description: e.target.value })} />
        <Select label={t('Type')} value={form.resourceType} onChange={(e) => onChange({ resourceType: e.target.value })}>
          {RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        <AttachmentField resourceType={form.resourceType} value={form.fileUrl} onChange={(url) => onChange({ fileUrl: url })} required label="Resource" />
      </form>
    </Modal>
  );
}
