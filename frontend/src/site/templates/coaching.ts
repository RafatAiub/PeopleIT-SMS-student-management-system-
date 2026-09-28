import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const batch = (icon: string, title: string, titleBn: string) => ({ icon, image: '', title, titleBn, text: 'Sample text — schedule, duration and who it is for.', textBn: 'নমুনা লেখা — সময়সূচি, মেয়াদ ও কাদের জন্য।', href: '/admissions', linkLabel: 'Enrol', linkLabelBn: 'ভর্তি হোন' });

const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'Admission & exam preparation', eyebrowBn: 'ভর্তি ও পরীক্ষা প্রস্তুতি', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: the exams you prepare students for and how.', subtitleBn: 'নমুনা লেখা: কোন পরীক্ষার প্রস্তুতি এবং কীভাবে।',
    layout: 'split', tone: 'dark', buttons: [btn('Enrol now', 'এখনই ভর্তি হোন', '/admissions', 'accent'), btn('Batches', 'ব্যাচসমূহ', '/batches', 'outline')],
  }),
  b('Cards', {
    heading: 'Current batches', headingBn: 'চলমান ব্যাচ', columns: '3',
    cards: [batch('book', 'SSC batch', 'এসএসসি ব্যাচ'), batch('graduation', 'HSC batch', 'এইচএসসি ব্যাচ'), batch('trophy', 'Admission test', 'ভর্তি পরীক্ষা')],
  }),
  b('Toppers', { heading: 'Our achievers', headingBn: 'আমাদের সাফল্য', tone: 'soft' }),
  b('StatsLive', { tone: 'accent', showClasses: false }),
  b('Testimonials', { heading: 'Students say', headingBn: 'শিক্ষার্থীদের কথা' }),
  b('ClassRoutine', { heading: 'Batch routine', headingBn: 'ব্যাচ রুটিন', tone: 'surface' }),
  b('CallToAction', { title: 'Seats are limited', titleBn: 'আসন সীমিত', text: 'Sample text: how to reserve a seat.', textBn: 'নমুনা লেখা: কীভাবে আসন নিশ্চিত করবেন।' }),
]);

const t = pageBuilder('batches');
const batches = page('batches', 'Batches', 'ব্যাচসমূহ', [
  t('Heading', { text: 'Batches & schedules', textBn: 'ব্যাচ ও সময়সূচি', level: 'h1', tone: 'soft', pad: 'md' }),
  t('Cards', { heading: '', headingBn: '', columns: '3' }),
  t('ClassRoutine', { heading: 'Routine', headingBn: 'রুটিন' }),
  t('FeePayment', { tone: 'surface' }),
]);

export const coaching: SiteTemplate = {
  key: 'coaching',
  name: 'Coaching Centre',
  nameBn: 'কোচিং সেন্টার',
  description: 'Bold and energetic: batches, achievers and routines front and centre.',
  descriptionBn: 'সাহসী ও প্রাণবন্ত: ব্যাচ, সাফল্য ও রুটিন সবার আগে।',
  suits: ['coaching'],
  preview: { background: 'linear-gradient(135deg,#111827 0%,#b91c1c 100%)', layout: 'bold' },
  theme: { primary: '#b91c1c', accent: '#fbbf24', font: 'poppins', radius: 'lg', mode: 'light' },
  navigation: { header: [STANDARD_HEADER[0], nav('Batches', 'ব্যাচসমূহ', '/batches'), STANDARD_HEADER[2], STANDARD_HEADER[3], STANDARD_HEADER[4], STANDARD_HEADER[5]], footer: STANDARD_FOOTER },
  pages: [...standardPages(home), batches],
};
