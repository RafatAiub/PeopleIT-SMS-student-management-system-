import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'An international education', eyebrowBn: 'আন্তর্জাতিক মানের শিক্ষা', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: name your curriculum (e.g. Cambridge / Edexcel) and your promise to families.', subtitleBn: 'নমুনা লেখা: আপনার পাঠ্যক্রম (যেমন কেমব্রিজ / এডেক্সেল) ও অভিভাবকদের প্রতি প্রতিশ্রুতি লিখুন।',
    layout: 'center', height: 'lg', overlay: 'brand', tone: 'primary', buttons: [btn('Admissions', 'ভর্তি', '/admissions', 'accent'), btn('Curriculum', 'পাঠ্যক্রম', '/curriculum', 'outline')],
  }),
  b('LogoStrip', { heading: 'Affiliations & examination boards', headingBn: 'অধিভুক্তি ও পরীক্ষা বোর্ড' }),
  b('Cards', { eyebrow: 'Our approach', eyebrowBn: 'আমাদের পদ্ধতি', heading: 'Educating global citizens', headingBn: 'বিশ্ব নাগরিক গড়ে তোলা', columns: '3' }),
  b('StatsLive', { tone: 'surface' }),
  b('PrincipalMessage', { heading: 'Welcome from the Principal', headingBn: 'অধ্যক্ষের শুভেচ্ছা', photoSide: 'right' }),
  b('Testimonials', { tone: 'soft' }),
  b('LatestNews'),
  b('CallToAction', { title: 'Book a campus visit', titleBn: 'ক্যাম্পাস পরিদর্শনের সময় নিন' }),
]);

const c = pageBuilder('curriculum');
const curriculum = page('curriculum', 'Curriculum', 'পাঠ্যক্রম', [
  c('Heading', { eyebrow: 'Curriculum', eyebrowBn: 'পাঠ্যক্রম', text: 'Our curriculum', textBn: 'আমাদের পাঠ্যক্রম', sub: 'Sample text: describe each stage from early years to A Level.', subBn: 'নমুনা লেখা: প্রাথমিক থেকে এ লেভেল পর্যন্ত প্রতিটি ধাপ বর্ণনা করুন।', level: 'h1', tone: 'soft', pad: 'md' }),
  c('Timeline', {
    heading: 'Stages', headingBn: 'স্তরসমূহ',
    items: [
      { year: 'Early years', title: 'Playgroup – KG', titleBn: 'প্লে-গ্রুপ – কেজি', text: 'Sample text.', textBn: 'নমুনা লেখা।' },
      { year: 'Primary', title: 'Grades 1–5', titleBn: 'গ্রেড ১–৫', text: 'Sample text.', textBn: 'নমুনা লেখা।' },
      { year: 'Secondary', title: 'O Level', titleBn: 'ও লেভেল', text: 'Sample text.', textBn: 'নমুনা লেখা।' },
      { year: 'Sixth form', title: 'A Level', titleBn: 'এ লেভেল', text: 'Sample text.', textBn: 'নমুনা লেখা।' },
    ],
  }),
  c('FAQ', { heading: 'Curriculum questions', headingBn: 'পাঠ্যক্রম নিয়ে প্রশ্ন', items: [{ q: 'Which exam board do you follow?', qBn: 'কোন পরীক্ষা বোর্ড অনুসরণ করা হয়?', a: 'Sample answer.', aBn: 'নমুনা উত্তর।' }] }),
]);

export const englishMedium: SiteTemplate = {
  key: 'english-medium',
  name: 'English-Medium International',
  nameBn: 'ইংলিশ মিডিয়াম',
  description: 'Polished navy and teal with an affiliations strip — for English-medium and international schools.',
  descriptionBn: 'নেভি ও টিল রঙে পরিশীলিত নকশা, অধিভুক্তি সহ — ইংলিশ মিডিয়াম ও আন্তর্জাতিক স্কুলের জন্য।',
  suits: ['school'],
  preview: { background: 'linear-gradient(135deg,#0f2a4a 0%,#0f766e 100%)', layout: 'hero-center' },
  theme: { primary: '#0f2a4a', accent: '#14b8a6', font: 'poppins', radius: 'md', mode: 'light' },
  settings: { defaultLanguage: 'en', languages: ['en', 'bn'] },
  navigation: { header: [...STANDARD_HEADER.slice(0, 3), nav('Curriculum', 'পাঠ্যক্রম', '/curriculum'), ...STANDARD_HEADER.slice(4)], footer: STANDARD_FOOTER },
  pages: [...standardPages(home), curriculum],
};
