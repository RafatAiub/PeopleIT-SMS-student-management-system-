/**
 * Default template (profile) pages for the collections that have a public route
 * (W5). They are built from the same designer blocks a school can use — Stack,
 * Text, Picture, Badge, LinkButton, CollectionList — with every field bound to
 * the item, and are styled like the built-in detail views (soft header band,
 * narrow body), so a school that creates a template page from a default sees
 * what it had before and can edit everything.
 *
 * Copy is structural labels only ("Session", "Venue" …) — no facts about any school.
 */
import { pageBuilder } from './builders';
import type { BindMap, BindSpec, VisibleSpec, VisRule } from '../binding';
import type { SiteComponentData, SitePageData, SiteSeo } from '../types';

type Props = Record<string, unknown>;
type Block = ReturnType<typeof pageBuilder>;

export interface DefaultTemplatePage {
  collectionKey: string;
  title: string;
  titleBn: string;
  data: SitePageData;
  seo: SiteSeo;
}

const item = (path: string, fmt?: BindSpec['fmt'], fallback?: string): BindSpec => ({ src: 'item', path, ...(fmt ? { fmt } : {}), ...(fallback ? { fallback } : {}) });
const bind = (map: Record<string, BindSpec>): { _bind: BindMap } => ({ _bind: map });
const show = (...rules: Array<[path: string, op: VisRule['op'], value?: string]>): { _visible: VisibleSpec } => ({
  _visible: { match: 'all', when: rules.map(([path, op, value]) => ({ src: 'item' as const, path, op, ...(value !== undefined ? { value } : {}) })), hideOn: [] },
});

/** Soft header band (like the built-in detail views) holding `children`. */
function headerBand(b: Block, children: SiteComponentData[], width: 'narrow' | 'default' = 'narrow') {
  return b('Section', { tone: 'soft', pad: 'md', width, animate: 'none', overlay: 'none', content: children });
}

function bodyBand(b: Block, children: SiteComponentData[], width: 'narrow' | 'default' = 'narrow') {
  return b('Section', { tone: 'default', pad: 'md', width, animate: 'none', overlay: 'none', content: children });
}

const backLink = (b: Block, label: string, labelBn: string, href: string) => b('LinkButton', { label: `← ${label}`, labelBn: `← ${labelBn}`, href, variant: 'link', size: 'sm' });

const title = (b: Block, path = 'title', bnPath?: string) =>
  b('Text', { tag: 'h1', size: '3xl', weight: 'bold', text: '', textBn: '', ...bind({ text: item(path), ...(bnPath ? { textBn: item(bnPath) } : {}) }) });

const muted = (b: Block, extra: Props) => b('Text', { tag: 'p', size: 'sm', color: 'muted', ...extra });

const row = (b: Block, children: SiteComponentData[], extra: Props = {}) =>
  b('Stack', { direction: 'row', stackOnPhone: true, gap: 'md', align: 'center', justify: 'start', wrap: true, padding: 'none', surface: 'none', radius: false, content: children, ...extra });

const col = (b: Block, children: SiteComponentData[], extra: Props = {}) =>
  b('Stack', { direction: 'column', gap: 'md', align: 'stretch', justify: 'start', wrap: false, padding: 'none', surface: 'none', radius: false, content: children, ...extra });

const heading = (b: Block, en: string, bn: string, extra: Props = {}) => b('Text', { tag: 'h2', size: 'xl', weight: 'bold', text: en, textBn: bn, ...extra });

/** A related-items list (`relation` of the current item) with a designed card. */
function relatedList(b: Block, relation: string, itemBlocks: SiteComponentData[], extra: Props = {}) {
  return b('CollectionList', {
    sourceKind: 'relation', relation, collection: '', filters: [], limit: 0, wrap: false, layout: 'grid', colsSm: '1', colsMd: '2', colsLg: '3', gap: 'md',
    item: itemBlocks, empty: [], ...extra,
  });
}

/* ── Notices ────────────────────────────────────────────────────────────── */

function notices(): SiteComponentData[] {
  const b = pageBuilder('tpl-notices');
  return [
    headerBand(b, [
      backLink(b, 'Notices', 'বিজ্ঞপ্তি', '/notices'),
      title(b),
      muted(b, { text: '', size: 'md', ...bind({ text: item('publishedAt', 'date:long') }), ...show(['publishedAt', 'notEmpty']) }),
    ]),
    b('RichText', { body: '', bodyBn: '', align: 'left', width: 'narrow', pad: 'md', tone: 'default', ...bind({ body: item('content') }) }),
  ];
}

/* ── Albums (gallery) ───────────────────────────────────────────────────── */

function albums(): SiteComponentData[] {
  const b = pageBuilder('tpl-albums');
  const photo = [
    b('Picture', { src: '', alt: '', ratio: '1/1', fit: 'cover', radius: 'md', maxWidth: 0, ...bind({ src: item('url'), alt: item('caption') }) }),
    b('Text', { tag: 'p', size: 'xs', color: 'muted', text: '', ...bind({ text: item('caption') }), ...show(['caption', 'notEmpty']) }),
  ];
  return [
    headerBand(b, [
      backLink(b, 'View all', 'সব দেখুন', '/gallery'),
      title(b, 'title', 'titleBn'),
      muted(b, { text: '', size: 'md', ...bind({ text: item('eventDate', 'date:long') }), ...show(['eventDate', 'notEmpty']) }),
      b('Text', { tag: 'p', size: 'lg', color: 'muted', text: '', ...bind({ text: item('description') }), ...show(['description', 'notEmpty']) }),
    ], 'default'),
    bodyBand(b, [
      relatedList(b, 'photos', photo, {
        colsSm: '2', colsMd: '3', colsLg: '4', gap: 'sm',
        empty: [b('Text', { tag: 'p', size: 'md', color: 'muted', align: 'center', text: 'No photos yet', textBn: 'এখনো কোনো ছবি নেই' })],
      }),
    ], 'default'),
  ];
}

/* ── Admission circulars ────────────────────────────────────────────────── */

function admissions(): SiteComponentData[] {
  const b = pageBuilder('tpl-admissions');
  return [
    headerBand(b, [
      backLink(b, 'View all', 'সব দেখুন', '/admissions'),
      row(b, [
        title(b, 'title', 'titleBn'),
        b('Badge', { text: 'Closed', textBn: 'বন্ধ', tone: 'neutral', align: 'start', ...show(['closed', 'eq', 'true']) }),
        b('Badge', { text: 'Open', textBn: 'চলমান', tone: 'accent', align: 'start', ...show(['closed', 'neq', 'true']) }),
      ]),
      row(b, [
        muted(b, { text: 'Session: {{item.session}}', textBn: 'সেশন: {{item.session}}', ...show(['session', 'notEmpty']) }),
        muted(b, { text: 'Class: {{item.classNames}}', textBn: 'শ্রেণি: {{item.classNames}}', ...show(['classNames', 'notEmpty']) }),
        muted(b, { text: 'Fee: {{item.fee|money}}', textBn: 'ফি: {{item.fee|money}}', ...show(['fee', 'notEmpty']) }),
      ], { gap: 'lg' }),
      muted(b, { text: '{{item.startDate|date:long}} – {{item.endDate|date:long}}', ...show(['startDate', 'notEmpty'], ['endDate', 'notEmpty']) }),
      muted(b, { text: '{{item.startDate|date:long}}', ...show(['startDate', 'notEmpty'], ['endDate', 'empty']) }),
    ]),
    bodyBand(b, [
      b('RichText', { body: '', bodyBn: '', align: 'left', width: 'narrow', pad: 'none', tone: 'default', ...bind({ body: item('body') }) }),
      row(b, [
        b('LinkButton', { label: 'Download', labelBn: 'ডাউনলোড', variant: 'outline', size: 'md', align: 'start', href: '', ...bind({ href: item('pdfUrl') }), ...show(['pdfUrl', 'notEmpty']) }),
        b('LinkButton', { label: 'Apply now', labelBn: 'আবেদন করুন', variant: 'primary', size: 'md', align: 'start', href: '', ...bind({ href: item('applyUrl') }), ...show(['applyUrl', 'notEmpty'], ['closed', 'neq', 'true']) }),
      ]),
    ]),
  ];
}

/* ── Teachers ───────────────────────────────────────────────────────────── */

function teachers(): SiteComponentData[] {
  const b = pageBuilder('tpl-teachers');
  return [
    headerBand(b, [
      backLink(b, 'Teachers', 'শিক্ষকবৃন্দ', '/teachers'),
      row(b, [
        b('Picture', { src: '', alt: '', ratio: '1/1', fit: 'cover', radius: 'full', maxWidth: 180, ...bind({ src: item('photoUrl'), alt: item('name') }), ...show(['photoUrl', 'notEmpty']) }),
        col(b, [
          title(b, 'name'),
          b('Text', { tag: 'p', size: 'lg', color: 'muted', text: '', ...bind({ text: item('designation') }), ...show(['designation', 'notEmpty']) }),
          row(b, [
            b('Badge', { text: '', textBn: '', tone: 'accent', align: 'start', ...bind({ text: item('subject') }), ...show(['subject', 'notEmpty']) }),
            b('Badge', { text: '', textBn: '', tone: 'neutral', align: 'start', ...bind({ text: item('department') }), ...show(['department', 'notEmpty']) }),
          ], { gap: 'sm' }),
        ], { gap: 'sm' }),
      ], { gap: 'lg', align: 'center' }),
    ]),
    bodyBand(b, [
      col(b, [
        heading(b, 'Qualification', 'শিক্ষাগত যোগ্যতা'),
        b('Text', { tag: 'p', size: 'md', text: '', ...bind({ text: item('qualification') }) }),
      ], { gap: 'sm', ...show(['qualification', 'notEmpty']) }),
      col(b, [
        heading(b, 'Classes', 'শ্রেণিসমূহ'),
        relatedList(b, 'classes', [
          b('LinkButton', { label: '', labelBn: '', href: '', variant: 'outline', size: 'md', align: 'start', ...bind({ label: item('name'), href: item('_url') }) }),
        ], { colsSm: '2', colsMd: '3', colsLg: '4', gap: 'sm' }),
      ], { gap: 'sm', ...show(['classes', 'notEmpty']) }),
    ]),
  ];
}

/* ── Classes ────────────────────────────────────────────────────────────── */

function classes(): SiteComponentData[] {
  const b = pageBuilder('tpl-classes');
  const teacherCard = [
    row(b, [
      b('Picture', { src: '', alt: '', ratio: '1/1', fit: 'cover', radius: 'full', maxWidth: 56, ...bind({ src: item('photoUrl'), alt: item('name') }), ...show(['photoUrl', 'notEmpty']) }),
      col(b, [
        b('LinkButton', { label: '', labelBn: '', href: '', variant: 'link', size: 'md', align: 'start', ...bind({ label: item('name'), href: item('_url') }) }),
        b('Text', { tag: 'p', size: 'sm', color: 'muted', text: '', ...bind({ text: item('designation') }), ...show(['designation', 'notEmpty']) }),
      ], { gap: 'none' }),
    ], { gap: 'md', wrap: false }),
  ];
  return [
    headerBand(b, [
      backLink(b, 'Classes', 'শ্রেণিসমূহ', '/classes'),
      title(b, 'name'),
      row(b, [
        muted(b, { text: 'Medium: {{item.medium}}', textBn: 'মাধ্যম: {{item.medium}}', ...show(['medium', 'notEmpty']) }),
        muted(b, { text: 'Shift: {{item.shift}}', textBn: 'শিফট: {{item.shift}}', ...show(['shift', 'notEmpty']) }),
        // Counts are null when the API suppresses small numbers, so this simply disappears then.
        muted(b, { text: 'Students: {{item.studentCount}}', textBn: 'শিক্ষার্থী: {{item.studentCount}}', ...show(['studentCount', 'notEmpty']) }),
      ], { gap: 'lg' }),
    ]),
    bodyBand(b, [
      col(b, [
        heading(b, 'Sections', 'শাখা'),
        b('Text', { tag: 'p', size: 'md', text: '{{item.sectionNames}}' }),
      ], { gap: 'sm', ...show(['sectionNames', 'notEmpty']) }),
      col(b, [
        heading(b, 'Class teachers', 'শ্রেণি শিক্ষক'),
        relatedList(b, 'classTeacher', teacherCard, { colsSm: '1', colsMd: '2', colsLg: '3' }),
      ], { gap: 'sm', ...show(['classTeacher', 'notEmpty']) }),
      col(b, [
        heading(b, 'Subjects', 'বিষয়সমূহ'),
        relatedList(b, 'subjects', [
          b('Text', { tag: 'p', size: 'md', weight: 'medium', text: '', ...bind({ text: item('name') }) }),
        ], { colsSm: '2', colsMd: '3', colsLg: '4', gap: 'sm' }),
      ], { gap: 'sm', ...show(['subjects', 'notEmpty']) }),
      col(b, [
        heading(b, 'Class routine', 'ক্লাস রুটিন'),
        relatedList(b, 'routine', [
          b('Text', { tag: 'span', size: 'md', weight: 'semibold', text: '', ...bind({ text: item('dayOfWeek') }) }),
          b('Text', { tag: 'span', size: 'sm', color: 'muted', text: '{{item.startTime}} – {{item.endTime}}' }),
          b('Text', { tag: 'span', size: 'md', text: '', ...bind({ text: item('subject') }) }),
          b('Text', { tag: 'span', size: 'sm', color: 'muted', text: '{{item.teacherName}}', ...show(['teacherName', 'notEmpty']) }),
        ], { layout: 'table' }),
      ], { gap: 'sm', ...show(['routine', 'notEmpty']) }),
    ], 'default'),
  ];
}

/* ── Events ─────────────────────────────────────────────────────────────── */

function events(): SiteComponentData[] {
  const b = pageBuilder('tpl-events');
  return [
    headerBand(b, [
      backLink(b, 'Events', 'অনুষ্ঠান', '/events'),
      row(b, [
        title(b),
        b('Badge', { text: '', textBn: '', tone: 'accent', align: 'start', ...bind({ text: item('category') }), ...show(['category', 'notEmpty']) }),
      ]),
      row(b, [
        muted(b, { text: '{{item.startDate|date:long}}', size: 'md', ...show(['startDate', 'notEmpty']) }),
        muted(b, { text: '{{item.startTime}} – {{item.endTime}}', ...show(['startTime', 'notEmpty']) }),
        muted(b, { text: 'Venue: {{item.venue}}', textBn: 'স্থান: {{item.venue}}', ...show(['venue', 'notEmpty']) }),
      ], { gap: 'lg' }),
    ]),
    bodyBand(b, [
      b('Picture', { src: '', alt: '', ratio: '16/9', fit: 'cover', radius: 'lg', maxWidth: 0, ...bind({ src: item('imageUrl'), alt: item('title') }), ...show(['imageUrl', 'notEmpty']) }),
      b('Text', { tag: 'p', size: 'lg', text: '', ...bind({ text: item('description') }), ...show(['description', 'notEmpty']) }),
    ]),
  ];
}

/* ── Registry of defaults ───────────────────────────────────────────────── */

interface DefaultDef {
  title: string;
  titleBn: string;
  titleField: string;
  build: () => SiteComponentData[];
}

const DEFAULTS: Record<string, DefaultDef> = {
  notices: { title: 'Notice page', titleBn: 'বিজ্ঞপ্তির পাতা', titleField: 'title', build: notices },
  albums: { title: 'Photo album page', titleBn: 'অ্যালবামের পাতা', titleField: 'title', build: albums },
  admissions: { title: 'Admission circular page', titleBn: 'ভর্তি বিজ্ঞপ্তির পাতা', titleField: 'title', build: admissions },
  teachers: { title: 'Teacher profile page', titleBn: 'শিক্ষকের প্রোফাইল', titleField: 'name', build: teachers },
  classes: { title: 'Class page', titleBn: 'শ্রেণির পাতা', titleField: 'name', build: classes },
  events: { title: 'Event page', titleBn: 'অনুষ্ঠানের পাতা', titleField: 'title', build: events },
};

/** Collections that ship a ready-made template page design. */
export const DEFAULT_TEMPLATE_COLLECTIONS = Object.keys(DEFAULTS);

export function hasDefaultTemplate(collectionKey: string): boolean {
  return collectionKey in DEFAULTS;
}

/** A fresh default template page for `collectionKey` (null when none ships). Safe to call repeatedly: blocks are new objects. */
export function defaultTemplatePage(collectionKey: string): DefaultTemplatePage | null {
  const def = DEFAULTS[collectionKey];
  if (!def) return null;
  return {
    collectionKey,
    title: def.title,
    titleBn: def.titleBn,
    data: { root: { props: { title: def.title } }, content: def.build(), zones: {} },
    // Filled per item at render time; empty description falls back to the API's derived SEO.
    seo: { title: `{{item.${def.titleField}}} | {{site.name}}`, description: '' },
  };
}

/** A blank template page (one empty section) for schools that want to design from scratch. */
export function blankTemplatePage(titleField = 'title'): { data: SitePageData; seo: SiteSeo } {
  const b = pageBuilder('tpl-blank');
  return {
    data: { root: { props: { title: 'Template page' } }, content: [headerBand(b, [title(b, titleField)]), bodyBand(b, [])], zones: {} },
    seo: { title: `{{item.${titleField}}} | {{site.name}}`, description: '' },
  };
}
