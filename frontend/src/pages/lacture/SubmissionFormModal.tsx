import React from 'react';
import { Send, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Textarea, Select } from '../../components/ui/Input';
import { useT } from '../../i18n';
import { SUBMISSION_RESOURCE_TYPES, type Assignment } from './lectureShared';
import AttachmentField from './AttachmentField';

export interface SubmissionForm {
  instructions: string;
  resourceType: string;
  fileUrl: string;
}

interface SubmissionFormModalProps {
  isOpen: boolean;
  assignment: Assignment | null;
  onClose: () => void;
  form: SubmissionForm;
  onChange: (patch: Partial<SubmissionForm>) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  onDelete?: () => void;
}

export default function SubmissionFormModal({ isOpen, assignment, onClose, form, onChange, onSubmit, saving, onDelete }: SubmissionFormModalProps) {
  const t = useT();
  if (!assignment) return null;
  const isEdit = !!onDelete;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Send className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
          {isEdit ? t('Edit Submission') : t('Submit Assignment')}
        </span>
      }
      description={`${assignment.title} (${assignment.subject})`}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {onDelete ? (
            <Button type="button" variant="danger-soft" leftIcon={<Trash2 className="w-4 h-4" />} onClick={onDelete}>
              {t('Delete')}
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
            <Button type="submit" form="submission-form" variant="primary" isLoading={saving} disabled={saving}>
              {isEdit ? t('Save Changes') : t('Submit Assignment')}
            </Button>
          </div>
        </div>
      }
    >
      <form id="submission-form" onSubmit={onSubmit} className="space-y-4">
        <Textarea label={t('Notes (optional)')} rows={3} placeholder="Any notes about your submission" value={form.instructions} onChange={(e) => onChange({ instructions: e.target.value })} />
        <Select label={t('Attachment Type')} required value={form.resourceType} onChange={(e) => onChange({ resourceType: e.target.value })}>
          {SUBMISSION_RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
        <AttachmentField resourceType={form.resourceType} value={form.fileUrl} onChange={(url) => onChange({ fileUrl: url })} required label="Your Work" />
      </form>
    </Modal>
  );
}
