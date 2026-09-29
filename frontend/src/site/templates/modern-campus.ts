import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'Welcome to', eyebrowBn: 'স্বাগতম', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: one sentence about what makes your school special.', subtitleBn: 'নমুনা লেখা: আপনার প্রতিষ্ঠানের বিশেষত্ব নিয়ে একটি বাক্য।',
    layout: 'split', tone: 'soft', buttons: [btn('Apply for admission', 'ভর্তির আবেদন', '/admissions'), btn('Take a tour', 'ঘুরে দেখুন', '/about', 'outline')],
  }),
  b('StatsLive', { tone: 'primary' }),
  b('Cards', { eyebrow: 'Why us', eyebrowBn: 'কেন আমরা', heading: 'A modern place to learn', headingBn: 'আধুনিক শিক্ষার পরিবেশ', align: 'center', style: 'centered' }),
  b('Columns', {
    layout: '2', gap: 'lg', align: 'start',
    col1: [pageBuilder('home-c1')('Notices', { heading: 'Latest notices', headingBn: 'সর্বশেষ নোটিশ', limit: 4, pad: 'none', showBody: false })],
    col2: [pageBuilder('home-c2')('EventsCalendar', { heading: 'Upcoming', headingBn: 'আসন্ন', view: 'list', pad: 'none' })],
  }),
  b('PrincipalMessage', { tone: 'surface' }),
  b('Gallery', { layout: 'carousel' }),
  b('Testimonials'),
  b('LatestNews', { tone: 'surface' }),
  b('CallToAction', { style: 'card' }),
]);

const g = pageBuilder('gallery');
const gallery = page('gallery', 'Gallery', 'গ্যালারি', [
  g('Heading', { text: 'Campus gallery', textBn: 'ক্যাম্পাস গ্যালারি', level: 'h1', tone: 'soft', pad: 'md' }),
  g('Gallery', { heading: '', headingBn: '', columns: '3' }),
  g('Video', { heading: 'Campus video', headingBn: 'ক্যাম্পাস ভিডিও' }),
]);

export const modernCampus: SiteTemplate = {
  key: 'modern-campus',
  name: 'Modern Campus',
  nameBn: 'আধুনিক ক্যাম্পাস',
  description: 'Clean and bright, with live notices, events and stats up front. A safe choice for most schools.',
  descriptionBn: 'পরিচ্ছন্ন ও উজ্জ্বল; লাইভ নোটিশ, ইভেন্ট ও পরিসংখ্যান সামনে। বেশিরভাগ স্কুলের জন্য উপযোগী।',
  suits: ['school', 'any'],
  preview: { background: 'linear-gradient(135deg,#1d4ed8 0%,#38bdf8 100%)', layout: 'split' },
  theme: { primary: '#1d4ed8', accent: '#f59e0b', font: 'inter', radius: 'lg', mode: 'light' },
  navigation: { header: [...STANDARD_HEADER.slice(0, 5), nav('Gallery', 'গ্যালারি', '/gallery'), STANDARD_HEADER[5]], footer: STANDARD_FOOTER },
  pages: [...standardPages(home), gallery],
};
