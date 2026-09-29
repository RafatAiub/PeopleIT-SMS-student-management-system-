/**
 * Generic "Data list" block (C2 — Webflow-style collection list) plus the
 * DSHE portal presets built on it, and a handful of bespoke live blocks whose
 * shape doesn't fit a flat item list (result summary, exam routine, class
 * stats, fee chart, library, transport, profile facts). All read the public
 * data sources added in docs/redesign/WEBSITE_V3_PLAN.md §7.3 through the
 * shared dispatcher in `../dataSources` (kept in sync with the sandbox
 * `SITE.data()` bridge's allow-list).
 */
import { useId, useMemo, useState } from 'react';
import {
  Award, BadgeCheck, BookOpen, Bus, Download as DownloadIcon, FileText, GraduationCap, Landmark, Library as LibraryIcon,
  Megaphone, Users, type LucideIcon,
} from 'lucide-react';
import { fetchSiteData } from '../dataSources';
import type { SiteApi } from '../api';
import { useSiteApi, useSiteData, useSiteText } from '../runtime';
import { formatSiteDate, formatSiteMoney, formatSiteNumber } from '../strings';
import type {
  PublicAdmissionCircular, PublicAlbum, PublicBranch, PublicCommitteeMember, PublicDownload, PublicHoliday, PublicNotice,
  PublicStaffMember,
} from '../types';
import {
  BlockSection, EmptyBlock, ErrorBlock, introFields, NotConnected, numberField, optimiseImage, radioField,
  sectionDefaults, sectionFields, SectionIntro, selectField, SiteLink, SkeletonRows, textField, type SectionProps, type SiteBlock,
} from './shared';

const introDefaults = { eyebrow: '', eyebrowBn: '', intro: '', introBn: '', align: 'left' };

/* ── Generic engine: source → common item shape → one of 7 layouts ──────── */

export type DataListLayout = 'list' | 'cards' | 'table' | 'grid' | 'ticker' | 'slider' | 'accordion';

export interface DataListItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  image?: string;
  date?: string;
  href?: string;
  badge?: string;
}

/** Which `DataList`-shaped source a preset (or the raw block) reads. */
export type ListSourceKey =
  | 'notices' | 'teachers' | 'staff' | 'committee' | 'downloads' | 'albums' | 'admissions' | 'holidays' | 'branches' | 'results-archive';

const LIST_SOURCES: Array<[ListSourceKey, string]> = [
  ['notices', 'Notices'], ['teachers', 'Teachers'], ['staff', 'Staff (non-teaching)'], ['committee', 'Managing committee'],
  ['downloads', 'Downloads'], ['albums', 'Photo albums'], ['admissions', 'Admission circulars'], ['holidays', 'Holidays'],
  ['branches', 'Branches'], ['results-archive', 'Result archive (past exams)'],
];

export function toItems(source: ListSourceKey, data: unknown, lang: 'en' | 'bn'): DataListItem[] {
  const bn = lang === 'bn';
  switch (source) {
    case 'notices':
      return (data as PublicNotice[]).map((n) => ({ id: n.id, title: n.title, description: n.body, date: n.date, href: `/notices/${n.id}`, badge: n.priority && /high|urgent/i.test(n.priority) ? '!' : undefined }));
    case 'teachers':
    case 'staff':
      return (data as PublicStaffMember[]).map((t, i) => ({
        id: `${source}-${i}`, title: t.name, image: t.photoUrl,
        subtitle: [t.designation, t.subject].filter(Boolean).join(' · ') || t.department,
        description: t.classTeacherOf.length ? `Class teacher: ${t.classTeacherOf.join(', ')}` : undefined,
      }));
    case 'committee':
      return (data as PublicCommitteeMember[]).map((m) => ({ id: m.id, title: (bn && m.nameBn) || m.name, image: m.photoUrl, subtitle: (bn && m.roleBn) || m.role, description: m.phone ?? undefined }));
    case 'downloads':
      return (data as PublicDownload[]).map((d) => ({ id: d.id, title: (bn && d.titleBn) || d.title, subtitle: d.category, date: d.publishedAt, href: d.fileUrl }));
    case 'albums':
      return (data as { items: PublicAlbum[] }).items.map((a) => ({ id: a.id, title: (bn && a.titleBn) || a.title, image: a.coverUrl, subtitle: `${a.photoCount} photos`, date: a.eventDate, href: `/gallery/${a.id}` }));
    case 'admissions':
      return (data as { items: PublicAdmissionCircular[] }).items.map((a) => ({
        id: a.id, title: (bn && a.titleBn) || a.title, subtitle: [a.session, a.classNames.join(', ')].filter(Boolean).join(' · '),
        date: a.startDate, href: `/admissions/${a.id}`, badge: a.closed ? 'Closed' : 'Open',
      }));
    case 'holidays':
      return (data as { items: PublicHoliday[] }).items.map((h, i) => ({ id: `${h.date}-${i}`, title: h.title, date: h.date, badge: h.isTentative ? 'Tentative' : h.type }));
    case 'branches':
      return (data as PublicBranch[]).map((b) => ({ id: b.id, title: b.name, description: [b.address, b.phone, b.email].filter(Boolean).join(' · ') }));
    case 'results-archive':
      return (data as { id: string; name: string; startDate?: string; endDate?: string }[]).map((e) => ({ id: e.id, title: e.name, date: e.startDate, href: undefined }));
    default:
      return [];
  }
}

const EMPTY_HINT: Record<ListSourceKey, { icon: LucideIcon; title: string; hint?: string }> = {
  notices: { icon: Megaphone, title: 'No notices right now', hint: 'Published notices for everyone will appear here.' },
  teachers: { icon: Users, title: 'No teacher profiles yet', hint: "Staff appear after you switch on 'Show on website'." },
  staff: { icon: Users, title: 'No staff profiles yet', hint: "Staff appear after you switch on 'Show on website'." },
  committee: { icon: Landmark, title: 'No committee members yet' },
  downloads: { icon: DownloadIcon, title: 'No downloads yet' },
  albums: { icon: BookOpen, title: 'No albums yet' },
  admissions: { icon: FileText, title: 'No admission circulars yet' },
  holidays: { icon: Award, title: 'No holidays published yet' },
  branches: { icon: Landmark, title: 'No branches listed yet' },
  'results-archive': { icon: GraduationCap, title: 'No past exams published yet' },
};

/** Maps a `ListSourceKey` (the generic engine's palette) to the shared `dataSources.ts` dispatcher, which is also the sandbox `SITE.data()` allow-list. */
export function fetchListSource(source: ListSourceKey, id: string, api: SiteApi, p: Record<string, any>): Promise<unknown> {
  const limit = Math.max(1, Math.min(100, Number(p.limit) || 20));
  switch (source) {
    case 'notices': return fetchSiteData(id, api, 'notices', { limit });
    case 'teachers': return fetchSiteData(id, api, 'staff', { category: 'teachers' });
    case 'staff': return fetchSiteData(id, api, 'staff', { category: 'staff' });
    case 'committee': return fetchSiteData(id, api, 'committee');
    case 'downloads': return fetchSiteData(id, api, 'downloads', { category: p.category || undefined });
    case 'albums': return fetchSiteData(id, api, 'albums', { page: 1, pageSize: limit });
    case 'admissions': return fetchSiteData(id, api, 'admissions', { page: 1, pageSize: limit });
    case 'holidays': return fetchSiteData(id, api, 'holidays', { year: p.year ? Number(p.year) : undefined });
    case 'branches': return fetchSiteData(id, api, 'branches');
    case 'results-archive': return fetchSiteData(id, api, 'results-archive');
    default: return Promise.resolve([]);
  }
}

const layoutField = selectField('Layout', [
  ['list', 'List'], ['cards', 'Cards'], ['grid', 'Grid'], ['table', 'Table'], ['ticker', 'Scrolling ticker'], ['slider', 'Slider'], ['accordion', 'Accordion'],
]);

function dataListFields(sourceOptions: Array<[string, string]> = LIST_SOURCES) {
  return {
    ...introFields,
    source: selectField('Data source', sourceOptions),
    layout: layoutField,
    limit: numberField('How many (0 = all)', 0, 100),
    columns: selectField('Columns (cards/grid)', [['2', '2'], ['3', '3'], ['4', '4']]),
    showImage: radioField('Show image/photo', [[true, 'Yes'], [false, 'No']]),
    showDate: radioField('Show date', [[true, 'Yes'], [false, 'No']]),
    showDescription: radioField('Show description', [[true, 'Yes'], [false, 'No']]),
    viewAllHref: textField('“View all” link (optional)'),
    ...sectionFields,
  };
}

function ItemsView({ items, layout, showImage, showDate, showDescription, lang }: { items: DataListItem[]; layout: DataListLayout; showImage: boolean; showDate: boolean; showDescription: boolean; lang: 'en' | 'bn' }) {
  if (layout === 'table') {
    return (
      <div className="site-table-wrap">
        <table className="site-table site-table-striped">
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="font-medium">{it.href ? <SiteLink href={it.href}>{it.title}</SiteLink> : it.title}</td>
                {it.subtitle && <td className="site-muted">{it.subtitle}</td>}
                {showDate && it.date && <td className="site-muted whitespace-nowrap">{formatSiteDate(it.date, lang)}</td>}
                {it.badge && <td><span className="site-badge">{it.badge}</span></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (layout === 'ticker') {
    return (
      <div className="overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)' }}>
        <div className="site-ticker-track flex w-max flex-none items-center gap-10 whitespace-nowrap pr-10">
          {[...items, ...items].map((it, i) => (
            <span key={i} className="inline-flex items-center gap-2 font-medium">
              {it.badge && <span className="site-badge site-badge-accent">{it.badge}</span>}
              {it.href ? <SiteLink href={it.href}>{it.title}</SiteLink> : it.title}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (layout === 'accordion') {
    return (
      <div className="site-accordion">
        {items.map((it) => (
          <details key={it.id}>
            <summary>{it.title}{it.subtitle && <span className="site-muted ml-2 text-sm font-normal">{it.subtitle}</span>}</summary>
            <div className="pb-4">
              {showDescription && it.description && <p className="site-muted whitespace-pre-line">{it.description}</p>}
              {it.href && <SiteLink href={it.href} className="mt-2 inline-block font-semibold">→</SiteLink>}
            </div>
          </details>
        ))}
      </div>
    );
  }
  if (layout === 'slider') {
    return (
      <div className="site-scroller">
        {items.map((it) => <ItemCard key={it.id} it={it} showImage={showImage} showDate={showDate} showDescription={showDescription} lang={lang} />)}
      </div>
    );
  }
  if (layout === 'grid' || layout === 'cards') {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((it) => <ItemCard key={it.id} it={it} showImage={showImage} showDate={showDate} showDescription={showDescription} lang={lang} />)}</div>;
  }
  // list
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((it) => (
        <li key={it.id} className="site-card site-card-pad flex gap-4">
          {showImage && it.image && <img src={optimiseImage(it.image, 200)} alt="" loading="lazy" className="h-16 w-16 flex-none rounded-full object-cover" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="site-h4 m-0">{it.href ? <SiteLink href={it.href}>{it.title}</SiteLink> : it.title}</h3>
              {it.badge && <span className="site-badge site-badge-accent">{it.badge}</span>}
            </div>
            {it.subtitle && <p className="site-muted text-sm">{it.subtitle}</p>}
            {showDescription && it.description && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm">{it.description}</p>}
            {showDate && it.date && <time className="site-muted mt-1 block text-sm" dateTime={it.date}>{formatSiteDate(it.date, lang)}</time>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ItemCard({ it, showImage, showDate, showDescription, lang }: { it: DataListItem; showImage: boolean; showDate: boolean; showDescription: boolean; lang: 'en' | 'bn' }) {
  const body = (
    <>
      {showImage && it.image ? (
        <img src={optimiseImage(it.image, 600)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
      ) : showImage ? (
        <div aria-hidden className="flex aspect-[4/3] w-full items-center justify-center text-2xl font-bold" style={{ background: 'var(--site-primary-soft)' }}>{it.title.charAt(0)}</div>
      ) : null}
      <div className="site-card-pad flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="site-h4 m-0">{it.title}</h3>
          {it.badge && <span className="site-badge site-badge-accent">{it.badge}</span>}
        </div>
        {it.subtitle && <p className="site-muted text-sm">{it.subtitle}</p>}
        {showDescription && it.description && <p className="line-clamp-3 whitespace-pre-line text-sm">{it.description}</p>}
        {showDate && it.date && <time className="site-muted mt-auto pt-1 text-sm" dateTime={it.date}>{formatSiteDate(it.date, lang)}</time>}
      </div>
    </>
  );
  return (
    <article className="site-card flex flex-none flex-col" style={{ minWidth: 260 }}>
      {it.href ? <SiteLink href={it.href} className="flex flex-1 flex-col no-underline">{body}</SiteLink> : body}
    </article>
  );
}

function DataListView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const source = (p.source as ListSourceKey) || 'notices';
  const layout = (p.layout as DataListLayout) || 'list';
  const limit = Math.max(0, Math.min(100, Number(p.limit) || 0));
  const api = useSiteApi();
  const q = useSiteData(['datalist', source, p.category, p.year, limit], (id) => fetchListSource(source, id, api, p));
  const items = useMemo(() => {
    const all = q.data ? toItems(source, q.data, lang) : [];
    return limit > 0 ? all.slice(0, limit) : all;
  }, [q.data, source, lang, limit]);
  const empty = EMPTY_HINT[source] ?? EMPTY_HINT.notices;
  const EmptyIcon = empty.icon;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !items.length ? (
        <EmptyBlock icon={<EmptyIcon size={28} />} title={s(empty.title)} hint={empty.hint ? s(empty.hint) : undefined} />
      ) : (
        <ItemsView items={items} layout={layout} showImage={p.showImage !== false} showDate={p.showDate !== false} showDescription={p.showDescription !== false} lang={lang} />
      )}
      {p.viewAllHref && items.length > 0 && <div className="mt-5"><SiteLink href={p.viewAllHref} className="site-btn site-btn-outline site-btn-sm">{s('View all')}</SiteLink></div>}
    </BlockSection>
  );
}

/** The generic block: any list-shaped public data source, any layout — the Webflow "collection list" pattern. */
export const DataList: SiteBlock = {
  label: 'Data list (any source)',
  fields: dataListFields(),
  defaultProps: { ...introDefaults, heading: '', headingBn: '', source: 'notices', layout: 'list', limit: 10, columns: '3', showImage: true, showDate: true, showDescription: true, viewAllHref: '', category: '', year: '', ...sectionDefaults },
  render: (p) => <DataListView {...p} />,
};

/** Thin `DataList` presets with source-appropriate defaults (register each as its own palette entry). */
function preset(label: string, overrides: Record<string, unknown>, fieldOverrides: Record<string, unknown> = {}): SiteBlock {
  // `source` is fixed for a preset (that's what makes it a "thin wrapper" rather than the raw `DataList`),
  // so it's deliberately left out of `fields`: nothing to choose from, nothing to show in the editor.
  const { source: _source, ...restFields } = dataListFields();
  return {
    label,
    fields: { ...restFields, ...fieldOverrides },
    defaultProps: { ...(DataList.defaultProps as Record<string, unknown>), ...overrides },
    render: (p) => <DataListView {...(p as Record<string, any>)} />,
  };
}

export const NoticeBoard: SiteBlock = preset('Notice board (বিজ্ঞপ্তি)', { source: 'notices', layout: 'list', heading: 'Notice board', headingBn: 'বিজ্ঞপ্তি', limit: 5, viewAllHref: '/notices' });

export const NewsTicker: SiteBlock = preset('News ticker (সংবাদ)', { source: 'notices', layout: 'ticker', heading: '', headingBn: '', limit: 10, showImage: false, showDescription: false, pad: 'sm' });

export const StaffDirectory: SiteBlock = {
  label: 'Staff directory (শিক্ষক ও কর্মচারী)',
  fields: { ...dataListFields([['teachers', 'Teachers'], ['staff', 'Non-teaching staff']]) },
  defaultProps: { ...(DataList.defaultProps as Record<string, unknown>), source: 'teachers', layout: 'cards', heading: 'Our teachers', headingBn: 'আমাদের শিক্ষকবৃন্দ', limit: 0, showDate: false },
  render: (p) => <DataListView {...(p as Record<string, any>)} />,
};

export const CommitteeList: SiteBlock = preset('Managing committee (পরিচালনা কমিটি)', { source: 'committee', layout: 'cards', heading: 'Managing committee', headingBn: 'পরিচালনা কমিটি', limit: 0, showDate: false, columns: '3' });

export const DownloadsList: SiteBlock = {
  ...preset('Downloads (ডাউনলোড)', { source: 'downloads', layout: 'table', heading: 'Downloads', headingBn: 'ডাউনলোড', limit: 0 }, { category: textField('Only this category (optional)') }),
};

export const AlbumGrid: SiteBlock = preset('Photo albums (ফটো অ্যালবাম)', { source: 'albums', layout: 'grid', heading: 'Photo gallery', headingBn: 'ফটো গ্যালারি', limit: 8, showDescription: false, columns: '4', viewAllHref: '/gallery' });

export const AdmissionCirculars: SiteBlock = preset('Admission circulars (ভর্তি বিজ্ঞপ্তি)', { source: 'admissions', layout: 'cards', heading: 'Admission circulars', headingBn: 'ভর্তি বিজ্ঞপ্তি', limit: 6, showImage: false, viewAllHref: '/admissions' });

export const HolidayList: SiteBlock = {
  ...preset('Holiday list (ছুটির তালিকা)', { source: 'holidays', layout: 'table', heading: 'Holidays', headingBn: 'ছুটির তালিকা', limit: 0, showImage: false }, { year: numberField('Year (empty = current)') }),
};

export const Branches: SiteBlock = preset('Branches / campuses (শাখা)', { source: 'branches', layout: 'cards', heading: 'Our branches', headingBn: 'আমাদের শাখাসমূহ', limit: 0, showImage: false, showDate: false, columns: '3' });

/* ── Bespoke: Result summary (table; pass rate + GPA-5 per class) ────────── */

export const ResultSummary: SiteBlock = {
  label: 'Result summary (ফলাফলের সারসংক্ষেপ)',
  fields: { ...introFields, examId: textField('Fixed exam ID (empty = latest)'), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Result summary', headingBn: 'ফলাফলের সারসংক্ষেপ', examId: '', ...sectionDefaults, tone: 'surface' },
  render: (p) => <ResultSummaryView {...p} />,
};

function ResultSummaryView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const examId = String(p.examId ?? '').trim() || undefined;
  const q = useSiteData(['result-summary', examId], (id, api) => api.resultSummary(id, { examId }));
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !q.data?.items.length ? (
        <EmptyBlock icon={<GraduationCap size={28} />} title={s('The merit list isn’t published yet')} hint={s('Top results appear here after the school publishes them.')} />
      ) : (
        <>
          {q.data.exam && <p className="site-eyebrow mb-3">{q.data.exam.name}</p>}
          <div className="site-table-wrap">
            <table className="site-table">
              <thead><tr><th>{s('Class')}</th><th>Appeared</th><th>Passed</th><th>Pass rate</th><th>GPA-5</th></tr></thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.className}>
                    <td className="font-semibold">{r.className}</td>
                    <td>{formatSiteNumber(r.appeared, lang)}</td>
                    <td>{formatSiteNumber(r.passed, lang)}</td>
                    <td>{r.passRate.toFixed(1)}%</td>
                    <td>{formatSiteNumber(r.gpa5Count, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </BlockSection>
  );
}

/* ── Bespoke: Exam routine (exam picker → day/date table) ────────────────── */

export const ExamRoutine: SiteBlock = {
  label: 'Exam routine (পরীক্ষার রুটিন)',
  fields: { ...introFields, examId: textField('Fixed exam ID (empty = visitor chooses)'), className: textField('Fixed class (optional)'), ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Exam routine', headingBn: 'পরীক্ষার রুটিন', examId: '', className: '', ...sectionDefaults },
  render: (p) => <ExamRoutineView {...p} />,
};

function ExamRoutineView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const uid = useId();
  const fixedExam = String(p.examId ?? '').trim();
  const picker = useSiteData(['exam-routine-list'], (id, api) => api.examRoutine(id, {}), { enabled: !fixedExam, staleTime: 5 * 60_000 });
  const [chosen, setChosen] = useState('');
  const exams = picker.data?.exams ?? [];
  const examId = fixedExam || chosen || exams[0]?.id || '';
  const q = useSiteData(['exam-routine', examId, p.className], (id, api) => api.examRoutine(id, { examId, class: p.className || undefined }), { enabled: Boolean(examId) });
  const slots = q.data?.slots;
  const byDate = useMemo(() => {
    const m = new Map<string, NonNullable<typeof slots>>();
    for (const sl of slots ?? []) { const k = sl.date ?? ''; m.set(k, [...(m.get(k) ?? []), sl]); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots]);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!fixedExam && exams.length > 1 && (
        <div className="mb-5 max-w-xs">
          <label className="site-label" htmlFor={`${uid}-exam`}>{s('Exam')}</label>
          <select id={`${uid}-exam`} className="site-input" value={examId} onChange={(e) => setChosen(e.target.value)}>
            {exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}
      {!q.connected ? <NotConnected /> : (!fixedExam && picker.isLoading) || q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !byDate.length ? (
        <EmptyBlock title={s('No routine published')} hint={s('The class routine will appear here once it is set up.')} />
      ) : (
        <div className="site-table-wrap">
          <table className="site-table">
            <thead><tr><th>Date</th><th>{s('Class')}</th><th>{s('Section')}</th><th>{s('Subject')}</th><th>{s('Time')}</th><th>Room</th></tr></thead>
            <tbody>
              {byDate.flatMap(([date, list]) => list.map((sl, i) => (
                <tr key={`${date}-${i}`}>
                  {i === 0 ? <td rowSpan={list.length} className="whitespace-nowrap font-semibold">{date ? formatSiteDate(date, lang) : '—'}</td> : null}
                  <td>{sl.className}</td><td>{sl.sectionName ?? '—'}</td><td>{sl.subjectName}</td>
                  <td className="whitespace-nowrap">{sl.startTime ? `${sl.startTime}${sl.endTime ? `–${sl.endTime}` : ''}` : '—'}</td>
                  <td>{sl.room ?? '—'}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
    </BlockSection>
  );
}

/* ── Bespoke: Class & gender counts + sections (DSHE 3/4) ────────────────── */

export const ClassStats: SiteBlock = {
  label: 'Class & gender stats (শ্রেণি ও লিঙ্গভিত্তিক তথ্য)',
  fields: { ...introFields, ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Students by class', headingBn: 'শ্রেণিভিত্তিক শিক্ষার্থী', ...sectionDefaults },
  render: (p) => <ClassStatsView {...p} />,
};

function ClassStatsView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const q = useSiteData(['class-stats'], (id, api) => api.classStats(id));
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !q.data?.length ? (
        <EmptyBlock title={s('Figures will appear once the school’s records are set up.')} />
      ) : (
        <div className="site-table-wrap">
          <table className="site-table">
            <thead><tr><th>{s('Class')}</th><th>Sections</th><th>{lang === 'bn' ? 'ছেলে' : 'Boys'}</th><th>{lang === 'bn' ? 'মেয়ে' : 'Girls'}</th><th>{s('Students')}</th></tr></thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.className}>
                  <td className="font-semibold">{c.className}</td>
                  <td>{c.sections.join(', ') || '—'}</td>
                  <td>{formatSiteNumber(c.genderCounts.male, lang)}</td>
                  <td>{formatSiteNumber(c.genderCounts.female, lang)}</td>
                  <td className="font-semibold">{formatSiteNumber(c.genderCounts.total, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BlockSection>
  );
}

/* ── Bespoke: Fee chart (accordion per class) ─────────────────────────────── */

export const FeeChart: SiteBlock = {
  label: 'Fee chart (ফি তালিকা)',
  fields: { ...introFields, ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Fee chart', headingBn: 'ফি তালিকা', ...sectionDefaults },
  render: (p) => <FeeChartView {...p} />,
};

function FeeChartView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const q = useSiteData(['fee-chart'], (id, api) => api.feeChart(id));
  const disabled = q.isError;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows /> : disabled || !q.data?.length ? (
        <EmptyBlock title={s('Online payment isn’t available yet')} hint={s('Please contact the school office to pay fees.')} />
      ) : (
        <div className="site-accordion">
          {q.data.map((c) => (
            <details key={c.className}>
              <summary>{c.className}</summary>
              <div className="site-table-wrap pb-4">
                <table className="site-table">
                  <thead><tr><th>Category</th><th>Amount</th><th>Frequency</th></tr></thead>
                  <tbody>{c.items.map((i, idx) => <tr key={idx}><td>{i.category}</td><td>{formatSiteMoney(i.amount, 'BDT', lang)}</td><td>{i.frequency ?? '—'}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Bespoke: Library catalogue (search + simple paging) ──────────────────── */

export const LibraryCatalogue: SiteBlock = {
  label: 'Library catalogue (গ্রন্থাগার তালিকা)',
  fields: { ...introFields, ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Library catalogue', headingBn: 'গ্রন্থাগার তালিকা', ...sectionDefaults },
  render: (p) => <LibraryView {...p} />,
};

function LibraryView(p: Record<string, any>) {
  const { s } = useSiteText();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const query = useSiteData(['library', q, page], (id, api) => api.library(id, { q: q || undefined, page, pageSize: 15 }));
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / (query.data.pageSize || 15))) : 1;
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      <div className="mb-4 max-w-sm">
        <input type="search" className="site-input" placeholder={s('Search the catalogue')} aria-label={s('Search the catalogue')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {!query.connected ? <NotConnected /> : query.isLoading ? <SkeletonRows /> : query.isError ? (
        <EmptyBlock icon={<LibraryIcon size={28} />} title={s('The library catalogue isn’t available yet')} />
      ) : !query.data?.items.length ? (
        <EmptyBlock icon={<LibraryIcon size={28} />} title={s('No books catalogued yet')} />
      ) : (
        <>
          <div className="site-table-wrap">
            <table className="site-table site-table-striped">
              <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Available</th></tr></thead>
              <tbody>{query.data.items.map((b, i) => <tr key={i}><td className="font-medium">{b.title}</td><td>{b.author ?? '—'}</td><td>{b.category ?? '—'}</td><td>{b.available ? <BadgeCheck size={16} className="inline text-green-600" aria-hidden /> : '—'}</td></tr>)}</tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Pagination">
              <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>{s('Previous')}</button>
              <span className="site-muted text-sm">{s('Page {page} of {pages}', { page, pages })}</span>
              <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>{s('Next')}</button>
            </nav>
          )}
        </>
      )}
    </BlockSection>
  );
}

/* ── Bespoke: Transport routes (accordion; no vehicle/driver info) ───────── */

export const TransportRoutes: SiteBlock = {
  label: 'Transport routes (পরিবহন রুট)',
  fields: { ...introFields, ...sectionFields },
  defaultProps: { ...introDefaults, heading: 'Transport routes', headingBn: 'পরিবহন রুট', ...sectionDefaults },
  render: (p) => <TransportView {...p} />,
};

function TransportView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const q = useSiteData(['transport'], (id, api) => api.transport(id));
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !q.data?.length ? (
        <EmptyBlock icon={<Bus size={28} />} title={s('No routine published')} />
      ) : (
        <div className="site-accordion">
          {q.data.map((r) => (
            <details key={r.id}>
              <summary>{r.name}{r.fare != null && <span className="site-muted ml-2 text-sm font-normal">{formatSiteMoney(r.fare, 'BDT', lang)}</span>}</summary>
              <ul className="m-0 flex list-none flex-col gap-1 pb-4 text-sm">
                {r.stops.map((st, i) => <li key={i} className="flex justify-between gap-3"><span>{st.name}</span><span className="site-muted">{[st.pickupTime, st.dropTime].filter(Boolean).join(' → ')}</span></li>)}
              </ul>
            </details>
          ))}
        </div>
      )}
    </BlockSection>
  );
}

/* ── Bespoke: Profile facts (DSHE 1/2/6/7/8/9) ────────────────────────────── */

export const ProfileFacts: SiteBlock = {
  label: 'Institution profile facts (প্রতিষ্ঠান তথ্য)',
  fields: {
    ...introFields,
    showRecognition: radioField('Show recognition / MPO', [[true, 'Yes'], [false, 'No']]),
    showOfficers: radioField('Show information & complaints officers', [[true, 'Yes'], [false, 'No']]),
    ...sectionFields,
  },
  defaultProps: { ...introDefaults, heading: 'Institution profile', headingBn: 'প্রতিষ্ঠান পরিচিতি', showRecognition: true, showOfficers: true, ...sectionDefaults, tone: 'surface' },
  render: (p) => <ProfileFactsView {...p} />,
};

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="site-card site-card-pad">
      <p className="site-muted text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 whitespace-pre-line font-semibold">{value}</p>
    </div>
  );
}

function ProfileFactsView(p: Record<string, any>) {
  const { s, lang } = useSiteText();
  const q = useSiteData(['profile'], (id, api) => api.profile(id), { staleTime: 10 * 60_000 });
  const profile = q.data;
  const officer = (o?: { name?: string; designation?: string; phone?: string; email?: string } | null) => (o ? [o.name, o.designation, o.phone, o.email].filter(Boolean).join(' · ') : undefined);
  return (
    <BlockSection {...(p as SectionProps)}>
      <SectionIntro {...p} />
      {!q.connected ? <NotConnected /> : q.isLoading ? <SkeletonRows rows={2} className="h-20" /> : q.isError ? <ErrorBlock onRetry={() => void q.refetch()} /> : !profile ? (
        <EmptyBlock title={s('Figures will appear once the school’s records are set up.')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={lang === 'bn' ? 'বাংলা নাম' : 'Bangla name'} value={profile.nameBn} />
          <Fact label="EIIN" value={profile.eiin} />
          <Fact label={s('Years of excellence')} value={profile.establishedYear != null ? String(profile.establishedYear) : undefined} />
          {p.showRecognition !== false && <Fact label={lang === 'bn' ? 'এমপিও/জাতীয়করণ' : 'MPO / nationalisation'} value={profile.mpoInfo} />}
          {p.showRecognition !== false && <Fact label={lang === 'bn' ? 'পাঠদানের অনুমতি ও স্বীকৃতি' : 'Recognition'} value={profile.recognitionInfo} />}
          <Fact label={s('Address')} value={profile.contact.address} />
          <Fact label={s('Phone')} value={profile.contact.phone} />
          <Fact label={s('Email')} value={profile.contact.email} />
          {p.showOfficers !== false && <Fact label={lang === 'bn' ? 'তথ্যসেবা কেন্দ্র' : 'Information officer'} value={officer(profile.informationOfficer)} />}
          {p.showOfficers !== false && <Fact label={lang === 'bn' ? 'অভিযোগ নিষ্পত্তি কর্মকর্তা' : 'Complaints officer'} value={officer(profile.complaintsOfficer)} />}
        </div>
      )}
    </BlockSection>
  );
}
