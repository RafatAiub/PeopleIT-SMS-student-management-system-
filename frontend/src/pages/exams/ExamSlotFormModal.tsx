import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Alert, Button, Input, Modal, Select } from '../../components/ui';
import { useT } from '../../i18n';
import { errorMessage, useClassOptions, useSectionOptions, type ExamOption } from '../results/academicLookups';
import { checkSlotConflicts, useSaveSlot, type ExamSlot, type SlotConflict } from './examTimetable.queries';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  slot: ExamSlot | null;
  exams: ExamOption[];
  defaultExamId: string;
}

const empty = { examId: '', className: '', sectionName: '', subjectName: '', date: '', startTime: '10:00', endTime: '13:00', room: '' };

export const ExamSlotFormModal: React.FC<Props> = ({ isOpen, onClose, slot, exams, defaultExamId }) => {
  const t = useT();
  const save = useSaveSlot();
  const classes = useClassOptions(isOpen);
  const [form, setForm] = useState(empty);
  const [submitted, setSubmitted] = useState(false);
  const [conflicts, setConflicts] = useState<SlotConflict[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitted(false);
    setConflicts([]);
    setForm(
      slot
        ? {
            examId: slot.examId,
            className: slot.className,
            sectionName: slot.sectionName ?? '',
            subjectName: slot.subjectName,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            room: slot.room ?? '',
          }
        : { ...empty, examId: defaultExamId },
    );
  }, [isOpen, slot, defaultExamId]);

  const classId = useMemo(() => classes.data?.find((c) => c.name === form.className)?.id ?? null, [classes.data, form.className]);
  const sections = useSectionOptions(classId);

  const errors = {
    examId: !form.examId ? t('Exam is required') : undefined,
    className: !form.className ? t('Class is required') : undefined,
    subjectName: !form.subjectName.trim() ? t('Subject is required') : undefined,
    date: !form.date ? t('Date is required') : undefined,
    endTime: form.startTime && form.endTime && form.endTime <= form.startTime ? t('End time must be after start time') : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const payload = () => ({
    examId: form.examId,
    className: form.className,
    sectionName: form.sectionName || null,
    subjectName: form.subjectName.trim(),
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    room: form.room.trim() || null,
  });

  // Live conflict check (debounced) once the slot is fully specified.
  useEffect(() => {
    if (!isOpen || !valid) {
      setConflicts([]);
      return;
    }
    let cancelled = false;
    const h = setTimeout(async () => {
      setChecking(true);
      try {
        const found = await checkSlotConflicts({ ...payload(), ...(slot ? { id: slot.id } : {}) });
        if (!cancelled) setConflicts(found);
      } catch {
        if (!cancelled) setConflicts([]);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, valid, form.examId, form.className, form.sectionName, form.subjectName, form.date, form.startTime, form.endTime, form.room]);

  const set = (field: keyof typeof empty, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || conflicts.length > 0) return;
    try {
      await save.mutateAsync({ id: slot?.id, payload: payload() });
      toast.success(slot ? t('Exam slot updated') : t('Exam slot added'));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, t('Failed to save exam slot')));
    }
  };

  const exam = exams.find((x) => x.id === form.examId);
  const outsideWindow = exam && form.date && (form.date < exam.startDate.slice(0, 10) || form.date > exam.endDate.slice(0, 10));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={slot ? t('Edit exam slot') : t('Add exam slot')}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="exam-slot-form" isLoading={save.isPending} disabled={conflicts.length > 0}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <form id="exam-slot-form" onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t('Exam')}
          value={form.examId}
          onChange={(e) => set('examId', e.target.value)}
          placeholder={t('Select exam')}
          options={exams.map((x) => ({ value: x.id, label: x.name }))}
          error={submitted ? errors.examId : undefined}
          required
        />
        <Input label={t('Subject')} value={form.subjectName} onChange={(e) => set('subjectName', e.target.value)} error={submitted ? errors.subjectName : undefined} required maxLength={150} />
        <Select
          label={t('Class')}
          value={form.className}
          onChange={(e) => setForm((f) => ({ ...f, className: e.target.value, sectionName: '' }))}
          placeholder={classes.isLoading ? t('Loading…') : t('Select class')}
          options={(classes.data ?? []).map((c) => ({ value: c.name, label: c.name }))}
          error={submitted ? errors.className : undefined}
          required
        />
        <Select
          label={t('Section')}
          value={form.sectionName}
          onChange={(e) => set('sectionName', e.target.value)}
          placeholder={t('Whole class')}
          options={(sections.data ?? []).map((s) => ({ value: s.name, label: s.name }))}
          disabled={!classId}
        />
        <Input label={t('Date')} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} error={submitted ? errors.date : undefined} required />
        <Input label={t('Room')} value={form.room} onChange={(e) => set('room', e.target.value)} maxLength={50} />
        <Input label={t('Start time')} type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} required />
        <Input label={t('End time')} type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} error={errors.endTime} required />

        <div className="sm:col-span-2 space-y-2" aria-live="polite">
          {outsideWindow && <Alert tone="warning">{t('This date is outside the exam period.')}</Alert>}
          {conflicts.length > 0 && (
            <Alert tone="danger" title={t('Scheduling conflict')}>
              <ul className="list-disc pl-4 space-y-0.5">
                {conflicts.map((c, i) => (
                  <li key={`${c.slotId}-${c.type}-${i}`}>{c.message}</li>
                ))}
              </ul>
            </Alert>
          )}
          {checking && <p className="text-xs text-slate-500">{t('Checking for conflicts…')}</p>}
        </div>
      </form>
    </Modal>
  );
};
