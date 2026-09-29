/**
 * Page builders shared by the templates. Copy is *template sample text*: it
 * uses `{{institution.*}}` tokens for facts and says "sample" where a school
 * must write its own words. Nothing here invents facts about a school.
 */
import { SITE_COMPONENTS, type SiteBlockType } from '../config';
import type { NavItem, SiteComponentData, SitePageData } from '../types';
import type { TemplatePage } from './types';

type Props = Record<string, unknown>;

/** Creates blocks with unique, deterministic ids for one page. */
export function pageBuilder(prefix: string) {
  let n = 0;
  const block = (type: SiteBlockType, props: Props = {}): SiteComponentData => {
    const defaults = (SITE_COMPONENTS[type].defaultProps ?? {}) as Props;
    n += 1;
    return { type, props: { ...structuredCloneSafe(defaults), ...props, id: `${type}-${prefix}-${n}` } };
  };
  return block;
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function page(slug: string, title: string, titleBn: string, content: SiteComponentData[], description?: string): TemplatePage {
  const data: SitePageData = { root: { props: { title } }, content, zones: {} };
  return { slug, title, titleBn, data, seo: { title: slug ? `${title} | {{institution.name}}` : '{{institution.name}}', description: description ?? '' } };
}

export const btn = (label: string, labelBn: string, href: string, variant = 'primary') => ({ label, labelBn, href, variant });

/* ── Navigation ─────────────────────────────────────────────────────────── */

export const nav = (label: string, labelBn: string, href: string, children?: NavItem[]): NavItem => ({ label, labelBn, href, ...(children ? { children } : {}) });

export const STANDARD_HEADER: NavItem[] = [
  nav('Home', 'হোম', '/'),
  nav('About', 'আমাদের সম্পর্কে', '/about'),
  nav('Admissions', 'ভর্তি', '/admissions'),
  nav('Academics', 'শিক্ষা কার্যক্রম', '/academics'),
  nav('Notices', 'নোটিশ', '/notices'),
  nav('Contact', 'যোগাযোগ', '/contact'),
];

export const STANDARD_FOOTER: NavItem[] = [
  nav('About', 'আমাদের সম্পর্কে', '/about'),
  nav('Admissions', 'ভর্তি', '/admissions'),
  nav('Notices', 'নোটিশ', '/notices'),
  nav('News', 'খবর', '/blog'),
  nav('Contact', 'যোগাযোগ', '/contact'),
];

/* ── Standard inner pages (tuned per template through options) ──────────── */

export interface PageOpts {
  tone?: 'surface' | 'soft' | 'primary' | 'dark' | 'default';
  cardStyle?: 'card' | 'plain' | 'centered';
  radiusHeavy?: boolean;
}

export function aboutPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('about');
  return page('about', 'About', 'আমাদের সম্পর্কে', [
    b('Hero', { eyebrow: 'About us', eyebrowBn: 'আমাদের সম্পর্কে', title: 'About {{institution.name}}', titleBn: '{{institution.name}} সম্পর্কে', subtitle: 'Sample text: a short introduction to your institution.', subtitleBn: 'নমুনা লেখা: প্রতিষ্ঠানের সংক্ষিপ্ত পরিচিতি।', buttons: [], height: 'auto', tone: o.tone ?? 'soft' }),
    b('RichText', {
      body: '<h2>Our story</h2><p>Sample text — describe when and why the school was founded, and what makes it special. Replace this with your own history.</p><h2>Mission &amp; vision</h2><p>Sample text — write your mission and vision statements here.</p>',
      bodyBn: '<h2>আমাদের গল্প</h2><p>নমুনা লেখা — প্রতিষ্ঠানটি কবে ও কেন প্রতিষ্ঠিত হয়েছে এবং এর বিশেষত্ব কী তা লিখুন।</p><h2>লক্ষ্য ও উদ্দেশ্য</h2><p>নমুনা লেখা — আপনার লক্ষ্য ও উদ্দেশ্য এখানে লিখুন।</p>',
      width: 'narrow', pad: 'md',
    }),
    b('PrincipalMessage', { tone: 'surface' }),
    b('Timeline'),
    b('StatsLive', { tone: o.tone === 'dark' ? 'dark' : 'primary' }),
  ], 'About {{institution.name}}');
}

export function admissionsPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('admissions');
  return page('admissions', 'Admissions', 'ভর্তি', [
    b('Hero', { eyebrow: 'Admissions', eyebrowBn: 'ভর্তি', title: 'Admissions at {{institution.name}}', titleBn: '{{institution.name}}-এ ভর্তি', subtitle: 'Sample text: who can apply, key dates and how to reach the admission office.', subtitleBn: 'নমুনা লেখা: কারা আবেদন করতে পারবে, গুরুত্বপূর্ণ তারিখ ও যোগাযোগ।', buttons: [btn('Enquire now', 'জিজ্ঞাসা করুন', '#enquiry')], height: 'auto', tone: o.tone ?? 'soft' }),
    b('Cards', {
      heading: 'How to apply', headingBn: 'আবেদনের ধাপ', columns: '3', style: o.cardStyle ?? 'card',
      cards: [
        { icon: 'book', image: '', title: '1. Send an enquiry', titleBn: '১. জিজ্ঞাসা পাঠান', text: 'Sample text — describe the first step.', textBn: 'নমুনা লেখা — প্রথম ধাপ লিখুন।', href: '', linkLabel: '', linkLabelBn: '' },
        { icon: 'calendar', image: '', title: '2. Visit or assessment', titleBn: '২. পরিদর্শন বা মূল্যায়ন', text: 'Sample text — describe the second step.', textBn: 'নমুনা লেখা — দ্বিতীয় ধাপ লিখুন।', href: '', linkLabel: '', linkLabelBn: '' },
        { icon: 'graduation', image: '', title: '3. Confirm admission', titleBn: '৩. ভর্তি নিশ্চিত করুন', text: 'Sample text — describe the final step.', textBn: 'নমুনা লেখা — শেষ ধাপ লিখুন।', href: '', linkLabel: '', linkLabelBn: '' },
      ],
    }),
    b('FAQ'),
    b('EnquiryForm', { anchor: 'enquiry', tone: 'surface' }),
    b('FeePayment'),
  ], 'Admissions at {{institution.name}}');
}

export function academicsPage(o: PageOpts = {}, extra: SiteComponentData[] = []): TemplatePage {
  const b = pageBuilder('academics');
  return page('academics', 'Academics', 'শিক্ষা কার্যক্রম', [
    b('Heading', { eyebrow: 'Academics', eyebrowBn: 'শিক্ষা কার্যক্রম', text: 'Learning at {{institution.name}}', textBn: '{{institution.name}}-এ শিক্ষা', sub: 'Sample text: an overview of your curriculum and teaching approach.', subBn: 'নমুনা লেখা: পাঠ্যক্রম ও শিক্ষাদান পদ্ধতির সংক্ষিপ্ত বিবরণ।', level: 'h1', pad: 'md', tone: o.tone ?? 'soft' }),
    b('Cards', {
      heading: 'Programmes', headingBn: 'শিক্ষা কার্যক্রমসমূহ', columns: '3', style: o.cardStyle ?? 'card',
      cards: [
        { icon: 'book', image: '', title: 'Programme name', titleBn: 'কার্যক্রমের নাম', text: 'Sample text — describe this level or group.', textBn: 'নমুনা লেখা — এই স্তর বা বিভাগ সম্পর্কে লিখুন।', href: '', linkLabel: '', linkLabelBn: '' },
        { icon: 'flask', image: '', title: 'Programme name', titleBn: 'কার্যক্রমের নাম', text: 'Sample text — describe this level or group.', textBn: 'নমুনা লেখা — এই স্তর বা বিভাগ সম্পর্কে লিখুন।', href: '', linkLabel: '', linkLabelBn: '' },
        { icon: 'computer', image: '', title: 'Programme name', titleBn: 'কার্যক্রমের নাম', text: 'Sample text — describe this level or group.', textBn: 'নমুনা লেখা — এই স্তর বা বিভাগ সম্পর্কে লিখুন।', href: '', linkLabel: '', linkLabelBn: '' },
      ],
    }),
    ...extra,
    b('TeacherDirectory', { tone: 'surface' }),
    b('ClassRoutine'),
    b('ResultsLookup', { tone: 'surface' }),
    b('Toppers'),
  ], 'Academics at {{institution.name}}');
}

export function noticesPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('notices');
  return page('notices', 'Notices', 'নোটিশ', [
    b('Heading', { text: 'Notice board', textBn: 'নোটিশ বোর্ড', sub: 'Official notices from {{institution.name}}.', subBn: '{{institution.name}}-এর অফিসিয়াল নোটিশ।', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('Notices', { heading: '', headingBn: '', limit: 20, viewAllHref: '' }),
    b('EventsCalendar', { tone: 'surface' }),
    b('LatestNews'),
  ], 'Notices from {{institution.name}}');
}

export function contactPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('contact');
  return page('contact', 'Contact', 'যোগাযোগ', [
    b('Heading', { text: 'Contact us', textBn: 'যোগাযোগ করুন', sub: 'We’d love to hear from you.', subBn: 'আপনার যেকোনো প্রশ্নে আমরা পাশে আছি।', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('ContactInfo', { heading: '', headingBn: '' }),
    b('Map', { tone: 'default' }),
    b('EnquiryForm', { heading: 'Send us a message', headingBn: 'বার্তা পাঠান', tone: 'surface' }),
  ], 'Contact {{institution.name}}');
}

/** The six standard pages; the home page is template-specific. */
export function standardPages(home: TemplatePage, o: PageOpts = {}, academicsExtra: SiteComponentData[] = []): TemplatePage[] {
  return [home, aboutPage(o), admissionsPage(o), academicsPage(o, academicsExtra), noticesPage(o), contactPage(o)];
}
