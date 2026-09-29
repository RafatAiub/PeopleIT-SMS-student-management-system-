import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus, GraduationCap, UserCircle, Download, X, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { useT } from '../../i18n';
import { DEPARTMENTS, FALLBACK_SUBJECTS_JUNIOR, isSeniorClass, getFallbackSubjects } from '../../utils/curriculum';
import TimetableDesktopGrid from './TimetableDesktopGrid';
import TimetableMobileDayView from './TimetableMobileDayView';
import TimetableEditModal, { type TimetableEditInitial } from './TimetableEditModal';
import TimetableSettingsPopover from './TimetableSettingsPopover';
import {
  loadTimetableSettings,
  saveTimetableSettings,
  mergeWithSlots,
  type TimetableSettings,
} from './timetableSettings';
import type { RoutineEntry, PaletteBlockType } from './types';

const BLOCK_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BLOCK_COLORS[hash % BLOCK_COLORS.length];
}

interface ChildSummary {
  id: string;
  firstName: string;
  lastName: string;
  class: { name: string } | null;
  section: { name: string } | null;
}

function PaletteChip({ block, onRemove }: { block: PaletteBlockType; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${block.id}`,
    data: { type: 'palette' as const, block },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined, borderLeftColor: colorForId(block.id) }}
      className={`group flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg border-l-4 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 shadow-xs cursor-grab active:cursor-grabbing select-none touch-none ${isDragging ? 'opacity-40' : ''}`}
    >
      <div>
        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{block.subject}</div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400">{block.teacherName}</div>
      </div>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={`Remove ${block.subject} block`}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 p-1"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

const TimetableGrid = () => {
  const t = useT();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isTeacher = user?.role === 'TEACHER';
  const isStudent = user?.role === 'STUDENT';
  const isGuardian = user?.role === 'GUARDIAN';
  // Only Super Admin / Admin may create, move, or delete periods — everyone
  // else (incl. Teacher, whose own schedule is read from their assignments)
  // gets a read-only view, per the redesign brief.
  const isEditor = isAdmin;

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('None');
  const [rawSlots, setRawSlots] = useState<any[]>([]);
  const [routine, setRoutine] = useState<Record<string, Record<string, RoutineEntry>>>({});
  const [loading, setLoading] = useState(true);

  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [branchId, setBranchId] = useState<string | null>(null);

  // Guardian: which linked child's routine is shown — resolved to a
  // className/sectionName, the only real query the shared /timetables list
  // endpoint supports without a student *user* id (which the guardian's own
  // linked-children endpoint does not expose).
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);
  const selectedChild = children.find((c) => c.id === selectedChildId) || null;

  // Settings (visible days / period rows) — persisted per-browser, per
  // institution. Merged with whatever the fetched slots actually contain so
  // an existing slot is never hidden by a narrower saved layout.
  const [settings, setSettings] = useState<TimetableSettings>(() => loadTimetableSettings(user?.institutionId));
  const effectiveSettings = useMemo(() => mergeWithSlots(settings, rawSlots), [settings, rawSlots]);

  const handleSaveSettings = (next: TimetableSettings) => {
    setSettings(next);
    saveTimetableSettings(user?.institutionId, next);
  };

  // Add / Move-Edit modal — the keyboard-operable alternative to drag-drop.
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editInitial, setEditInitial] = useState<TimetableEditInitial | null>(null);

  // Drag-and-drop routine builder palette (Admin only) — session-only state.
  const [paletteBlocks, setPaletteBlocks] = useState<PaletteBlockType[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(FALLBACK_SUBJECTS_JUNIOR);
  const [newBlockSubject, setNewBlockSubject] = useState('');
  const [newBlockTeacherUserId, setNewBlockTeacherUserId] = useState('');
  const [activeDragData, setActiveDragData] = useState<any>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const buildQueryParams = () => {
    if (isAdmin) {
      return `?className=${encodeURIComponent(selectedClass)}&sectionName=${encodeURIComponent(selectedSection)}&pageSize=100`;
    } else if (isTeacher) {
      return `?teacherUserId=${user!.id}&pageSize=100`;
    } else if (isStudent) {
      return `?studentUserId=${user!.id}&pageSize=100`;
    } else if (isGuardian && selectedChild?.class?.name && selectedChild?.section?.name) {
      return `?className=${encodeURIComponent(selectedChild.class.name)}&sectionName=${encodeURIComponent(selectedChild.section.name)}&pageSize=100`;
    }
    return '?pageSize=100';
  };

  const canFetch = () => {
    if (!user) return false;
    if (isAdmin) return !!(selectedClass && selectedSection);
    if (isGuardian) return !childrenLoading && !!selectedChild?.class?.name && !!selectedChild?.section?.name;
    return true;
  };

  const fetchTimetables = async () => {
    if (!canFetch()) return;
    try {
      setLoading(true);
      const response = await apiClient.get(`/timetables${buildQueryParams()}`);
      const slots = Array.isArray(response.data.data) ? response.data.data : [];
      setRawSlots(slots);

      const formattedRoutine: Record<string, Record<string, RoutineEntry>> = {};
      slots.forEach((slot: any) => {
        if (!formattedRoutine[slot.dayOfWeek]) formattedRoutine[slot.dayOfWeek] = {};
        formattedRoutine[slot.dayOfWeek][slot.startTime] = {
          id: slot.id,
          subject: slot.subject,
          teacher: slot.teacher?.user ? `${slot.teacher.user.firstName} ${slot.teacher.user.lastName}` : 'Unassigned',
          teacherUserId: slot.teacher?.user?.id,
          className: slot.className,
          sectionName: slot.sectionName,
        } as RoutineEntry;
      });
      setRoutine(formattedRoutine);
    } catch (error) {
      console.error('Failed to fetch timetables', error);
      toast.error(t('Failed to load timetables'));
    } finally {
      setLoading(false);
    }
  };

  // One-time (per user) load of teachers + the real class list.
  useEffect(() => {
    if (!isAdmin) {
      setClassesLoading(false);
      return;
    }
    setClassesLoading(true);
    apiClient.get('/users?role=TEACHER&pageSize=100')
      .then((res) => setTeachers(res.data.data || []))
      .catch(console.error);

    apiClient.get('/students/meta/classes')
      .then((res) => {
        const classList = (res.data.data || []).slice().sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0));
        setClasses(classList);
        setSelectedClass((prev) => (classList.some((c: any) => c.name === prev) ? prev : (classList[0]?.name ?? '')));
      })
      .catch(console.error)
      .finally(() => setClassesLoading(false));
  }, [isAdmin, user]);

  useEffect(() => {
    if (!isAdmin || !selectedClass) return;
    const cls = classes.find((c) => c.name === selectedClass);
    if (!cls) return;
    setBranchId(cls.branchId ?? null);
    setSectionsLoading(true);
    apiClient.get(`/students/meta/sections?classId=${cls.id}`)
      .then((res) => {
        const sectionList = res.data.data || [];
        setSections(sectionList);
        setSelectedSection((prev) => (sectionList.some((s: any) => s.name === prev) ? prev : (sectionList[0]?.name ?? '')));
      })
      .catch(console.error)
      .finally(() => setSectionsLoading(false));
  }, [isAdmin, selectedClass, classes]);

  useEffect(() => {
    if (!isAdmin || !selectedClass) return;
    let cancelled = false;
    const fetchSubjects = async () => {
      try {
        const params: Record<string, string> = { className: selectedClass };
        if (isSeniorClass(selectedClass) && selectedDepartment !== 'None') {
          params.group = selectedDepartment.toUpperCase();
        }
        const res = await apiClient.get('/curriculum/subjects', { params });
        const offerings = res.data?.data || [];
        if (cancelled) return;
        if (offerings.length > 0) {
          setAvailableSubjects(offerings.map((o: any) => o.label));
          return;
        }
      } catch (err) {
        console.warn('Failed to load curriculum subjects, using fallback list', err);
      }
      if (!cancelled) setAvailableSubjects(getFallbackSubjects(selectedClass, selectedDepartment));
    };
    fetchSubjects();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedClass, selectedDepartment]);

  useEffect(() => {
    setNewBlockSubject((prev) => (availableSubjects.includes(prev) ? prev : (availableSubjects[0] ?? '')));
  }, [availableSubjects]);

  // Guardian: linked children, mirroring MyLectureMaterials's own fetch.
  useEffect(() => {
    if (!isGuardian) return;
    apiClient.get('/guardians/me/students')
      .then((res) => {
        const list: ChildSummary[] = res.data.data || [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      })
      .catch((err) => {
        console.error('Failed to load linked children', err);
        toast.error(t('Failed to load your children'));
      })
      .finally(() => setChildrenLoading(false));
  }, [isGuardian]);

  useEffect(() => {
    fetchTimetables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, selectedSection, selectedChildId, childrenLoading, user]);

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadPdf = async () => {
    if (!user) return;
    if (!canFetch()) {
      toast.error(isGuardian ? t('Select a child first') : t('Select a class and section first'));
      return;
    }
    setDownloadingPdf(true);
    try {
      const response = await apiClient.get(`/timetables/pdf${buildQueryParams()}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = isAdmin ? `timetable-${selectedClass}-${selectedSection}.pdf` : 'my-schedule.pdf';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to download timetable PDF'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const addPaletteBlock = () => {
    if (!newBlockSubject.trim() || !newBlockTeacherUserId) return;
    const teacher = teachers.find((tch: any) => tch.id === newBlockTeacherUserId);
    if (!teacher) return;
    setPaletteBlocks((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        subject: newBlockSubject.trim(),
        teacherUserId: newBlockTeacherUserId,
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
      },
    ]);
    setNewBlockSubject('');
    setNewBlockTeacherUserId('');
  };

  const removePaletteBlock = (id: string) => setPaletteBlocks((prev) => prev.filter((b) => b.id !== id));

  const deleteSlot = async (entry: RoutineEntry) => {
    try {
      await apiClient.delete(`/timetables/${entry.id}`);
      toast.success(t('Period removed'));
      fetchTimetables();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to remove period'));
    }
  };

  const openMoveEdit = (day: string, startTime: string, entry?: RoutineEntry) => {
    setEditInitial({
      slotId: entry?.id,
      day,
      startTime,
      subject: entry?.subject,
      teacherUserId: entry?.teacherUserId,
    });
    setEditModalOpen(true);
  };

  const openAdd = () => {
    setEditInitial({ day: effectiveSettings.days[0] || '', startTime: effectiveSettings.periods.find((p) => !p.isBreak)?.start || '' });
    setEditModalOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => setActiveDragData(event.active.data.current);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragData(null);
    const { active, over } = event;
    if (!over) return;

    const { day, period, entry: targetEntry } = over.data.current as {
      day: string;
      period: { start: string; end: string };
      entry?: RoutineEntry;
    };
    const dragData = active.data.current as any;

    if (dragData?.type === 'palette') {
      if (!branchId || !selectedClass || !selectedSection) {
        toast.error(t('Select a class and section first'));
        return;
      }
      const { subject, teacherUserId } = dragData.block as PaletteBlockType;
      try {
        if (targetEntry) {
          await apiClient.put(`/timetables/${targetEntry.id}`, { subject, teacherUserId });
        } else {
          await apiClient.post('/timetables', {
            branchId,
            className: selectedClass,
            sectionName: selectedSection,
            dayOfWeek: day,
            startTime: period.start,
            endTime: period.end,
            subject,
            teacherUserId,
          });
        }
        fetchTimetables();
      } catch (err: any) {
        toast.error(err.response?.data?.message || t('Failed to place block'));
      }
    } else if (dragData?.type === 'slot') {
      const { entry } = dragData as { entry: RoutineEntry };
      if (targetEntry && targetEntry.id === entry.id) return;
      if (targetEntry) {
        toast.error(t('That period is already filled. Drag a palette block onto it to replace it, or remove it first.'));
        return;
      }
      try {
        await apiClient.put(`/timetables/${entry.id}`, {
          dayOfWeek: day,
          startTime: period.start,
          endTime: period.end,
        });
        fetchTimetables();
      } catch (err: any) {
        toast.error(err.response?.data?.message || t('Failed to move period'));
      }
    }
  };

  if (isGuardian && childrenLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">{t('Loading your dashboard...')}</div>;
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title={t('No linked children found')}
          description={t("Contact your school administrator to link your account to your child's student profile.")}
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              {isAdmin && t('Class Routine Timetable')}
              {isTeacher && t('My Teaching Schedule')}
              {isStudent && t('My Class Schedule')}
              {isGuardian && t("My Child's Class Schedule")}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {isAdmin && t('Generate and view class routines across the institution.')}
              {isTeacher && t('View your assigned classes and teaching slots.')}
              {isStudent && t('View your daily class routine and subject teachers.')}
              {isGuardian && t("View your child's daily class routine and subject teachers.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TimetableSettingsPopover settings={settings} onSave={handleSaveSettings} />
            <Button
              variant="secondary"
              onClick={downloadPdf}
              disabled={downloadingPdf || loading || !canFetch()}
              isLoading={downloadingPdf}
              leftIcon={<Download className="w-4 h-4" />}
            >
              {t('Download PDF')}
            </Button>
            {isEditor && (
              <Button variant="gradient" onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />}>
                {t('Add Slot Mapping')}
              </Button>
            )}
          </div>
        </div>

        {isGuardian && children.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  selectedChildId === child.id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                {child.firstName} {child.lastName}
              </button>
            ))}
          </div>
        )}

        {/* Selectors Bar - Admin Only */}
        {isAdmin && (
          <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-6 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-xs">
            <div className="flex flex-col flex-1 min-w-[200px] max-w-xs">
              <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5" /> {t('Select Class')}
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                disabled={classesLoading || classes.length === 0}
                className="input-field pr-10"
              >
                {classesLoading && <option value="">{t('Loading classes...')}</option>}
                {!classesLoading && classes.length === 0 && <option value="">{t('No classes found')}</option>}
                {classes.map((cls) => <option key={cls.id} value={cls.name}>{cls.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col flex-1 min-w-[200px] max-w-xs">
              <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <UserCircle className="w-3.5 h-3.5" /> {t('Select Section')}
              </label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                disabled={sectionsLoading || sections.length === 0}
                className="input-field pr-10"
              >
                {sectionsLoading && <option value="">{t('Loading sections...')}</option>}
                {!sectionsLoading && sections.length === 0 && <option value="">{t('No sections found')}</option>}
                {sections.map((sec: any) => <option key={sec.id} value={sec.name}>{sec.name}</option>)}
              </select>
            </div>

            {isSeniorClass(selectedClass) && (
              <div className="flex flex-col flex-1 min-w-[200px] max-w-xs">
                <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-wider">
                  {t('Department')}
                </label>
                <select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)} className="input-field pr-10">
                  {DEPARTMENTS.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Routine Builder Palette - Admin Only */}
        {isEditor && (
          <div className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('Routine Builder Palette')}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('Define a subject + teacher once, then drag it onto the grid below as many times as needed. On touch devices, use the Add / Move-Edit action on a period instead.')}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Subject')}</label>
                <select
                  value={newBlockSubject}
                  onChange={(e) => setNewBlockSubject(e.target.value)}
                  disabled={availableSubjects.length === 0}
                  className="input-field text-sm py-2 w-48"
                >
                  {availableSubjects.length === 0 && <option value="">{t('No subjects found')}</option>}
                  {availableSubjects.map((sub) => <option key={sub} value={sub}>{sub}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t('Teacher')}</label>
                <select value={newBlockTeacherUserId} onChange={(e) => setNewBlockTeacherUserId(e.target.value)} className="input-field text-sm py-2 w-48">
                  <option value="">{t('Select a teacher')}</option>
                  {teachers.map((tch: any) => <option key={tch.id} value={tch.id}>{tch.firstName} {tch.lastName}</option>)}
                </select>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addPaletteBlock} disabled={!newBlockSubject.trim() || !newBlockTeacherUserId} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                {t('Add Block')}
              </Button>
            </div>

            {paletteBlocks.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200/60 dark:border-white/5">
                {paletteBlocks.map((block) => (
                  <PaletteChip key={block.id} block={block} onRemove={() => removePaletteBlock(block.id)} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic pt-3 border-t border-slate-200/60 dark:border-white/5">
                {t('No blocks yet — add one above, then drag it onto a period below.')}
              </p>
            )}
          </div>
        )}

        <TimetableDesktopGrid
          days={effectiveSettings.days}
          periods={effectiveSettings.periods}
          routine={routine}
          isEditor={isEditor}
          loading={loading}
          onDelete={deleteSlot}
          onMoveEdit={openMoveEdit}
        />
        <TimetableMobileDayView
          days={effectiveSettings.days}
          periods={effectiveSettings.periods}
          routine={routine}
          isEditor={isEditor}
          loading={loading}
          onDelete={deleteSlot}
          onMoveEdit={openMoveEdit}
        />

        <TimetableEditModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          initial={editInitial}
          days={effectiveSettings.days}
          periods={effectiveSettings.periods}
          teachers={teachers}
          branchId={branchId}
          className={selectedClass}
          sectionName={selectedSection}
          onSaved={fetchTimetables}
        />

        <DragOverlay>
          {activeDragData?.type === 'palette' && (
            <div
              className="flex items-center gap-2 pl-3 pr-3 py-2 rounded-lg border-l-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg"
              style={{ borderLeftColor: colorForId(activeDragData.block.id) }}
            >
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{activeDragData.block.subject}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{activeDragData.block.teacherName}</div>
              </div>
            </div>
          )}
          {activeDragData?.type === 'slot' && (
            <div className="rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-300 dark:border-primary-500/30 shadow-lg p-3">
              <div className="text-xs font-bold text-blue-700 dark:text-blue-300">{activeDragData.entry.subject}</div>
              <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5">{activeDragData.entry.teacher}</div>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

export default TimetableGrid;
