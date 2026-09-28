import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const tech = (icon: string, title: string, titleBn: string) => ({ icon, image: '', title, titleBn, text: 'Sample text — what students learn and the career paths.', textBn: 'নমুনা লেখা — কী শেখানো হয় ও ক্যারিয়ারের সুযোগ।', href: '/technologies', linkLabel: 'Details', linkLabelBn: 'বিস্তারিত' });

const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'Diploma in Engineering', eyebrowBn: 'ডিপ্লোমা ইন ইঞ্জিনিয়ারিং', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: a line about hands-on, job-ready technical education.', subtitleBn: 'নমুনা লেখা: হাতে-কলমে, কর্মমুখী কারিগরি শিক্ষা নিয়ে একটি লাইন।',
    layout: 'left', height: 'md', overlay: 'dark', tone: 'dark', buttons: [btn('Technologies', 'টেকনোলজি', '/technologies', 'accent'), btn('Admission', 'ভর্তি', '/admissions', 'outline')],
  }),
  b('Cards', {
    heading: 'Technologies', headingBn: 'টেকনোলজিসমূহ', columns: '4',
    cards: [tech('computer', 'Computer', 'কম্পিউটার'), tech('lightbulb', 'Electrical', 'ইলেকট্রিক্যাল'), tech('wrench', 'Mechanical', 'মেকানিক্যাল'), tech('globe', 'Civil', 'সিভিল')],
  }),
  b('StatsLive', { tone: 'primary' }),
  b('Gallery', { heading: 'Labs & workshops', headingBn: 'ল্যাব ও ওয়ার্কশপ', layout: 'carousel', tone: 'surface' }),
  b('Notices'),
  b('LogoStrip', { heading: 'Industry partners', headingBn: 'শিল্প অংশীদার' }),
  b('CallToAction', { style: 'card', title: 'Start your technical career', titleBn: 'কারিগরি ক্যারিয়ার শুরু করুন' }),
]);

const t = pageBuilder('technologies');
const technologies = page('technologies', 'Technologies', 'টেকনোলজি', [
  t('Heading', { text: 'Technologies', textBn: 'টেকনোলজিসমূহ', sub: 'Sample text: an overview of the diploma programmes.', subBn: 'নমুনা লেখা: ডিপ্লোমা কার্যক্রমের সংক্ষিপ্ত বিবরণ।', level: 'h1', tone: 'soft', pad: 'md' }),
  t('Cards', { heading: '', headingBn: '', columns: '2' }),
  t('Gallery', { heading: 'Labs', headingBn: 'ল্যাবসমূহ' }),
  t('TeacherDirectory', { heading: 'Instructors', headingBn: 'ইন্সট্রাক্টরবৃন্দ', tone: 'surface' }),
]);

export const polytechnic: SiteTemplate = {
  key: 'polytechnic',
  name: 'Polytechnic / Technical',
  nameBn: 'পলিটেকনিক / কারিগরি',
  description: 'Industrial slate and safety orange with technologies, labs and partners.',
  descriptionBn: 'শিল্পধর্মী স্লেট ও কমলা রঙ; টেকনোলজি, ল্যাব ও অংশীদার সহ।',
  suits: ['technical'],
  preview: { background: 'linear-gradient(135deg,#1f2937 0%,#ea580c 120%)', layout: 'grid' },
  theme: { primary: '#334155', accent: '#ea580c', font: 'inter', radius: 'sm', mode: 'light' },
  navigation: { header: [STANDARD_HEADER[0], STANDARD_HEADER[1], nav('Technologies', 'টেকনোলজি', '/technologies'), STANDARD_HEADER[2], STANDARD_HEADER[4], STANDARD_HEADER[5]], footer: STANDARD_FOOTER },
  pages: [...standardPages(home, { cardStyle: 'card' }), technologies],
};
