import React, { useEffect, useState } from 'react';
import { Modal, Input, Textarea, Select, Checkbox, Button } from '@/components/ui';
import { useT } from '@/i18n';
import {
  AUDIENCE_OPTIONS,
  EMPTY_NOTICE_FORM,
  toLocalInput,
  type Notice,
  type NoticeFormValues,
} from './notices.types';
import { useNoticeClasses, useNoticeSections } from './notices.queries';

interface NoticeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** null = create mode, otherwise the notice being edited. */
  notice: Notice | null;
  onSubmit: (values: NoticeFormValues) => void;
  isSubmitting: boolean;
}

type FormErrors = Partial<Record<'title' | 'content' | 'scheduledAt', string>>;

function validate(values: NoticeFormValues, notice: Notice | null): FormErrors {
  const errors: FormErrors = {};
  if (!values.title.trim()) errors.title = 'Title is required';
  else if (values.title.length > 200) errors.title = 'Title must be 200 characters or fewer';
  if (!values.content.trim()) errors.content = 'Content is required';
  if (values.scheduledAt) {
    const at = new Date(values.scheduledAt).getTime();
    const unchanged = notice?.scheduledAt && toLocalInput(notice.scheduledAt) === values.scheduledAt;
    if (Number.isNaN(at)) errors.scheduledAt = 'Enter a valid date and time';
    else if (!unchanged && at <= Date.now()) errors.scheduledAt = 'Pick a time in the future, or leave empty to publish now';
  }
  return errors;
}

export default function NoticeFormModal({ isOpen, onClose, notice, onSubmit, isSubmitting }: NoticeFormModalProps) {
  const t = useT();
  const [values, setValues] = useState<NoticeFormValues>(EMPTY_NOTICE_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const classesQuery = useNoticeClasses(isOpen);
  const sectionsQuery = useNoticeSections(values.classId);

  useEffect(() => {
    if (!isOpen) return;
    setValues(
      notice
        ? {
            title: notice.title,
            content: notice.content,
            audience: notice.audience,
            isActive: notice.isActive,
            classId: notice.classId || '',
            sectionId: notice.sectionId || '',
            scheduledAt: toLocalInput(notice.scheduledAt),
          }
        : EMPTY_NOTICE_FORM
    );
    setErrors({});
    setTouched({});
  }, [isOpen, notice]);

  const handleBlur = (field: keyof FormErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(values, notice));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validate(values, notice);
    setErrors(nextErrors);
    setTouched({ title: true, content: true, scheduledAt: true });
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  const isFuture = !!values.scheduledAt && new Date(values.scheduledAt).getTime() > Date.now();
  const submitLabel = notice ? t('Save Changes') : isFuture ? t('Schedule Announcement') : t('Publish Announcement');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={notice ? t('Edit Notice') : t('Publish Announcement')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="noticeForm" variant="gradient" isLoading={isSubmitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id="noticeForm" onSubmit={handleSubmit} className="space-y-5">
        <Input
          label={t('Notice Title')}
          required
          data-autofocus
          value={values.title}
          onChange={(e) => setValues((p) => ({ ...p, title: e.target.value }))}
          onBlur={() => handleBlur('title')}
          error={touched.title ? errors.title : undefined}
          placeholder="e.g. Mid-Term Examination Schedule"
          maxLength={200}
        />
        <Select
          label={t('Target Audience')}
          value={values.audience}
          onChange={(e) => setValues((p) => ({ ...p, audience: e.target.value as NoticeFormValues['audience'] }))}
          options={AUDIENCE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={t('Class (optional)')}
            value={values.classId}
            onChange={(e) => setValues((p) => ({ ...p, classId: e.target.value, sectionId: '' }))}
            placeholder={classesQuery.isLoading ? t('Loading classes…') : t('All classes')}
            options={(classesQuery.data || []).map((c) => ({ value: c.id, label: c.name }))}
            helperText={
              classesQuery.isError
                ? t('Could not load classes — the notice will go to the whole audience.')
                : t('Students and guardians outside this class will not see the notice.')
            }
          />
          <Select
            label={t('Section (optional)')}
            value={values.sectionId}
            onChange={(e) => setValues((p) => ({ ...p, sectionId: e.target.value }))}
            disabled={!values.classId}
            placeholder={values.classId ? t('All sections') : t('Pick a class first')}
            options={(sectionsQuery.data || []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <Textarea
          label={t('Notice Content')}
          required
          rows={6}
          value={values.content}
          onChange={(e) => setValues((p) => ({ ...p, content: e.target.value }))}
          onBlur={() => handleBlur('content')}
          error={touched.content ? errors.content : undefined}
          placeholder="Write the full details of the announcement here..."
        />
        <Input
          type="datetime-local"
          label={t('Schedule for later (optional)')}
          value={values.scheduledAt}
          onChange={(e) => setValues((p) => ({ ...p, scheduledAt: e.target.value }))}
          onBlur={() => handleBlur('scheduledAt')}
          error={touched.scheduledAt ? errors.scheduledAt : undefined}
          helperText={t('Leave empty to publish immediately. Scheduled notices stay hidden from students and guardians until this time.')}
        />
        <Checkbox
          label={t('Active')}
          description={t('Inactive notices stay saved and can be brought back later, but can be filtered out of the board.')}
          checked={values.isActive}
          onChange={(e) => setValues((p) => ({ ...p, isActive: e.target.checked }))}
        />
      </form>
    </Modal>
  );
}
