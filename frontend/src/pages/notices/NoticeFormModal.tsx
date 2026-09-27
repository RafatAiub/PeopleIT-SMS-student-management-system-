import React, { useEffect, useState } from 'react';
import { Modal, Input, Textarea, Select, Checkbox, Button } from '@/components/ui';
import { AUDIENCE_OPTIONS, EMPTY_NOTICE_FORM, type Notice, type NoticeFormValues } from './notices.types';

interface NoticeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** null = create mode, otherwise the notice being edited. */
  notice: Notice | null;
  onSubmit: (values: NoticeFormValues) => void;
  isSubmitting: boolean;
}

type FormErrors = Partial<Record<'title' | 'content', string>>;

function validate(values: NoticeFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.title.trim()) errors.title = 'Title is required';
  else if (values.title.length > 200) errors.title = 'Title must be 200 characters or fewer';
  if (!values.content.trim()) errors.content = 'Content is required';
  return errors;
}

export default function NoticeFormModal({ isOpen, onClose, notice, onSubmit, isSubmitting }: NoticeFormModalProps) {
  const [values, setValues] = useState<NoticeFormValues>(EMPTY_NOTICE_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    setValues(
      notice
        ? { title: notice.title, content: notice.content, audience: notice.audience, isActive: notice.isActive }
        : EMPTY_NOTICE_FORM
    );
    setErrors({});
    setTouched({});
  }, [isOpen, notice]);

  const handleBlur = (field: keyof FormErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(validate(values));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setTouched({ title: true, content: true });
    if (Object.keys(nextErrors).length > 0) return;
    onSubmit(values);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={notice ? 'Edit Notice' : 'Publish Announcement'}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="noticeForm" variant="gradient" isLoading={isSubmitting}>
            {notice ? 'Save Changes' : 'Publish Announcement'}
          </Button>
        </>
      }
    >
      <form id="noticeForm" onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Notice Title"
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
          label="Target Audience"
          value={values.audience}
          onChange={(e) => setValues((p) => ({ ...p, audience: e.target.value as NoticeFormValues['audience'] }))}
          options={AUDIENCE_OPTIONS}
        />
        <Textarea
          label="Notice Content"
          required
          rows={6}
          value={values.content}
          onChange={(e) => setValues((p) => ({ ...p, content: e.target.value }))}
          onBlur={() => handleBlur('content')}
          error={touched.content ? errors.content : undefined}
          placeholder="Write the full details of the announcement here..."
        />
        <Checkbox
          label="Active"
          description="Inactive notices stay saved and can be brought back later, but can be filtered out of the board."
          checked={values.isActive}
          onChange={(e) => setValues((p) => ({ ...p, isActive: e.target.checked }))}
        />
      </form>
    </Modal>
  );
}
