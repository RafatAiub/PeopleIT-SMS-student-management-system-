import React, { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select, Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Feedback';
import { useT } from '../../i18n';
import { dayLabel, formatTime12, type PeriodDef } from './timetableSettings';

export interface TimetableEditInitial {
  slotId?: string;
  day: string;
  startTime: string;
  subject?: string;
  teacherUserId?: string;
}

interface TimetableEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial: TimetableEditInitial | null;
  days: string[];
  periods: PeriodDef[];
  teachers: any[];
  branchId: string | null;
  className: string;
  sectionName: string;
  onSaved: () => void;
}

/** Add a new slot, or (Move/Edit) change an existing slot's day/period/subject/teacher. */
export default function TimetableEditModal({
  isOpen,
  onClose,
  initial,
  days,
  periods,
  teachers,
  branchId,
  className,
  sectionName,
  onSaved,
}: TimetableEditModalProps) {
  const t = useT();
  const isEdit = !!initial?.slotId;
  const nonBreakPeriods = periods.filter((p) => !p.isBreak);

  const [day, setDay] = useState(initial?.day || days[0] || '');
  const [periodStart, setPeriodStart] = useState(initial?.startTime || nonBreakPeriods[0]?.start || '');
  const [subject, setSubject] = useState(initial?.subject || '');
  const [teacherUserId, setTeacherUserId] = useState(initial?.teacherUserId || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDay(initial?.day || days[0] || '');
    setPeriodStart(initial?.startTime || nonBreakPeriods[0]?.start || '');
    setSubject(initial?.subject || '');
    setTeacherUserId(initial?.teacherUserId || '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) {
      toast.error(t('Could not resolve your branch. Please refresh and try again.'));
      return;
    }
    const period = nonBreakPeriods.find((p) => p.start === periodStart);
    if (!period) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        branchId,
        className,
        sectionName,
        dayOfWeek: day,
        startTime: period.start,
        endTime: period.end,
        subject,
        teacherUserId,
      };
      if (isEdit && initial?.slotId) {
        await apiClient.put(`/timetables/${initial.slotId}`, payload);
        toast.success(t('Schedule updated'));
      } else {
        await apiClient.post('/timetables', payload);
        toast.success(t('Schedule added successfully!'));
      }
      onSaved();
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.message || t('Failed to save schedule');
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Calendar className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
          {isEdit ? t('Move / Edit Period') : t('Add Class Schedule')}
        </span>
      }
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="timetable-edit-form" variant="primary" isLoading={submitting} disabled={submitting || !branchId}>
            {isEdit ? t('Save Changes') : t('Save Schedule')}
          </Button>
        </>
      }
    >
      <form id="timetable-edit-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Select label={t('Day')} value={day} onChange={(e) => setDay(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>{dayLabel(d)}</option>
            ))}
          </Select>
          <Select label={t('Period')} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}>
            {nonBreakPeriods.map((p) => (
              <option key={p.id} value={p.start}>{p.label} ({formatTime12(p.start)}–{formatTime12(p.end)})</option>
            ))}
          </Select>
        </div>

        <Input
          label={t('Subject Name')}
          required
          placeholder="e.g. Mathematics"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <Select label={t('Teacher')} required value={teacherUserId} onChange={(e) => setTeacherUserId(e.target.value)} placeholder={t('Select a teacher')}>
          {teachers.map((tch: any) => (
            <option key={tch.id} value={tch.id}>{tch.firstName} {tch.lastName}</option>
          ))}
        </Select>
      </form>
    </Modal>
  );
}
