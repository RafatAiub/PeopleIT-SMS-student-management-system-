// Shared class/section lookup — used by AttendanceEntry, MarksEntry and
// Lacture (all ADMIN/SUPER_ADMIN class+section pickers) so the institution's
// real, seeded classes/sections are used instead of a fixed, hard-coded
// "KG..Class 10" / "A..G" list. Source of truth: GET /students/meta/classes
// and GET /students/meta/sections?classId=... (same endpoints already used
// for Admin > Attendance > Assign Class Teacher and for the marks-entry
// existing-records lookup). TEACHER users keep using their own
// assignment-scoped endpoint (e.g. /attendance/my-sections) — this hook is
// only for the unrestricted ADMIN/SUPER_ADMIN pickers.
import { useEffect, useState } from 'react';
import apiClient from '../api/client';

export interface ClassMeta {
  id: string;
  name: string;
}

export interface SectionMeta {
  id: string;
  name: string;
  classId?: string;
}

export function useClassSectionMeta(selectedClassName: string) {
  const [classes, setClasses] = useState<ClassMeta[]>([]);
  const [sections, setSections] = useState<SectionMeta[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [classesError, setClassesError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoadingClasses(true);
        setClassesError(false);
        const res = await apiClient.get('/students/meta/classes');
        if (active) setClasses(res.data?.data || []);
      } catch (err) {
        console.error('Failed to load classes', err);
        if (active) setClassesError(true);
      } finally {
        if (active) setLoadingClasses(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cls = classes.find((c) => c.name === selectedClassName);
    if (!cls) {
      setSections([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        setLoadingSections(true);
        const res = await apiClient.get(`/students/meta/sections?classId=${cls.id}`);
        if (active) setSections(res.data?.data || []);
      } catch (err) {
        console.error('Failed to load sections', err);
        if (active) setSections([]);
      } finally {
        if (active) setLoadingSections(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [classes, selectedClassName]);

  return { classes, sections, loadingClasses, loadingSections, classesError };
}
