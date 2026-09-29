/** Public course-catalogue routes: `/courses` and `/courses/:slug`. */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, Clock, Download, FileText, Lock, PlayCircle } from 'lucide-react';
import { useSiteAccount } from '../account';
import { SiteApiError } from '../api';
import { CourseCard } from '../blocks/commerce';
import { SiteLink, SkeletonRows } from '../blocks/shared';
import { toVideoEmbed } from '../embed';
import { sanitizeRichText } from '../sanitize';
import { useSiteCart } from '../cart';
import { useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteMoney } from '../strings';
import type { PublicCurriculumLesson } from '../types';
import { useSiteSeo } from './seo';
import { NotFoundWithSeo } from './Pages';

const PAGE_SIZE = 12;

export function CoursesListView() {
  const { siteId, api, lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = useQuery({
    queryKey: ['site-courses-catalogue', siteId, page],
    queryFn: () => api.coursesCatalogue(siteId!, { page, pageSize: PAGE_SIZE }),
    enabled: Boolean(siteId),
    staleTime: 30_000,
  });
  useSiteSeo({ title: `${s('Courses')} | ${settings.siteName}`, lang, siteName: settings.siteName });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;
  const go = (n: number) => { const next = new URLSearchParams(params); next.set('page', String(n)); setParams(next); window.scrollTo({ top: 0 }); };

  if (!settings.courses?.enabled) return <NotFoundWithSeo />;

  return (
    <section className="site-pad-md">
      <div className="site-container">
        <h1 className="site-h1 mb-8">{s('Courses')}</h1>
        {q.isLoading ? <SkeletonRows rows={1} className="h-64" /> : q.isError ? (
          <p className="site-alert site-alert-error" role="alert">{s('Something went wrong')}</p>
        ) : !q.data?.items.length ? (
          <div className="site-empty"><BookOpenCheck size={28} className="opacity-70" /><p className="site-empty-title">{s('No courses yet')}</p><p className="text-sm">{s('Courses will appear here once they’re published.')}</p></div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.items.map((course) => <CourseCard key={course.id} course={course} />)}
          </div>
        )}
        {pages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
            <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>{s('Previous')}</button>
            <span className="site-muted text-sm">{s('Page {page} of {pages}', { page, pages })}</span>
            <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page >= pages} onClick={() => go(page + 1)}>{s('Next')}</button>
          </nav>
        )}
      </div>
    </section>
  );
}

function LessonKindIcon({ kind }: { kind: PublicCurriculumLesson['kind'] }) {
  if (kind === 'VIDEO') return <PlayCircle size={16} aria-hidden />;
  if (kind === 'FILE') return <Download size={16} aria-hidden />;
  return <FileText size={16} aria-hidden />;
}

function LessonPreview({ lesson }: { lesson: PublicCurriculumLesson }) {
  const { s } = useSiteText();
  const preview = lesson.preview;
  if (!preview) return null;
  const embed = preview.videoUrl ? toVideoEmbed(preview.videoUrl) : null;
  return (
    <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: 'var(--site-border)' }}>
      {embed?.kind === 'file' ? (
        <video src={embed.src} controls className="aspect-video w-full bg-black" style={{ borderRadius: 'var(--site-radius)' }} />
      ) : embed ? (
        <iframe src={embed.src} title={lesson.title} className="aspect-video w-full border-0" style={{ borderRadius: 'var(--site-radius)' }} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
      ) : preview.body ? (
        <div className="site-prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(preview.body) }} />
      ) : preview.fileUrl ? (
        <SiteLink href={preview.fileUrl} className="site-btn site-btn-outline site-btn-sm">{s('Download')}</SiteLink>
      ) : null}
    </div>
  );
}

export function CourseDetailView({ slug }: { slug: string }) {
  const { siteId, api, basePath, lang, settings } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const navigate = useNavigate();
  const cart = useSiteCart(siteId);
  const account = useSiteAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['site-course-detail', siteId, slug],
    queryFn: () => api.courseDetail(siteId!, slug),
    enabled: Boolean(siteId),
    staleTime: 30_000,
    retry: (n, e) => n < 1 && !(e instanceof SiteApiError && e.status === 404),
  });
  const course = q.data;
  useSiteSeo(course ? { title: `${tx(course.title, course.titleBn)} | ${settings.siteName}`, description: course.summary, ogImage: course.coverUrl, lang, siteName: settings.siteName } : null);

  if (!settings.courses?.enabled) return <NotFoundWithSeo />;
  if (q.isLoading) return <div className="site-container site-pad-md"><SkeletonRows rows={1} className="h-96" /></div>;
  if (q.isError || !course) return <NotFoundWithSeo />;

  const modules = new Map<string, PublicCurriculumLesson[]>();
  for (const lesson of course.curriculum) {
    const key = lesson.module || '';
    modules.set(key, [...(modules.get(key) ?? []), lesson]);
  }

  const free = course.price <= 0;

  const enrolFree = async () => {
    if (!siteId) return;
    setError(null);
    if (!account.token) { navigate(`${basePath}/account/login`); return; }
    setBusy(true);
    try {
      await api.enrollFree(siteId, slug, account.token);
      navigate(`${basePath}/learn/${slug}`);
    } catch (err) {
      setError(err instanceof SiteApiError ? err.message : s('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const buyNow = () => {
    cart.add({ kind: 'COURSE', refId: course.id, slug: course.slug, name: tx(course.title, course.titleBn), price: course.price, qty: 1, image: course.coverUrl });
    navigate(`${basePath}/checkout`);
  };

  return (
    <>
      <header className="site-tone-soft site-pad-md">
        <div className="site-container grid grid-cols-1 items-center gap-8 md:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-3">
            {course.category && <span className="site-eyebrow">{course.category}</span>}
            <h1 className="site-h1">{tx(course.title, course.titleBn)}</h1>
            {course.summary && <p className="site-lead site-muted">{course.summary}</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {course.instructorName && <span>{s('Instructor')}: <strong>{course.instructorName}</strong></span>}
              {course.level && <span className="site-badge">{course.level}</span>}
              {course.durationText && <span className="flex items-center gap-1"><Clock size={14} aria-hidden />{course.durationText}</span>}
              <span>{course.lessonCount} {s('lessons')}</span>
            </div>
          </div>
          <div className="site-card site-card-pad flex flex-col gap-3">
            {course.coverUrl && <img src={course.coverUrl} alt="" className="aspect-video w-full rounded object-cover" />}
            <p className="text-3xl font-extrabold">{free ? s('Free') : formatSiteMoney(course.price, course.currency, lang)}</p>
            {error && <p className="site-error" role="alert">{error}</p>}
            {free ? (
              <button type="button" className="site-btn site-btn-primary site-btn-lg" onClick={enrolFree} disabled={busy}>{busy ? s('Enrolling…') : s('Enrol')}</button>
            ) : (
              <button type="button" className="site-btn site-btn-primary site-btn-lg" onClick={buyNow}>{s('Buy now')}</button>
            )}
          </div>
        </div>
      </header>

      {course.description && (
        <section className="site-pad-md">
          <div className="site-container site-w-narrow site-prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(course.description) }} />
        </section>
      )}

      <section className="site-pad-md">
        <div className="site-container site-w-narrow">
          <h2 className="site-h2 mb-6">{s('Curriculum')}</h2>
          <div className="flex flex-col gap-4">
            {Array.from(modules.entries()).map(([mod, lessons]) => (
              <div key={mod} className="site-card">
                {mod && <h3 className="site-h4 border-b px-4 py-3" style={{ borderColor: 'var(--site-border)' }}>{mod}</h3>}
                <ul className="m-0 list-none p-0">
                  {lessons.map((lesson) => (
                    <li key={lesson.id} style={{ borderTop: '1px solid var(--site-border)' }}>
                      {lesson.isFreePreview ? (
                        <details>
                          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-3 px-4 py-3">
                            <LessonKindIcon kind={lesson.kind} />
                            <span className="flex-1">{lesson.title}</span>
                            {lesson.durationMin != null && <span className="site-muted text-sm">{lesson.durationMin} min</span>}
                            <span className="site-badge site-badge-accent">{s('Free')}</span>
                          </summary>
                          <LessonPreview lesson={lesson} />
                        </details>
                      ) : (
                        <div className="flex min-h-[44px] items-center gap-3 px-4 py-3 opacity-80">
                          <Lock size={16} aria-hidden />
                          <span className="flex-1">{lesson.title}</span>
                          {lesson.durationMin != null && <span className="site-muted text-sm">{lesson.durationMin} min</span>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
