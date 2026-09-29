import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const faculty = (icon: string, title: string, titleBn: string) => ({ icon, image: '', title, titleBn, text: 'Sample text — subjects and programmes offered.', textBn: 'নমুনা লেখা — প্রদত্ত বিষয় ও কার্যক্রম।', href: '/departments', linkLabel: 'Learn more', linkLabelBn: 'বিস্তারিত' });

const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'Higher secondary & degree', eyebrowBn: 'উচ্চ মাধ্যমিক ও স্নাতক', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: a line about academic excellence and campus life.', subtitleBn: 'নমুনা লেখা: শিক্ষার মান ও ক্যাম্পাস জীবন নিয়ে একটি লাইন।',
    layout: 'left', height: 'lg', overlay: 'gradient', tone: 'dark', buttons: [btn('Admission', 'ভর্তি', '/admissions', 'accent'), btn('Results', 'ফলাফল', '/results', 'outline')],
  }),
  b('Cards', {
    heading: 'Faculties & groups', headingBn: 'অনুষদ ও বিভাগ', columns: '3',
    cards: [faculty('flask', 'Science', 'বিজ্ঞান'), faculty('globe', 'Humanities', 'মানবিক'), faculty('computer', 'Business Studies', 'ব্যবসায় শিক্ষা')],
  }),
  b('Columns', {
    layout: '2-2-1', gap: 'lg',
    col1: [pageBuilder('home-c1')('Notices', { heading: 'Notices', headingBn: 'নোটিশ', pad: 'none', limit: 6 })],
    col2: [pageBuilder('home-c2')('EventsCalendar', { heading: 'Academic calendar', headingBn: 'একাডেমিক ক্যালেন্ডার', view: 'list', pad: 'none' })],
  }),
  b('StatsLive', { tone: 'primary' }),
  b('Toppers', { heading: 'Merit list', headingBn: 'মেধা তালিকা' }),
  b('LatestNews', { tone: 'surface' }),
]);

const d = pageBuilder('departments');
const departments = page('departments', 'Departments', 'বিভাগসমূহ', [
  d('Heading', { text: 'Departments', textBn: 'বিভাগসমূহ', level: 'h1', tone: 'soft', pad: 'md' }),
  d('Cards', { heading: '', headingBn: '', columns: '3' }),
  d('TeacherDirectory', { heading: 'Faculty members', headingBn: 'শিক্ষকমণ্ডলী', tone: 'surface' }),
]);

const r = pageBuilder('results');
const results = page('results', 'Results', 'ফলাফল', [
  r('Heading', { text: 'Results', textBn: 'ফলাফল', level: 'h1', tone: 'soft', pad: 'md' }),
  r('ResultsLookup', { heading: '', headingBn: '' }),
  r('Toppers', { tone: 'surface' }),
]);

export const college: SiteTemplate = {
  key: 'college',
  name: 'College',
  nameBn: 'কলেজ',
  description: 'Confident indigo with faculties, an academic calendar and results — for colleges.',
  descriptionBn: 'অনুষদ, একাডেমিক ক্যালেন্ডার ও ফলাফলসহ আত্মবিশ্বাসী নকশা — কলেজের জন্য।',
  suits: ['college'],
  preview: { background: 'linear-gradient(135deg,#312e81 0%,#1e1b4b 100%)', layout: 'cards' },
  theme: { primary: '#3730a3', accent: '#f97316', font: 'inter', headingFont: 'merriweather', radius: 'md', mode: 'light' },
  navigation: {
    header: [STANDARD_HEADER[0], STANDARD_HEADER[1], nav('Departments', 'বিভাগসমূহ', '/departments'), STANDARD_HEADER[2], nav('Results', 'ফলাফল', '/results'), STANDARD_HEADER[4], STANDARD_HEADER[5]],
    footer: STANDARD_FOOTER,
  },
  pages: [...standardPages(home), departments, results],
};
