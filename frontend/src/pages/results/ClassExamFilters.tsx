import React, { useEffect } from 'react';
import { Select } from '../../components/ui';
import { useT } from '../../i18n';
import { useClassOptions, useExamOptions, useSectionOptions } from './academicLookups';

export interface ClassExamValue {
  examId: string;
  classId: string;
  sectionId: string;
}

interface Props {
  value: ClassExamValue;
  onChange: (next: ClassExamValue) => void;
  children?: React.ReactNode;
}

/** Exam + class + optional section pickers shared by merit list and class performance. */
export const ClassExamFilters: React.FC<Props> = ({ value, onChange, children }) => {
  const t = useT();
  const exams = useExamOptions();
  const classes = useClassOptions();
  const sections = useSectionOptions(value.classId || null);

  // Preselect the most recent exam once loaded.
  useEffect(() => {
    if (!value.examId && exams.data && exams.data.length > 0) onChange({ ...value, examId: exams.data[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams.data]);

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-end">
      <Select
        label={t('Exam')}
        value={value.examId}
        onChange={(e) => onChange({ ...value, examId: e.target.value })}
        placeholder={exams.isLoading ? t('Loading…') : t('Select exam')}
        options={(exams.data ?? []).map((e) => ({ value: e.id, label: e.name }))}
        disabled={exams.isLoading}
        error={exams.isError ? t('Could not load exams') : undefined}
      />
      <Select
        label={t('Class')}
        value={value.classId}
        onChange={(e) => onChange({ ...value, classId: e.target.value, sectionId: '' })}
        placeholder={classes.isLoading ? t('Loading…') : t('Select class')}
        options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        disabled={classes.isLoading}
        error={classes.isError ? t('Could not load classes') : undefined}
      />
      <Select
        label={t('Section')}
        value={value.sectionId}
        onChange={(e) => onChange({ ...value, sectionId: e.target.value })}
        placeholder={t('All sections')}
        options={(sections.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
        disabled={!value.classId || sections.isLoading}
      />
      {children}
    </div>
  );
};
