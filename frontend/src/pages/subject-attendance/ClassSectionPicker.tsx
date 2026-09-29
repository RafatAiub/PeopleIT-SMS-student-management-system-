import React, { useEffect } from 'react';
import { Select, Skeleton, Alert } from '@/components/ui';
import { useT } from '@/i18n';
import { useClassSectionMeta } from '@/utils/classSections';
import { useTeacherClasses } from './subjectAttendance.queries';

interface Props {
  isTeacher: boolean;
  className: string;
  sectionName: string;
  onChange: (className: string, sectionName: string) => void;
  idPrefix: string;
}

/**
 * ADMIN/SUPER_ADMIN pick any real class/section; a TEACHER picks from the
 * sections they are class teacher of or teach in the timetable
 * (GET /subject-attendance/my-classes).
 */
export default function ClassSectionPicker({ isTeacher, className, sectionName, onChange, idPrefix }: Props) {
  const t = useT();
  const { classes, sections, loadingClasses, classesError } = useClassSectionMeta(isTeacher ? '' : className);
  const teacherClasses = useTeacherClasses(isTeacher);

  // Default selections once the lists arrive.
  useEffect(() => {
    if (isTeacher) {
      const list = teacherClasses.data ?? [];
      if (list.length && !list.some((c) => c.className === className && c.sectionName === sectionName)) {
        onChange(list[0].className, list[0].sectionName);
      }
      return;
    }
    if (!className && classes.length) onChange(classes[0].name, '');
  }, [isTeacher, teacherClasses.data, classes, className, sectionName, onChange]);

  useEffect(() => {
    if (isTeacher) return;
    if (sections.length && !sections.some((s) => s.name === sectionName)) onChange(className, sections[0].name);
  }, [isTeacher, sections, className, sectionName, onChange]);

  if (isTeacher) {
    if (teacherClasses.isLoading) return <Skeleton className="h-11 w-56" />;
    if (teacherClasses.isError) return <Alert tone="danger">{t('Could not load your classes.')}</Alert>;
    const list = teacherClasses.data ?? [];
    if (list.length === 0) {
      return <Alert tone="warning">{t('You are not assigned to any class as class teacher or in the timetable.')}</Alert>;
    }
    return (
      <Select
        id={`${idPrefix}-class-section`}
        label={t('Class & section')}
        value={`${className}::${sectionName}`}
        onChange={(e) => {
          const [c, s] = e.target.value.split('::');
          onChange(c, s);
        }}
        options={list.map((c) => ({ value: `${c.className}::${c.sectionName}`, label: `${c.className} — ${t('Section')} ${c.sectionName}` }))}
        containerClassName="min-w-[200px]"
      />
    );
  }

  if (loadingClasses) return <Skeleton className="h-11 w-72" />;
  if (classesError) return <Alert tone="danger">{t('Could not load classes.')}</Alert>;
  return (
    <>
      <Select
        id={`${idPrefix}-class`}
        label={t('Class')}
        value={className}
        onChange={(e) => onChange(e.target.value, '')}
        options={classes.map((c) => ({ value: c.name, label: c.name }))}
        containerClassName="min-w-[140px]"
      />
      <Select
        id={`${idPrefix}-section`}
        label={t('Section')}
        value={sectionName}
        onChange={(e) => onChange(className, e.target.value)}
        options={sections.map((s) => ({ value: s.name, label: `${t('Section')} ${s.name}` }))}
        containerClassName="min-w-[120px]"
      />
    </>
  );
}
