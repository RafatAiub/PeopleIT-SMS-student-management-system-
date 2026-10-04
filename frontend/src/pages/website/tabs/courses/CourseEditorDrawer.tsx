import React from 'react';
import toast from 'react-hot-toast';
import { Drawer, Button, Input, Textarea, Select, Tabs, Skeleton, ErrorState, Badge } from '@/components/ui';
import { useT } from '@/i18n';
import { useCourse, useSaveCourse } from '../../sites.queries';
import { SLUG_RE, slugify } from '../../siteUtils';
import { htmlToText, textToHtml } from '../../blog/postBody';
import { MediaField } from '../../media/MediaPicker';
import type { SiteStatus } from '../../sites.types';
import { CurriculumBuilder } from './CurriculumBuilder';
import { EnrollmentsView } from './EnrollmentsView';

interface CourseForm {
  title: string;
  titleBn: string;
  slug: string;
  slugTouched: boolean;
  summary: string;
  description: string;
  coverUrl: string;
  price: string;
  compareAtPrice: string;
  level: string;
  language: string;
  category: string;
  instructorName: string;
  instructorBio: string;
  instructorPhoto: string;
  durationText: string;
  status: SiteStatus;
}

const emptyForm: CourseForm = {
  title: '', titleBn: '', slug: '', slugTouched: false, summary: '', description: '', coverUrl: '',
  price: '0', compareAtPrice: '', level: '', language: '', category: '', instructorName: '', instructorBio: '',
  instructorPhoto: '', durationText: '', status: 'DRAFT',
};

export const CourseEditorDrawer: React.FC<{ open: boolean; courseId: string | null; onClose: () => void }> = ({ open, courseId, onClose }) => {
  const t = useT();
  // Once a "New course" is saved for the first time, the server-issued id takes over from the (null) `courseId`
  // prop so the Curriculum/Enrollments tabs unlock without the caller having to re-render with a new prop.
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const effectiveId = courseId ?? createdId;
  const q = useCourse(open && effectiveId ? effectiveId : undefined);
  const save = useSaveCourse();
  const [tab, setTab] = React.useState<'details' | 'curriculum' | 'enrollments'>('details');
  const [form, setForm] = React.useState<CourseForm>(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const loaded = React.useRef<string | null>(null);
  const set = <K extends keyof CourseForm>(k: K, v: CourseForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!open) { loaded.current = null; setCreatedId(null); setTab('details'); return; }
    if (!effectiveId) {
      if (loaded.current === 'new') return;
      loaded.current = 'new';
      setForm(emptyForm);
      setErrors({});
      return;
    }
    const c = q.data;
    if (!c || loaded.current === c.id) return;
    loaded.current = c.id;
    setForm({
      title: c.title, titleBn: c.titleBn ?? '', slug: c.slug, slugTouched: true, summary: c.summary ?? '',
      description: htmlToText(c.description ?? ''), coverUrl: c.coverUrl ?? '', price: String(c.price ?? 0),
      compareAtPrice: c.compareAtPrice != null ? String(c.compareAtPrice) : '', level: c.level ?? '', language: c.language ?? '',
      category: c.category ?? '', instructorName: c.instructorName ?? '', instructorBio: c.instructorBio ?? '',
      instructorPhoto: c.instructorPhoto ?? '', durationText: c.durationText ?? '', status: c.status,
    });
    setErrors({});
  }, [open, effectiveId, q.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = t('Enter a course title.');
    if (form.slug && !SLUG_RE.test(form.slug)) errs.slug = t('Use lowercase letters, numbers and hyphens only.');
    const price = Number(form.price);
    if (form.price === '' || Number.isNaN(price) || price < 0) errs.price = t('Enter a valid price (0 for free).');
    if (form.compareAtPrice && (Number.isNaN(Number(form.compareAtPrice)) || Number(form.compareAtPrice) < 0)) errs.compareAtPrice = t('Enter a valid amount.');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    save.mutate(
      {
        id: effectiveId ?? undefined,
        data: {
          title: form.title.trim(),
          titleBn: form.titleBn.trim() || undefined,
          slug: form.slug || undefined,
          summary: form.summary.trim() || undefined,
          description: textToHtml(form.description),
          coverUrl: form.coverUrl.trim() || undefined,
          price,
          compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
          level: form.level.trim() || undefined,
          language: form.language.trim() || undefined,
          category: form.category.trim() || undefined,
          instructorName: form.instructorName.trim() || undefined,
          instructorBio: form.instructorBio.trim() || undefined,
          instructorPhoto: form.instructorPhoto.trim() || undefined,
          durationText: form.durationText.trim() || undefined,
          status: form.status,
        },
      },
      {
        onSuccess: (course) => {
          toast.success(t('Course saved.'));
          if (!effectiveId && course?.id) {
            // Newly created: stay open and switch to Curriculum so the admin can add lessons right away.
            loaded.current = course.id;
            setCreatedId(course.id);
            setTab('curriculum');
          } else {
            onClose();
          }
        },
      }
    );
  };

  const loading = !!effectiveId && q.isLoading;
  const course = q.data;
  const savedId = effectiveId;

  return (
    <Drawer
      isOpen={open}
      onClose={save.isPending ? () => {} : onClose}
      title={effectiveId ? t('Edit course') : t('New course')}
      width="xl"
      footer={
        tab === 'details' ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('Cancel')}</Button>
            <Button type="submit" form="site-course-editor" isLoading={save.isPending} disabled={loading}>{t('Save course')}</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>{t('Close')}</Button>
        )
      }
    >
      <div className="space-y-4">
        <Tabs
          idPrefix="course-editor"
          label={t('Course editor sections')}
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          tabs={[
            { id: 'details', label: t('Details') },
            { id: 'curriculum', label: t('Curriculum'), disabled: !savedId, count: course?.lessons?.length },
            { id: 'enrollments', label: t('Enrollments'), disabled: !savedId, count: course?.enrollmentCount },
          ]}
        />
        {!savedId && tab !== 'details' && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('Save the course details first.')}</p>
        )}

        {tab === 'details' &&
          (loading ? (
            <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-32" /></div>
          ) : q.isError ? (
            <ErrorState compact message={t('Could not load the course.')} onRetry={() => q.refetch()} />
          ) : (
            <form id="site-course-editor" className="space-y-4" onSubmit={submit} noValidate>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  id="course-title" label={t('Title')} required value={form.title} error={errors.title}
                  onChange={(e) => { set('title', e.target.value); if (!form.slugTouched) set('slug', slugify(e.target.value)); }}
                />
                <Input id="course-titleBn" label={t('Title (Bangla)')} lang="bn" value={form.titleBn} onChange={(e) => set('titleBn', e.target.value)} />
              </div>
              <Input
                id="course-slug" label={t('Address')} value={form.slug} error={errors.slug} leftIcon={<span className="text-xs font-mono">/courses/</span>}
                onChange={(e) => { set('slugTouched', true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
              />
              <Textarea id="course-summary" label={t('Short summary')} rows={2} value={form.summary} onChange={(e) => set('summary', e.target.value)} helperText={t('Shown in the course catalogue.')} />
              <Textarea id="course-description" label={t('Full description')} rows={6} value={form.description} onChange={(e) => set('description', e.target.value)} helperText={t('Leave an empty line between paragraphs.')} />
              <MediaField id="course-cover" label={t('Cover image')} value={form.coverUrl} onChange={(v) => set('coverUrl', v)} />

              <div className="grid gap-3 sm:grid-cols-2">
                <Input id="course-price" label={t('Price')} required inputMode="decimal" value={form.price} error={errors.price} helperText={t('0 = free course.')} onChange={(e) => set('price', e.target.value.replace(/[^0-9.]/g, ''))} />
                <Input id="course-compare" label={t('Compare-at price')} inputMode="decimal" value={form.compareAtPrice} error={errors.compareAtPrice} onChange={(e) => set('compareAtPrice', e.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input id="course-level" label={t('Level')} placeholder={t('e.g. Beginner')} value={form.level} onChange={(e) => set('level', e.target.value)} />
                <Input id="course-language" label={t('Language')} value={form.language} onChange={(e) => set('language', e.target.value)} />
                <Input id="course-category" label={t('Category')} value={form.category} onChange={(e) => set('category', e.target.value)} />
              </div>
              <Input id="course-duration" label={t('Duration (shown to visitors)')} placeholder={t('e.g. 6 weeks')} value={form.durationText} onChange={(e) => set('durationText', e.target.value)} />

              <hr className="border-slate-100 dark:border-white/6" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input id="course-instructor-name" label={t('Instructor name')} value={form.instructorName} onChange={(e) => set('instructorName', e.target.value)} />
                <MediaField id="course-instructor-photo" label={t('Instructor photo')} value={form.instructorPhoto} onChange={(v) => set('instructorPhoto', v)} />
              </div>
              <Textarea id="course-instructor-bio" label={t('Instructor bio')} rows={3} value={form.instructorBio} onChange={(e) => set('instructorBio', e.target.value)} />

              <Select
                id="course-status" label={t('Status')} value={form.status} onChange={(e) => set('status', e.target.value as SiteStatus)}
                options={[{ value: 'DRAFT', label: t('Draft (hidden from the catalogue)') }, { value: 'PUBLISHED', label: t('Published') }]}
              />
            </form>
          ))}

        {tab === 'curriculum' && savedId && (
          <CurriculumBuilder courseId={savedId} lessons={course?.lessons ?? []} isLoading={loading} />
        )}

        {tab === 'enrollments' && savedId && (
          <div>
            {typeof course?.enrollmentCount === 'number' && (
              <div className="mb-2"><Badge variant="primary">{t('{n} total', { n: course.enrollmentCount })}</Badge></div>
            )}
            <EnrollmentsView courseId={savedId} />
          </div>
        )}
      </div>
    </Drawer>
  );
};
