/**
 * Live school-data blocks (read-only feeds). Each one fetches the public
 * data endpoint for the current siteId, and shows skeleton / empty / error
 * states. No sample data is ever shown as real.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Bell, BookOpenCheck, CalendarDays, ChevronLeft, ChevronRight, CreditCard, Newspaper, Paperclip, Trophy, UserRound } from 'lucide-react';
import { SiteApiError } from '../api';
import { useSiteData, useSiteText } from '../runtime';
import { formatSiteDate, formatSiteNumber } from '../strings';
import type { PublicEvent } from '../types';
import { CourseCard } from './commerce';
import { StatGrid } from './content';
import {
  BlockSection, EmptyBlock, ErrorBlock, i18nField, introFields, NotConnected, numberField, optimiseImage, radioField,
  sectionDefaults, sectionFields, SectionIntro, selectField, SiteLink, SkeletonRows, textField, type SectionProps, type SiteBlock,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', intro: '', introBn: '', align: 'left' };

interface FeedState<T> { node?: ReactNode; empty?: boolean; data?: T }

/** Loading / not-connected / error / empty switch shared by every feed. */
function feedState<T>(q: { connected: boolean; isLoading: boolean; isError: boolean; data?: T; refetch: () => unknown }, isEmpty: (d: T) => boolean): FeedState<T> {
  if (!q.connected) return { node: <NotConnected /> };
  if (q.isLoading) return { node: <SkeletonRows /> };
  if (q.isError) return { node: <ErrorBlock onRetry={() => void q.refetch()} /> };
  if (q.data === undefined || isEmpty(q.data)) return { empty: true };
  return { data: q.data };
}

/* ── Notices ────────────────────────────────────────────────────────────── */

export const Notices: SiteBlock = {
  label: 'Notices (live)',
  fields: { ...introFields, limit: numberField('How many', 1, 20), showBody: radioField('Show summary', [[true, 'Yes'], [false, 'No']]), viewAllHref: textField('“View all” link (optional)'), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Notice board', headingBn: 'নোটিশ বোর্ড', limit: 5, showBody: true, viewAllHref: '/notices', ...sectionDefaults },
  render: (p) => <NoticesView {...p} />,
};

function NoticesView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const limit = Math.max(1, Math.min(20, Number(p.limit) || 5));
  const q = useSiteData(['notices', limit], (id, api) => api.notices(id, limit));
  const st = feedState(q, (d) => d.length === 0);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {st.node ?? (st.empty ? <EmptyBlock icon={<Bell size={28} />} title={s('No notices right now')} hint={s('Published notices for everyone will appear here.')} /> : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {st.data!.map((n) => (
            <li key={n.id} className="site-card site-card-pad flex gap-4">
              <div className="flex w-14 flex-none flex-col items-center justify-center text-center" style={{ background: 'var(--site-primary-soft)', borderRadius: 'var(--site-radius)' }}>
                <span className="text-xl font-extrabold leading-none">{formatSiteDate(n.date, lang, { day: 'numeric' })}</span>
                <span className="text-xs">{formatSiteDate(n.date, lang, { month: 'short' })}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="site-h4">{n.title}</h3>
                {p.showBody !== false && n.body && <p className="site-muted mt-1 line-clamp-3 whitespace-pre-line text-sm">{n.body}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {n.date && <time dateTime={n.date} className="site-muted">{formatSiteDate(n.date, lang)}</time>}
                  {n.priority && /high|urgent/i.test(n.priority) && <span className="site-badge site-badge-accent">!</span>}
                  {n.attachmentUrl && <SiteLink href={n.attachmentUrl} className="inline-flex items-center gap-1 font-semibold"><Paperclip size={14} aria-hidden />{s('Download attachment')}</SiteLink>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ))}
      {p.viewAllHref && st.data && <div className="mt-5"><SiteLink href={p.viewAllHref} className="site-btn site-btn-outline site-btn-sm">{s('View all')}</SiteLink></div>}
    </BlockSection>
  );
}

/* ── Events calendar ────────────────────────────────────────────────────── */

export const EventsCalendar: SiteBlock = {
  label: 'Events calendar (live)',
  fields: { ...introFields, view: radioField('View', [['calendar', 'Month calendar + list'], ['list', 'Upcoming list']]), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Events & holidays', headingBn: 'অনুষ্ঠান ও ছুটি', view: 'calendar', ...sectionDefaults },
  render: (p) => <EventsView {...p} />,
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function EventsView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const list = p.view === 'list';
  const from = list ? ymd(new Date()) : ymd(month);
  const to = list ? ymd(new Date(Date.now() + 120 * 864e5)) : ymd(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const q = useSiteData(['events', from, to], (id, api) => api.events(id, { from, to }));
  const events = useMemo(() => (q.data ?? []).slice().sort((a, b) => a.start.localeCompare(b.start)), [q.data]);

  const byDay = useMemo(() => {
    const m: Record<string, PublicEvent[]> = {};
    for (const e of events) {
      const start = new Date(e.start.slice(0, 10));
      const end = e.end ? new Date(e.end.slice(0, 10)) : start;
      for (let d = new Date(start), i = 0; d <= end && i < 62; d.setDate(d.getDate() + 1), i++) (m[ymd(d)] ??= []).push(e);
    }
    return m;
  }, [events]);

  const listNode = !q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !events.length ? (
    <EmptyBlock icon={<CalendarDays size={28} />} title={s('No events this month')} />
  ) : (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {events.map((e) => (
        <li key={e.id} className="site-card site-card-pad flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="site-h4">{e.title}</h3>
            <p className="site-muted text-sm">
              <time dateTime={e.start}>{formatSiteDate(e.start, lang, { weekday: 'short', day: 'numeric', month: 'short' })}</time>
              {e.end && e.end.slice(0, 10) !== e.start.slice(0, 10) && <> – <time dateTime={e.end}>{formatSiteDate(e.end, lang, { day: 'numeric', month: 'short' })}</time></>}
              {e.location && <> · {e.location}</>}
            </p>
            {e.description && <p className="mt-1 text-sm">{e.description}</p>}
          </div>
          <span className={`site-badge ${e.kind === 'HOLIDAY' ? 'site-badge-accent' : ''}`}>{e.kind === 'HOLIDAY' ? s('Holiday') : s('Event')}</span>
        </li>
      ))}
    </ul>
  );

  if (list) return <BlockSection {...(p as SectionProps)}><SectionIntro {...p} />{listNode}</BlockSection>;

  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = ymd(new Date());
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => (i < first || i >= first + days ? null : i - first + 1));
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="site-card site-card-pad">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" className="site-btn site-btn-ghost site-btn-sm" aria-label={s('Previous month')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
            <p className="font-bold" aria-live="polite">{formatSiteDate(month, lang, { month: 'long', year: 'numeric' })}</p>
            <button type="button" className="site-btn site-btn-ghost site-btn-sm" aria-label={s('Next month')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm" role="grid">
            {WEEKDAYS.map((w) => <div key={w} className="site-muted py-1 text-xs font-semibold" role="columnheader">{s(w)}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const key = `${month.getFullYear()}-${pad2(month.getMonth() + 1)}-${pad2(d)}`;
              const evs = byDay[key] ?? [];
              const holiday = evs.some((e) => e.kind === 'HOLIDAY');
              return (
                <div key={i} role="gridcell" title={evs.map((e) => e.title).join(', ') || undefined}
                  className="relative flex aspect-square flex-col items-center justify-center"
                  style={{ borderRadius: 'var(--site-radius)', background: holiday ? 'var(--site-accent-soft)' : evs.length ? 'var(--site-primary-soft)' : undefined, outline: key === today ? '2px solid var(--site-primary)' : undefined }}>
                  <span className={evs.length ? 'font-bold' : ''}>{formatSiteNumber(d, lang)}</span>
                  {evs.length > 0 && <span aria-hidden className="absolute bottom-1 h-1.5 w-1.5 rounded-full" style={{ background: holiday ? 'var(--site-accent)' : 'var(--site-primary)' }} />}
                </div>
              );
            })}
          </div>
        </div>
        <div>{listNode}</div>
      </div>
    </BlockSection>
  );
}

/* ── Teacher directory ──────────────────────────────────────────────────── */

export const TeacherDirectory: SiteBlock = {
  label: 'Teacher directory (live)',
  fields: { ...introFields, limit: numberField('Show at most (0 = all)', 0, 500), columns: selectField('Columns', [['2', '2'], ['3', '3'], ['4', '4']]), searchable: radioField('Search box', [[true, 'Yes'], [false, 'No']]), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Our teachers', headingBn: 'আমাদের শিক্ষকবৃন্দ', limit: 0, columns: '4', searchable: true, ...sectionDefaults },
  render: (p) => <TeachersView {...p} />,
};

const TCOLS: Record<string, string> = { '2': 'grid-cols-2', '3': 'grid-cols-2 md:grid-cols-3', '4': 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' };

function TeachersView(p: Record<string, any>) {
  const { s } = useSiteText();
  const [term, setTerm] = useState('');
  const q = useSiteData(['teachers'], (id, api) => api.teachers(id), { staleTime: 5 * 60_000 });
  const st = feedState(q, (d) => d.length === 0);
  const limit = Number(p.limit) || 0;
  const shown = (st.data ?? [])
    .filter((t) => !term || `${t.name} ${t.subject ?? ''} ${t.designation ?? ''}`.toLowerCase().includes(term.toLowerCase()))
    .slice(0, limit > 0 ? limit : undefined);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {st.node ?? (st.empty ? <EmptyBlock icon={<UserRound size={28} />} title={s('No teacher profiles yet')} hint={s('Teacher profiles will appear here once they are added.')} /> : (
        <>
          {p.searchable !== false && (st.data?.length ?? 0) > 8 && (
            <input type="search" className="site-input mb-5 max-w-sm" placeholder={`${s('Teacher')}…`} aria-label={s('Teacher')} value={term} onChange={(e) => setTerm(e.target.value)} />
          )}
          <ul className={`m-0 grid list-none gap-4 p-0 ${TCOLS[p.columns] ?? TCOLS['4']}`}>
            {shown.map((t) => (
              <li key={t.id} className="site-card flex flex-col text-center">
                {t.photo ? (
                  <img src={optimiseImage(t.photo, 400)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <div aria-hidden className="flex aspect-square w-full items-center justify-center text-3xl font-bold" style={{ background: 'var(--site-primary-soft)' }}>
                    {t.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
                  </div>
                )}
                <div className="flex flex-col gap-0.5 p-3">
                  <p className="font-semibold leading-snug">{t.name}</p>
                  {t.designation && <p className="site-muted text-sm">{t.designation}</p>}
                  {t.subject && <p className="text-sm" style={{ color: 'var(--site-primary-text)' }}>{t.subject}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      ))}
    </BlockSection>
  );
}

/* ── Toppers / merit ────────────────────────────────────────────────────── */

export const Toppers: SiteBlock = {
  label: 'Toppers / merit (live)',
  fields: { ...introFields, examId: textField('Exam ID (empty = latest published)'), limit: numberField('How many', 1, 50), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Our achievers', headingBn: 'আমাদের কৃতী শিক্ষার্থী', examId: '', limit: 10, ...sectionDefaults, tone: 'surface' },
  render: (p) => <ToppersView {...p} />,
};

function ToppersView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const limit = Math.max(1, Math.min(50, Number(p.limit) || 10));
  const examId = String(p.examId ?? '').trim() || undefined;
  const q = useSiteData(['toppers', examId, limit], (id, api) => api.toppers(id, { examId, limit }));
  const disabled = q.isError && q.error instanceof SiteApiError && [403, 404].includes(q.error.status);
  const empty = <EmptyBlock icon={<Trophy size={28} />} title={s('The merit list isn’t published yet')} hint={s('Top results appear here after the school publishes them.')} />;
  const st: FeedState<NonNullable<typeof q.data>> = disabled ? { empty: true } : feedState(q, (d) => d.length === 0);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {st.node ?? (st.empty ? empty : (
        <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {st.data!.map((t, i) => (
            <li key={`${t.name}-${i}`} className="site-card site-card-pad flex items-center gap-4">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-lg font-extrabold" style={{ background: i < 3 ? 'var(--site-accent)' : 'var(--site-primary-soft)', color: i < 3 ? 'var(--site-on-accent)' : undefined }}>
                {formatSiteNumber(i + 1, lang)}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{t.name}</p>
                <p className="site-muted text-sm">{[t.className && `${s('Class')} ${t.className}`, t.examName].filter(Boolean).join(' · ')}</p>
              </div>
              {t.gpa != null && <span className="ml-auto text-right"><span className="block text-xs site-muted">{s('GPA')}</span><span className="text-lg font-bold">{String(t.gpa)}</span></span>}
            </li>
          ))}
        </ol>
      ))}
    </BlockSection>
  );
}

/* ── Stats (live) ───────────────────────────────────────────────────────── */

export const StatsLive: SiteBlock = {
  label: 'Stats (live)',
  fields: {
    ...introFields,
    showStudents: radioField('Students', [[true, 'Show'], [false, 'Hide']]),
    showTeachers: radioField('Teachers', [[true, 'Show'], [false, 'Hide']]),
    showClasses: radioField('Classes', [[true, 'Show'], [false, 'Hide']]),
    showYears: radioField('Years established', [[true, 'Show'], [false, 'Hide']]),
    animate: radioField('Count up on scroll', [[true, 'Yes'], [false, 'No']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: '', headingBn: '', showStudents: true, showTeachers: true, showClasses: true, showYears: true, animate: true, ...sectionDefaults, tone: 'primary' },
  render: (p) => <StatsLiveView {...p} />,
};

function StatsLiveView(p: Record<string, any>) {
  const { s } = useSiteText();
  const q = useSiteData(['stats'], (id, api) => api.stats(id), { staleTime: 10 * 60_000 });
  const items = q.data
    ? [
        p.showStudents !== false && q.data.students ? { value: q.data.students, suffix: '+', label: 'Students', labelBn: s('Students') } : null,
        p.showTeachers !== false && q.data.teachers ? { value: q.data.teachers, label: 'Teachers', labelBn: s('Teachers') } : null,
        p.showClasses !== false && q.data.classes ? { value: q.data.classes, label: 'Classes', labelBn: s('Classes') } : null,
        p.showYears !== false && q.data.yearsEstablished ? { value: q.data.yearsEstablished, suffix: '+', label: 'Years of excellence', labelBn: s('Years of excellence') } : null,
      ].filter(Boolean) as Array<{ value: number; suffix?: string; label: string; labelBn: string }>
    : [];
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows rows={1} className="h-20" /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !items.length ? (
        <EmptyBlock title={s('Figures will appear once the school’s records are set up.')} />
      ) : <StatGrid items={items} animate={p.animate !== false} />}
    </BlockSection>
  );
}

/* ── Online fee payment link ────────────────────────────────────────────── */

export const FeePayment: SiteBlock = {
  label: 'Online fee payment (live)',
  fields: { ...introFields, ...i18nField('buttonLabel', 'Button label'), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Pay fees online', headingBn: 'অনলাইনে ফি পরিশোধ', intro: 'Guardians can pay securely through the guardian portal.', introBn: 'অভিভাবকরা অভিভাবক পোর্টালের মাধ্যমে নিরাপদে ফি দিতে পারবেন।', buttonLabel: '', buttonLabelBn: '', ...sectionDefaults, width: 'narrow' },
  render: (p) => <FeePaymentView {...p} />,
};

function FeePaymentView(p: Record<string, any>) {
  const { s, tx } = useSiteText();
  const q = useSiteData(['fees-link'], (id, api) => api.feesLink(id));
  return (
    <BlockSection {...(p as SectionProps)}>
      <div className="site-card site-card-pad flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 flex-none items-center justify-center" style={{ background: 'var(--site-primary-soft)', borderRadius: 'var(--site-radius)' }}><CreditCard aria-hidden /></span>
        <div className="flex-1"><SectionIntro {...p} className="!mb-0" /></div>
        {!q.connected ? null : q.isLoading ? <div className="site-skeleton h-11 w-44" /> : q.data?.enabled && q.data.url ? (
          <SiteLink href={q.data.url} className="site-btn site-btn-primary">{tx(p.buttonLabel, p.buttonLabelBn) || s('Go to the guardian portal')}</SiteLink>
        ) : null}
      </div>
      {q.data?.enabled && q.data.demo && <p className="site-alert site-alert-warning mt-3 text-sm">{s('Demo mode')}: {s('Online payment is in test mode.')}</p>}
      {!q.connected ? <div className="mt-3"><NotConnected /></div> : q.isError ? <div className="mt-3"><ErrorBlock onRetry={() => void q.refetch()} /></div> : q.data && !(q.data.enabled && q.data.url) ? (
        <div className="mt-3"><EmptyBlock title={s('Online payment isn’t available yet')} hint={s('Please contact the school office to pay fees.')} /></div>
      ) : null}
    </BlockSection>
  );
}

/* ── Latest news (posts) ────────────────────────────────────────────────── */

export const LatestNews: SiteBlock = {
  label: 'Latest news (live)',
  fields: { ...introFields, limit: numberField('How many', 1, 12), tag: textField('Only posts tagged (optional)'), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'News & updates', headingBn: 'খবর ও আপডেট', limit: 3, tag: '', ...sectionDefaults },
  render: (p) => <LatestNewsView {...p} />,
};

function LatestNewsView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const limit = Math.max(1, Math.min(12, Number(p.limit) || 3));
  const tag = String(p.tag ?? '').trim() || undefined;
  const q = useSiteData(['posts', 1, limit, tag], (id, api) => api.posts(id, { page: 1, pageSize: limit, tag }));
  const st = feedState(q, (d) => d.items.length === 0);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {st.node ?? (st.empty ? <EmptyBlock icon={<Newspaper size={28} />} title={s('No posts yet')} hint={s('News and updates will appear here once they’re published.')} /> : (
        <>
          <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {st.data!.items.slice(0, limit).map((post) => (
              <li key={post.id} className="site-card flex flex-col">
                {post.coverUrl && <img src={optimiseImage(post.coverUrl, 800)} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
                <div className="site-card-pad flex flex-1 flex-col gap-2">
                  {post.publishedAt && <time className="site-muted text-sm" dateTime={post.publishedAt}>{formatSiteDate(post.publishedAt, lang)}</time>}
                  <h3 className="site-h4"><SiteLink href={`/blog/${post.slug}`} className="hover:underline">{post.title}</SiteLink></h3>
                  {post.excerpt && <p className="site-muted line-clamp-3 text-sm">{post.excerpt}</p>}
                  <SiteLink href={`/blog/${post.slug}`} className="mt-auto pt-2 text-sm font-semibold">{s('Read more')} →</SiteLink>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6"><SiteLink href="/blog" className="site-btn site-btn-outline site-btn-sm">{s('View all')}</SiteLink></div>
        </>
      ))}
    </BlockSection>
  );
}

/* ── Courses (now backed by the real course catalogue — LMS wave) ──────── */

export const Courses: SiteBlock = {
  label: 'Courses (live)',
  fields: { ...introFields, limit: numberField('How many', 1, 12), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Courses', headingBn: 'কোর্সসমূহ', limit: 6, ...sectionDefaults },
  render: (p) => <CoursesView {...p} />,
};

function CoursesView(p: Record<string, any>) {
  const { s } = useSiteText();
  const limit = Math.max(1, Math.min(12, Number(p.limit) || 6));
  // `/data/courses` returns real published courses now (was always `[]` before the LMS wave).
  const q = useSiteData(['courses-data', limit], (id, api) => api.courses(id, limit));
  const st = feedState(q, (d) => d.length === 0);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {st.node ?? (st.empty ? <EmptyBlock icon={<BookOpenCheck size={28} />} title={s('No courses yet')} hint={s('Courses will appear here once they’re published.')} /> : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {st.data!.slice(0, limit).map((course) => <CourseCard key={course.id} course={course} />)}
        </div>
      ))}
    </BlockSection>
  );
}
