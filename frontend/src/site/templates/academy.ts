import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const course = (icon: string, title: string, titleBn: string) => ({ icon, image: '', title, titleBn, text: 'Sample text — duration, format and fee.', textBn: 'নমুনা লেখা — মেয়াদ, ধরন ও ফি।', href: '/courses', linkLabel: 'View course', linkLabelBn: 'কোর্স দেখুন' });

const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'Learn new skills', eyebrowBn: 'নতুন দক্ষতা শিখুন', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: what learners will achieve with your courses.', subtitleBn: 'নমুনা লেখা: আপনার কোর্সে শিক্ষার্থীরা কী অর্জন করবে।',
    layout: 'split', tone: 'soft', buttons: [btn('Browse courses', 'কোর্স দেখুন', '/courses'), btn('Talk to us', 'কথা বলুন', '/contact', 'outline')],
  }),
  b('Cards', {
    eyebrow: 'Popular', eyebrowBn: 'জনপ্রিয়', heading: 'Featured courses', headingBn: 'নির্বাচিত কোর্স', columns: '3',
    cards: [course('computer', 'Course name', 'কোর্সের নাম'), course('palette', 'Course name', 'কোর্সের নাম'), course('globe', 'Course name', 'কোর্সের নাম')],
  }),
  b('Courses', { heading: 'Online courses', headingBn: 'অনলাইন কোর্স', tone: 'surface' }),
  b('StatsCounter', { heading: '', headingBn: '', tone: 'primary' }),
  b('Testimonials', { heading: 'Learner stories', headingBn: 'শিক্ষার্থীদের গল্প' }),
  b('FAQ', { tone: 'surface' }),
  b('AiAssistant', { display: 'floating' }),
  b('CallToAction', { title: 'Ready to start?', titleBn: 'শুরু করতে প্রস্তুত?', buttons: [btn('Enrol now', 'এখনই ভর্তি হোন', '/admissions')] }),
]);

export const academy: SiteTemplate = {
  key: 'academy',
  name: 'Academy',
  nameBn: 'একাডেমি',
  description: 'Course-sales focused: featured courses, learner stories and an AI chat assistant.',
  descriptionBn: 'কোর্স বিক্রয়কেন্দ্রিক: নির্বাচিত কোর্স, শিক্ষার্থীদের গল্প ও এআই চ্যাট সহকারী।',
  suits: ['coaching', 'any'],
  preview: { background: 'linear-gradient(135deg,#7c3aed 0%,#06b6d4 100%)', layout: 'courses' },
  theme: { primary: '#6d28d9', accent: '#06b6d4', font: 'poppins', radius: 'lg', mode: 'light' },
  // `/courses` is now the real course catalogue (LMS wave) — no separate Puck page needed;
  // `courses` is a reserved page slug (see backend §2 and `frontend/src/site/routes.ts`).
  settings: { courses: { enabled: true } },
  navigation: { header: [STANDARD_HEADER[0], nav('Courses', 'কোর্স', '/courses'), STANDARD_HEADER[1], STANDARD_HEADER[2], STANDARD_HEADER[5]], footer: STANDARD_FOOTER },
  pages: standardPages(home),
};
