import React from 'react';
import { Eye, EyeOff, FileText, GripVertical, Link2, Pencil, Plus, Trash2, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Badge, Modal, Input, Textarea, Select, Checkbox, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { useSaveLesson, useDeleteLesson, useReorderLessons } from '../../sites.queries';
import { htmlToText, textToHtml } from '../../blog/postBody';
import { MediaField } from '../../media/MediaPicker';
import type { SiteCourseLesson, SiteLessonKind } from '../../sites.types';

const KIND_ICON: Record<SiteLessonKind, React.ReactNode> = {
  VIDEO: <Video className="w-4 h-4" aria-hidden />,
  TEXT: <FileText className="w-4 h-4" aria-hidden />,
  FILE: <FileText className="w-4 h-4" aria-hidden />,
  EMBED: <Link2 className="w-4 h-4" aria-hidden />,
};

const KIND_LABEL: Record<SiteLessonKind, string> = {
  VIDEO: 'Video',
  TEXT: 'Text',
  FILE: 'File download',
  EMBED: 'Embed',
};

interface LessonForm {
  module: string;
  title: string;
  kind: SiteLessonKind;
  videoUrl: string;
  body: string;
  fileUrl: string;
  durationMin: string;
  isFreePreview: boolean;
}

const emptyLessonForm = (module: string): LessonForm => ({
  module, title: '', kind: 'VIDEO', videoUrl: '', body: '', fileUrl: '', durationMin: '', isFreePreview: false,
});

const LessonEditorModal: React.FC<{
  courseId: string;
  lesson: SiteCourseLesson | null;
  defaultModule: string;
  isOpen: boolean;
  onClose: () => void;
}> = ({ courseId, lesson, defaultModule, isOpen, onClose }) => {
  const t = useT();
  const save = useSaveLesson();
  const [form, setForm] = React.useState<LessonForm>(emptyLessonForm(defaultModule));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = <K extends keyof LessonForm>(k: K, v: LessonForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!isOpen) return;
    if (lesson) {
      setForm({
        module: lesson.module ?? '', title: lesson.title, kind: lesson.kind, videoUrl: lesson.videoUrl ?? '',
        body: htmlToText(lesson.body ?? ''), fileUrl: lesson.fileUrl ?? '',
        durationMin: lesson.durationMin != null ? String(lesson.durationMin) : '', isFreePreview: lesson.isFreePreview,
      });
    } else {
      setForm(emptyLessonForm(defaultModule));
    }
    setErrors({});
  }, [isOpen, lesson, defaultModule]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = t('Enter a lesson title.');
    if ((form.kind === 'VIDEO' || form.kind === 'EMBED') && !form.videoUrl.trim()) errs.videoUrl = t('Add the video or embed link.');
    if (form.kind === 'TEXT' && !form.body.trim()) errs.body = t('Write the lesson content.');
    if (form.kind === 'FILE' && !form.fileUrl.trim()) errs.fileUrl = t('Choose a file for this lesson.');
    if (form.durationMin && (Number.isNaN(Number(form.durationMin)) || Number(form.durationMin) < 0)) errs.durationMin = t('Enter a valid number of minutes.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    save.mutate(
      {
        courseId,
        lessonId: lesson?.id,
        data: {
          module: form.module.trim() || undefined,
          title: form.title.trim(),
          kind: form.kind,
          videoUrl: form.kind === 'VIDEO' || form.kind === 'EMBED' ? form.videoUrl.trim() : undefined,
          body: form.kind === 'TEXT' ? textToHtml(form.body) : undefined,
          fileUrl: form.kind === 'FILE' ? form.fileUrl.trim() : undefined,
          durationMin: form.durationMin ? Number(form.durationMin) : null,
          isFreePreview: form.isFreePreview,
        },
      },
      { onSuccess: () => { toast.success(t('Lesson saved.')); onClose(); } }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={save.isPending ? () => {} : onClose}
      title={lesson ? t('Edit lesson') : t('New lesson')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
          <Button type="submit" form="site-lesson-editor" isLoading={save.isPending}>{t('Save lesson')}</Button>
        </>
      }
    >
      <form id="site-lesson-editor" className="space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="lesson-title" label={t('Title')} required value={form.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
          <Input id="lesson-module" label={t('Module / section')} value={form.module} onChange={(e) => set('module', e.target.value)} helperText={t('Groups lessons together, e.g. “Week 1”.')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            id="lesson-kind" label={t('Type')} value={form.kind} onChange={(e) => set('kind', e.target.value as SiteLessonKind)}
            options={(Object.keys(KIND_LABEL) as SiteLessonKind[]).map((k) => ({ value: k, label: t(KIND_LABEL[k]) }))}
          />
          <Input id="lesson-duration" label={t('Duration (minutes)')} inputMode="numeric" value={form.durationMin} error={errors.durationMin} onChange={(e) => set('durationMin', e.target.value.replace(/\D/g, ''))} />
        </div>

        {(form.kind === 'VIDEO' || form.kind === 'EMBED') && (
          <Input
            id="lesson-video" label={form.kind === 'VIDEO' ? t('Video link (YouTube, Vimeo or a direct file)') : t('Embed link')}
            required value={form.videoUrl} error={errors.videoUrl} onChange={(e) => set('videoUrl', e.target.value)}
          />
        )}
        {form.kind === 'TEXT' && (
          <Textarea id="lesson-body" label={t('Lesson content')} required rows={8} value={form.body} error={errors.body} onChange={(e) => set('body', e.target.value)} helperText={t('Leave an empty line between paragraphs.')} />
        )}
        {form.kind === 'FILE' && (
          <MediaField id="lesson-file" label={t('File')} kind="FILE" value={form.fileUrl} onChange={(v) => set('fileUrl', v)} helperText={errors.fileUrl} />
        )}

        <Checkbox
          label={t('Free preview')}
          description={t('Visitors can view this lesson without buying the course.')}
          checked={form.isFreePreview}
          onChange={(e) => set('isFreePreview', e.target.checked)}
        />
      </form>
    </Modal>
  );
};

/** Modules, lessons, drag to reorder (native HTML5 DnD, matching PagesTab/NavigationTab). */
export const CurriculumBuilder: React.FC<{ courseId: string; lessons: SiteCourseLesson[]; isLoading?: boolean }> = ({ courseId, lessons, isLoading }) => {
  const t = useT();
  const reorder = useReorderLessons();
  const del = useDeleteLesson();
  const sorted = React.useMemo(() => [...lessons].sort((a, b) => a.sortOrder - b.sortOrder), [lessons]);
  const [order, setOrder] = React.useState(sorted);
  const [editor, setEditor] = React.useState<{ open: boolean; lesson: SiteCourseLesson | null; module: string }>({ open: false, lesson: null, module: '' });
  const [toDelete, setToDelete] = React.useState<SiteCourseLesson | null>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const [grab, setGrab] = React.useState<number | null>(null);

  React.useEffect(() => setOrder(sorted), [sorted]);

  const commit = (next: SiteCourseLesson[]) => {
    setOrder(next);
    reorder.mutate({ courseId, ids: next.map((l) => l.id) });
  };
  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [l] = next.splice(from, 1);
    next.splice(to, 0, l);
    commit(next);
  };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;

  const lastModule = order.length ? (order[order.length - 1].module ?? '') : '';

  return (
    <div className="space-y-3">
      {order.length === 0 ? (
        <EmptyState
          compact
          icon={<Video />}
          title={t('No lessons yet')}
          description={t('Add your first lesson to start building the curriculum.')}
          action={<Button size="sm" onClick={() => setEditor({ open: true, lesson: null, module: '' })}>{t('Add lesson')}</Button>}
        />
      ) : (
        <ol className="space-y-1.5">
          {order.map((l, i) => {
            const showModuleHeader = i === 0 || (order[i - 1].module ?? '') !== (l.module ?? '');
            return (
              <React.Fragment key={l.id}>
                {showModuleHeader && (l.module || i === 0) && (
                  <li className="pt-2 first:pt-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{l.module || t('Ungrouped lessons')}</p>
                  </li>
                )}
                <li
                  draggable={grab === i}
                  onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); setGrab(null); }}
                  onDragOver={(e) => { if (dragFrom === null) return; e.preventDefault(); setDragOver(i); }}
                  onDrop={(e) => { e.preventDefault(); if (dragFrom !== null) moveTo(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                  className={cn(
                    'rounded-lg border bg-white dark:bg-white/3 px-3 py-2.5 flex items-center gap-3',
                    dragOver === i && dragFrom !== i ? 'border-primary-500' : 'border-slate-200 dark:border-white/10'
                  )}
                >
                  <span className="cursor-grab text-slate-400 shrink-0" aria-hidden title={t('Drag to reorder')} onMouseDown={() => setGrab(i)} onMouseUp={() => setGrab(null)}>
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <span className="w-7 h-7 rounded-md bg-slate-100 dark:bg-white/6 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400">
                    {KIND_ICON[l.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">{l.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t(KIND_LABEL[l.kind])}{l.durationMin ? ` · ${t('{n} min', { n: l.durationMin })}` : ''}
                    </p>
                  </div>
                  {l.isFreePreview ? (
                    <Badge variant="info"><Eye className="w-3 h-3" aria-hidden /> {t('Free preview')}</Badge>
                  ) : (
                    <Badge variant="neutral"><EyeOff className="w-3 h-3" aria-hidden /> {t('Locked')}</Badge>
                  )}
                  <Button size="icon-sm" variant="ghost" aria-label={t('Edit lesson')} onClick={() => setEditor({ open: true, lesson: l, module: l.module ?? '' })}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon-sm" variant="ghost" className="text-red-600 dark:text-red-400" aria-label={t('Delete lesson')} onClick={() => setToDelete(l)}><Trash2 className="w-4 h-4" /></Button>
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      )}
      <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setEditor({ open: true, lesson: null, module: lastModule })}>
        {t('Add lesson')}
      </Button>

      <LessonEditorModal courseId={courseId} lesson={editor.lesson} defaultModule={editor.module} isOpen={editor.open} onClose={() => setEditor({ open: false, lesson: null, module: '' })} />
      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete “{title}”?', { title: toDelete?.title ?? '' })}
        message={t('The lesson and its learner progress are removed. This cannot be undone.')}
        confirmLabel={t('Delete lesson')}
        isLoading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate({ courseId, lessonId: toDelete.id }, { onSuccess: () => setToDelete(null) })}
      />
    </div>
  );
};
