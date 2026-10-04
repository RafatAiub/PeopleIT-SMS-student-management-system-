import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const dept = (icon: string, title: string, titleBn: string) => ({ icon, image: '', title, titleBn, text: 'Sample text — describe this department.', textBn: 'নমুনা লেখা — এই বিভাগ সম্পর্কে লিখুন।', href: '/departments', linkLabel: '', linkLabelBn: '' });

const home = page('', 'Home', 'হোম', [
  b('Hero', {
    // Arabic-script accent: the Basmala, a customary opening (not a claim about the school).
    eyebrow: 'بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', eyebrowBn: 'بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: a line about combining religious and general education.', subtitleBn: 'নমুনা লেখা: দ্বীনি ও সাধারণ শিক্ষার সমন্বয় নিয়ে একটি লাইন।',
    layout: 'center', height: 'md', tone: 'primary', buttons: [btn('Admission', 'ভর্তি', '/admissions', 'accent'), btn('Departments', 'বিভাগসমূহ', '/departments', 'outline')],
  }),
  b('Cards', {
    heading: 'Our departments', headingBn: 'আমাদের বিভাগসমূহ', align: 'center', style: 'centered', columns: '3',
    cards: [dept('book', 'Hifzul Quran', 'হিফজুল কুরআন'), dept('mosque', 'Nazera', 'নাজেরা'), dept('graduation', 'Kitab / Alim', 'কিতাব / আলিম')],
  }),
  b('PrincipalMessage', { heading: 'Message from the Muhtamim', headingBn: 'মুহতামিম সাহেবের বাণী', designation: 'Muhtamim', designationBn: 'মুহতামিম', tone: 'surface' }),
  b('Notices', { heading: 'Notice board', headingBn: 'নোটিশ বোর্ড' }),
  b('EventsCalendar', { tone: 'soft' }),
  b('StatsLive', { tone: 'primary' }),
  b('ContactInfo'),
]);

const d = pageBuilder('departments');
const departments = page('departments', 'Departments', 'বিভাগসমূহ', [
  d('Heading', { text: 'Departments', textBn: 'বিভাগসমূহ', sub: 'Sample text: an overview of your departments and levels.', subBn: 'নমুনা লেখা: বিভাগ ও স্তরসমূহের সংক্ষিপ্ত বিবরণ।', level: 'h1', tone: 'soft', pad: 'md', align: 'center' }),
  d('RichText', {
    body: '<h2>Hifzul Quran</h2><p>Sample text.</p><h2>Nazera</h2><p>Sample text.</p><h2>Kitab / Alim</h2><p>Sample text.</p>',
    bodyBn: '<h2>হিফজুল কুরআন</h2><p>নমুনা লেখা।</p><h2>নাজেরা</h2><p>নমুনা লেখা।</p><h2>কিতাব / আলিম</h2><p>নমুনা লেখা।</p>',
    width: 'narrow',
  }),
  d('TeacherDirectory', { heading: 'Our asatiza', headingBn: 'আমাদের আসাতিযায়ে কেরাম', tone: 'surface' }),
]);

export const madrasa: SiteTemplate = {
  key: 'madrasa',
  name: 'Madrasa',
  nameBn: 'মাদ্রাসা',
  description: 'Deep green with an Arabic-script accent and a Naskh typeface — for madrasas and Islamic institutions.',
  descriptionBn: 'গাঢ় সবুজ রঙ, আরবি লিপির ছোঁয়া ও নাসখ ফন্ট — মাদ্রাসা ও ইসলামি প্রতিষ্ঠানের জন্য।',
  suits: ['madrasa'],
  preview: { background: 'linear-gradient(160deg,#065f46 0%,#022c22 100%)', layout: 'arch' },
  theme: { primary: '#065f46', accent: '#d4a017', font: 'noto-naskh', radius: 'md', mode: 'light' },
  settings: { defaultLanguage: 'bn', languages: ['bn', 'en'] },
  navigation: { header: [STANDARD_HEADER[0], STANDARD_HEADER[1], nav('Departments', 'বিভাগসমূহ', '/departments'), STANDARD_HEADER[2], STANDARD_HEADER[4], STANDARD_HEADER[5]], footer: STANDARD_FOOTER },
  pages: [...standardPages(home, { cardStyle: 'centered' }), departments],
};
