/** Learner player: `/learn` (enrolled courses) and `/learn/:courseSlug/:lessonId?`. */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Download } from 'lucide-react';
import { useSiteAccount } from '../account';
import { SiteApiError } from '../api';
import { SiteLink, SkeletonRows } from '../blocks/shared';
import { toVideoEmbed } from '../embed';
import { sanitizeRichText } from '../sanitize';
import { useSiteRuntime, useSiteText } from '../runtime';
import type { LearnLesson } from '../types';
import { useSiteSeo } from './seo';

function SignInPrompt() {
  const { s } = useSiteText();
  return (
    <section className="site-pad-lg">
      <div className="site-container site-w-narrow flex flex-col items-center gap-4 text-center">
        <h1 className="site-h2">{s('Please sign in to view your account.')}</h1>
        <div className="flex flex-wrap justify-center gap-3">
          <SiteLink href="/account/login" className="site-btn site-btn-primary">{s('Sign in')}</SiteLink>
          <SiteLink href="/account/register" className="site-btn site-btn-outline">{s('Sign up')}</SiteLink>
        </div>
      </div>
    </section>
  );
}

export function LearnIndexView() {
  const { siteId, api, lang, settings } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const account = useSiteAccount();
  useSiteSeo({ title: `${s('My courses')} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true });
  const q = useQuery({
    queryKey: ['site-account-courses', siteId, account.token],
    queryFn: () => api.accountCourses(siteId!, account.token!),
    enabled: Boolean(siteId && account.token),
    staleTime: 10_000,
  });
  if (!account.token) return <SignInPrompt />;
  return (
    <section className="site-pad-md">
      <div className="site-container site-w-narrow">
        <h1 className="site-h1 mb-6">{s('My courses')}</h1>
        {q.isLoading ? <SkeletonRows rows={2} className="h-24" /> : !q.data?.length ? (
          <p className="site-empty"><span className="site-empty-title">{s('You’re not enrolled in any course yet.')}</span></p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {q.data.map((c) => (
              <li key={c.courseSlug} className="site-card site-card-pad flex items-center gap-4">
                {c.coverUrl && <img src={c.coverUrl} alt="" className="h-16 w-24 flex-none rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{tx(c.title, c.titleBn)}</p>
                  <div className="mt-1 h-2 w-full max-w-xs overflow-hidden rounded-full" style={{ background: 'var(--site-surface-2)' }}>
                    <div className="h-full" style={{ width: `${c.progress}%`, background: 'var(--site-primary)' }} />
                  </div>
                </div>
                <SiteLink href={`/learn/${c.courseSlug}${c.nextLessonId ? `/${c.nextLessonId}` : ''}`} className="site-btn site-btn-primary flex-none">{s('Continue')}</SiteLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LessonBody({ lesson }: { lesson: LearnLesson }) {
  const { s } = useSiteText();
  const embed = lesson.videoUrl ? toVideoEmbed(lesson.videoUrl) : null;
  if (lesson.kind === 'VIDEO' && embed) {
    return embed.kind === 'file'
      ? <video src={embed.src} controls className="aspect-video w-full bg-black" style={{ borderRadius: 'var(--site-radius-lg)' }} />
      : <iframe src={embed.src} title={lesson.title} className="aspect-video w-full border-0" style={{ borderRadius: 'var(--site-radius-lg)' }} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />;
  }
  if (lesson.kind === 'FILE' && lesson.fileUrl) {
    return <SiteLink href={lesson.fileUrl} className="site-btn site-btn-primary"><Download size={16} className="mr-1 inline" aria-hidden />{s('Download')}</SiteLink>;
  }
  if (lesson.body) return <div className="site-prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(lesson.body) }} />;
  return null;
}

export function LearnPlayerView({ courseSlug, lessonId }: { courseSlug: string; lessonId?: string }) {
  const { siteId, api, basePath, lang, settings } = useSiteRuntime();
  const { s, tx } = useSiteText();
  const navigate = useNavigate();
  const account = useSiteAccount();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['site-learn', siteId, courseSlug, account.token],
    queryFn: () => api.learn(siteId!, courseSlug, account.token!),
    enabled: Boolean(siteId && account.token),
    staleTime: 10_000,
  });
  useSiteSeo(q.data ? { title: `${tx(q.data.title, q.data.titleBn)} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true } : null);

  const course = q.data;
  const currentIndex = useMemo(() => (course ? Math.max(0, course.curriculum.findIndex((l) => l.id === lessonId)) : 0), [course, lessonId]);
  const current = course?.curriculum[lessonId ? currentIndex : 0];

  if (!account.token) return <SignInPrompt />;
  if (q.isLoading) return <div className="site-container site-pad-md"><SkeletonRows rows={1} className="h-96" /></div>;
  if (q.isError || !course) {
    const notFound = q.error instanceof SiteApiError && [403, 404].includes(q.error.status);
    return (
      <section className="site-pad-lg">
        <div className="site-container site-w-narrow flex flex-col items-center gap-3 text-center">
          <h1 className="site-h2">{notFound ? s('Page not found') : s('Something went wrong')}</h1>
          <SiteLink href="/learn" className="site-btn site-btn-primary">{s('My courses')}</SiteLink>
        </div>
      </section>
    );
  }
  if (!current) return null;

  const modules = new Map<string, typeof course.curriculum>();
  for (const l of course.curriculum) { const key = l.module || ''; modules.set(key, [...(modules.get(key) ?? []), l]); }
  const completed = new Set(course.completedLessonIds);
  const goto = (id: string) => navigate(`${basePath}/learn/${courseSlug}/${id}`);
  const idx = currentIndex;

  const toggleComplete = async () => {
    if (!siteId || !account.token) return;
    if (completed.has(current.id)) await api.uncompleteLesson(siteId, courseSlug, current.id, account.token);
    else await api.completeLesson(siteId, courseSlug, current.id, account.token);
    void qc.invalidateQueries({ queryKey: ['site-learn', siteId, courseSlug] });
  };

  return (
    <div className="site-container site-pad-md grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="order-2 lg:order-1">
        <p className="site-muted mb-2 text-sm">{s('Your progress')}: {course.progress}%</p>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--site-surface-2)' }}>
          <div className="h-full" style={{ width: `${course.progress}%`, background: 'var(--site-primary)' }} />
        </div>
        <nav aria-label={s('Curriculum')} className="flex flex-col gap-4">
          {Array.from(modules.entries()).map(([mod, lessons]) => (
            <div key={mod} className="site-card">
              {mod && <p className="site-h4 border-b px-3 py-2" style={{ borderColor: 'var(--site-border)' }}>{mod}</p>}
              <ul className="m-0 list-none p-0">
                {lessons.map((l) => (
                  <li key={l.id} style={{ borderTop: '1px solid var(--site-border)' }}>
                    <button type="button" onClick={() => goto(l.id)} className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left" style={l.id === current.id ? { background: 'var(--site-primary-soft)' } : undefined}>
                      {completed.has(l.id) ? <CheckCircle2 size={16} style={{ color: 'var(--site-primary-text)' }} aria-hidden /> : <Circle size={16} className="opacity-40" aria-hidden />}
                      <span className="flex-1 truncate text-sm">{l.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="order-1 flex flex-col gap-4 lg:order-2">
        <h1 className="site-h2">{current.title}</h1>
        <LessonBody lesson={current} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="site-btn site-btn-outline" disabled={idx <= 0} onClick={() => goto(course.curriculum[idx - 1].id)}><ChevronLeft size={16} className="mr-1 inline" aria-hidden />{s('Previous lesson')}</button>
          <button type="button" className={`site-btn ${completed.has(current.id) ? 'site-btn-outline' : 'site-btn-primary'}`} onClick={() => void toggleComplete()}>{completed.has(current.id) ? s('Completed') : s('Mark complete')}</button>
          <button type="button" className="site-btn site-btn-outline" disabled={idx >= course.curriculum.length - 1} onClick={() => goto(course.curriculum[idx + 1].id)}>{s('Next lesson')}<ChevronRight size={16} className="ml-1 inline" aria-hidden /></button>
        </div>
      </main>
    </div>
  );
}
