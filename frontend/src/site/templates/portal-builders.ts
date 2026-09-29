/**
 * Shared page builders for the eight Bangladeshi-portal templates (C5).
 * Every list is data-bound (no hand-typed school facts); together the pages
 * cover all 11 DSHE items (see docs/redesign/WEBSITE_V3_PLAN.md §1 and the
 * backend's own checklist, `sites.portal.logic.ts` `complianceChecklist`).
 *
 * Two home-page styles are offered (`bangladeshPortalHome` for Style A —
 * the classic Bangla school portal — and `corporateHome` for Style B — the
 * English-medium corporate look); the other nine pages are identical content
 * across every template that uses them (only the template's theme/header/
 * footer/navigation differ), which is what keeps eight templates honestly
 * DSHE-complete without duplicating nine pages' worth of copy eight times.
 */
import { btn, nav, page, pageBuilder, type PageOpts } from './builders';
import type { NavItem } from '../types';
import type { TemplatePage } from './types';

const PORTAL_HEADER: NavItem[] = [
  nav('Home', 'হোম', '/'),
  nav('About', 'প্রতিষ্ঠান পরিচিতি', '/about'),
  nav('Administration', 'প্রশাসন', '/administration'),
  nav('Academics', 'শিক্ষা কার্যক্রম', '/academics'),
  nav('Notices', 'নোটিশ', '/notices'),
  nav('Results', 'ফলাফল', '/results'),
  nav('Admission', 'ভর্তি', '/admissions'),
  nav('Gallery', 'গ্যালারি', '/gallery'),
  nav('Contact', 'যোগাযোগ', '/contact'),
];

export const PORTAL_FOOTER: NavItem[] = [
  nav('About', 'প্রতিষ্ঠান পরিচিতি', '/about'),
  nav('Administration', 'প্রশাসন', '/administration'),
  nav('Notices', 'নোটিশ', '/notices'),
  nav('Results', 'ফলাফল', '/results'),
  nav('Admission', 'ভর্তি', '/admissions'),
  nav('Downloads', 'ডাউনলোড', '/downloads'),
  nav('Contact', 'যোগাযোগ', '/contact'),
];

export const PORTAL_HEADER_NAV = PORTAL_HEADER;

/* ── Home (Style A — classic Bangla school portal) ───────────────────────── */

export function bangladeshPortalHome(): TemplatePage {
  const b = pageBuilder('home');
  return page('', 'Home', 'হোম', [
    b('ImageSlider', { slides: [], autoplay: true, height: 'md' }),
    b('SidebarLayout', {
      sidebarSide: 'right', gap: 'md',
      main: [
        { type: 'NoticeBoard', props: { id: 'home-notices', heading: 'বিজ্ঞপ্তি', headingBn: '', viewAllHref: '/notices', limit: 5 } },
        { type: 'NewsTicker', props: { id: 'home-ticker' } },
        { type: 'InfoBoxGrid', props: { id: 'home-infobox', heading: '', headingBn: '' } },
        { type: 'VideoGallery', props: { id: 'home-videos', heading: 'ভিডিও গ্যালারি', headingBn: '', videos: [] } },
        { type: 'AlbumGrid', props: { id: 'home-albums', heading: 'ফটো গ্যালারি', headingBn: '', limit: 8 } },
      ],
      sidebar: [
        {
          type: 'SidebarCard',
          props: {
            id: 'home-sidebar-head', title: 'প্রধান শিক্ষকের বাণী',
            content: [{ type: 'HeadMessage', props: { id: 'home-head-msg', heading: '', headingBn: '', pad: 'none', tone: 'default' } }],
          },
        },
        { type: 'SidebarCard', props: { id: 'home-sidebar-eservice', title: 'ই-সেবা', content: [{ type: 'EServices', props: { id: 'home-eservices', heading: '', headingBn: '', pad: 'none' } }] } },
        { type: 'SidebarCard', props: { id: 'home-sidebar-fb', title: 'ফেসবুক পেজ', content: [{ type: 'FacebookPage', props: { id: 'home-fb', heading: '', headingBn: '', pad: 'none' } }] } },
        { type: 'SidebarCard', props: { id: 'home-sidebar-links', title: 'গুরুত্বপূর্ণ লিংক', content: [{ type: 'ImportantLinks', props: { id: 'home-links', heading: '', headingBn: '', pad: 'none' } }] } },
        { type: 'SidebarCard', props: { id: 'home-sidebar-hotline', title: 'জরুরি হটলাইন', content: [{ type: 'HotlineList', props: { id: 'home-hotline', heading: '', headingBn: '', pad: 'none', tone: 'default' } }] } },
        { type: 'SidebarCard', props: { id: 'home-sidebar-anthem', title: 'জাতীয় সংগীত', content: [{ type: 'AudioPlayer', props: { id: 'home-anthem', pad: 'none' } }] } },
      ],
    }),
    b('StatsLive', { tone: 'primary' }),
  ]);
}

/* ── Home (Style B — English-medium corporate) ───────────────────────────── */

export function corporateHome(): TemplatePage {
  const b = pageBuilder('home');
  return page('', 'Home', 'হোম', [
    b('Hero', {
      eyebrow: '{{site.tagline}}', eyebrowBn: '', title: '{{institution.name}}', titleBn: '',
      subtitle: 'Sample text: a warm introduction line about the school’s mission.', subtitleBn: 'নমুনা লেখা: প্রতিষ্ঠানের লক্ষ্য নিয়ে একটি স্বাগত বার্তা।',
      layout: 'center', height: 'md', overlay: 'brand', tone: 'dark', buttons: [btn('Admissions', 'ভর্তি', '/admissions', 'accent'), btn('About us', 'আমাদের সম্পর্কে', '/about', 'outline')],
    }),
    b('RichText', { body: '<p>Sample text — one short paragraph about the school, its approach and its community.</p>', bodyBn: '<p>নমুনা লেখা — প্রতিষ্ঠান, এর পদ্ধতি ও এর সম্প্রদায় নিয়ে একটি সংক্ষিপ্ত অনুচ্ছেদ।</p>', width: 'narrow', pad: 'sm' }),
    b('Columns', {
      layout: '3', gap: 'lg',
      col1: [{ type: 'Cards', props: { id: 'home-why', heading: 'Why choose us', headingBn: 'কেন আমাদের বেছে নেবেন', columns: '1', style: 'plain' } }],
      col2: [{ type: 'HeadMessage', props: { id: 'home-head', heading: 'Principal’s message', headingBn: 'অধ্যক্ষের বাণী', pad: 'none', tone: 'default' } }],
      col3: [{ type: 'NoticeBoard', props: { id: 'home-notices', heading: 'Notice board', headingBn: 'নোটিশ বোর্ড', limit: 5, viewAllHref: '/notices', pad: 'none' } }],
    }),
    b('Columns', {
      layout: '2-2-1', gap: 'lg', tone: 'surface',
      col1: [{ type: 'ResultSummary', props: { id: 'home-results', heading: 'Results', headingBn: 'ফলাফল', pad: 'none', tone: 'default' } }],
      col2: [{ type: 'DataList', props: { id: 'home-events', source: 'notices', layout: 'list', heading: 'Recent activities', headingBn: 'সাম্প্রতিক কার্যক্রম', limit: 4, pad: 'none' } }],
    }),
    b('StatsLive', { tone: 'primary' }),
    b('AlbumGrid', { heading: 'Gallery', headingBn: 'গ্যালারি', limit: 8, viewAllHref: '/gallery' }),
  ]);
}

/* ── About / প্রতিষ্ঠান পরিচিতি (DSHE 1, 2, 6) ─────────────────────────────── */

export function portalAboutPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('about');
  return page('about', 'About', 'প্রতিষ্ঠান পরিচিতি', [
    b('Heading', { eyebrow: 'About', eyebrowBn: 'প্রতিষ্ঠান পরিচিতি', text: 'About {{institution.name}}', textBn: '{{institution.name}} সম্পর্কে', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('ProfileFacts', { heading: 'Institution profile', headingBn: 'প্রতিষ্ঠান তথ্য' }),
    b('RichText', {
      body: '<h2>Our history</h2><p>Sample text — describe when and why the institution was founded. Replace this with your own history.</p>',
      bodyBn: '<h2>ইতিহাস</h2><p>নমুনা লেখা — প্রতিষ্ঠানটি কবে ও কেন প্রতিষ্ঠিত হয়েছে তা লিখুন।</p>',
      width: 'narrow', pad: 'md',
    }),
    b('Timeline'),
  ], 'About {{institution.name}}');
}

/* ── Administration (DSHE 10, 11: head, committee, staff) ─────────────────── */

export function administrationPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('admin');
  return page('administration', 'Administration', 'প্রশাসন', [
    b('Heading', { text: 'Administration', textBn: 'প্রশাসন', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('HeadMessage', { heading: 'Head of institution', headingBn: 'প্রতিষ্ঠান প্রধান' }),
    b('CommitteeList', { heading: 'Managing committee', headingBn: 'পরিচালনা কমিটি', tone: 'surface' }),
    b('StaffDirectory', { heading: 'Our teachers', headingBn: 'আমাদের শিক্ষকবৃন্দ' }),
    b('DataList', { source: 'staff', layout: 'cards', heading: 'Non-teaching staff', headingBn: 'অন্যান্য কর্মচারী', columns: '4', showDate: false, tone: 'surface' }),
  ], 'Administration at {{institution.name}}');
}

/* ── Academics (DSHE 3, 4, 5) ──────────────────────────────────────────────── */

export function portalAcademicsPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('academics');
  return page('academics', 'Academics', 'শিক্ষা কার্যক্রম', [
    b('Heading', { eyebrow: 'Academics', eyebrowBn: 'শিক্ষা কার্যক্রম', text: 'Learning at {{institution.name}}', textBn: '{{institution.name}}-এ শিক্ষা', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('ClassStats', {}),
    b('ClassRoutine', { tone: 'surface' }),
    b('ExamRoutine', {}),
    b('DownloadsList', { heading: 'Syllabus & downloads', headingBn: 'সিলেবাস ও ডাউনলোড', category: 'syllabus', tone: 'surface' }),
    b('Notices', { heading: 'Academic notices', headingBn: 'একাডেমিক নোটিশ', limit: 5 }),
  ], 'Academics at {{institution.name}}');
}

/* ── Notices ────────────────────────────────────────────────────────────────── */

export function portalNoticesPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('notices');
  return page('notices', 'Notices', 'নোটিশ', [
    b('Heading', { text: 'Notice board', textBn: 'নোটিশ বোর্ড', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('NoticeBoard', { heading: '', headingBn: '', limit: 30 }),
    b('EventsCalendar', { tone: 'surface' }),
  ], 'Notices from {{institution.name}}');
}

/* ── Results (summary, lookup, archive) ────────────────────────────────────── */

export function resultsPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('results');
  return page('results', 'Results', 'ফলাফল', [
    b('Heading', { text: 'Results', textBn: 'ফলাফল', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('ResultSummary', {}),
    b('ResultsLookup', { tone: 'surface' }),
    b('DataList', { source: 'results-archive', layout: 'table', heading: 'Result archive', headingBn: 'ফলাফলের আর্কাইভ', limit: 20, showDate: true, showImage: false, showDescription: false }),
    b('Toppers', {}),
  ], 'Results at {{institution.name}}');
}

/* ── Admission (circulars + enquiry) ───────────────────────────────────────── */

export function portalAdmissionsPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('admissions');
  return page('admissions', 'Admission', 'ভর্তি', [
    b('Heading', { eyebrow: 'Admission', eyebrowBn: 'ভর্তি', text: 'Admission at {{institution.name}}', textBn: '{{institution.name}}-এ ভর্তি', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('AdmissionCirculars', {}),
    b('EnquiryForm', { anchor: 'enquiry', tone: 'surface' }),
    b('FeeChart', {}),
  ], 'Admission at {{institution.name}}');
}

/* ── Gallery (albums + videos) ──────────────────────────────────────────────── */

export function galleryPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('gallery');
  return page('gallery', 'Gallery', 'গ্যালারি', [
    b('Heading', { text: 'Gallery', textBn: 'গ্যালারি', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('AlbumGrid', { heading: 'Photo albums', headingBn: 'ফটো অ্যালবাম', limit: 24, viewAllHref: '' }),
    b('VideoGallery', { heading: 'Video gallery', headingBn: 'ভিডিও গ্যালারি', videos: [], tone: 'surface' }),
  ], 'Gallery — {{institution.name}}');
}

/* ── Downloads ─────────────────────────────────────────────────────────────── */

export function downloadsPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('downloads');
  return page('downloads', 'Downloads', 'ডাউনলোড', [
    b('Heading', { text: 'Downloads', textBn: 'ডাউনলোড', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('DownloadsList', { heading: '', headingBn: '' }),
    b('LibraryCatalogue', { tone: 'surface' }),
  ], 'Downloads — {{institution.name}}');
}

/* ── Contact (DSHE 7, 8, 9) ─────────────────────────────────────────────────── */

export function portalContactPage(o: PageOpts = {}): TemplatePage {
  const b = pageBuilder('contact');
  return page('contact', 'Contact', 'যোগাযোগ', [
    b('Heading', { text: 'Contact us', textBn: 'যোগাযোগ করুন', level: 'h1', tone: o.tone ?? 'soft', pad: 'md' }),
    b('ContactInfo', { heading: '', headingBn: '' }),
    b('ProfileFacts', { heading: 'Information & complaints officers', headingBn: 'তথ্যসেবা ও অভিযোগ নিষ্পত্তি কর্মকর্তা', showRecognition: false, tone: 'surface' }),
    b('Map', {}),
    b('EnquiryForm', { heading: 'Send us a message', headingBn: 'বার্তা পাঠান', tone: 'surface' }),
  ], 'Contact {{institution.name}}');
}

/**
 * The full DSHE-complete page set (10 pages): a home builder (style-specific)
 * plus the nine shared inner pages every portal template uses.
 */
export function portalPages(home: TemplatePage, o: PageOpts = {}): TemplatePage[] {
  return [
    home,
    portalAboutPage(o),
    administrationPage(o),
    portalAcademicsPage(o),
    portalNoticesPage(o),
    resultsPage(o),
    portalAdmissionsPage(o),
    galleryPage(o),
    downloadsPage(o),
    portalContactPage(o),
  ];
}
