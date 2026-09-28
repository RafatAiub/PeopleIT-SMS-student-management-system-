import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: '{{site.tagline}}', eyebrowBn: '', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: your motto or a line about your tradition of learning.', subtitleBn: 'নমুনা লেখা: আপনার মূলমন্ত্র বা শিক্ষার ঐতিহ্য নিয়ে একটি লাইন।',
    layout: 'center', height: 'lg', overlay: 'dark', tone: 'dark', buttons: [btn('Our history', 'আমাদের ইতিহাস', '/history', 'accent'), btn('Admissions', 'ভর্তি', '/admissions', 'outline')],
  }),
  b('PrincipalMessage', { tone: 'default', heading: 'From the Head’s desk', headingBn: 'প্রধান শিক্ষকের বাণী', designation: 'Head of institution', designationBn: 'প্রতিষ্ঠান প্রধান' }),
  b('Divider', { lineStyle: 'brand' }),
  b('Notices', { heading: 'Notice board', headingBn: 'নোটিশ বোর্ড', tone: 'surface', align: 'center' }),
  b('Cards', { heading: 'Our traditions', headingBn: 'আমাদের ঐতিহ্য', style: 'plain', align: 'center' }),
  b('Toppers', { tone: 'soft', align: 'center' }),
  b('StatsLive', { tone: 'dark' }),
  b('ContactInfo', { tone: 'surface', layout: 'cards' }),
]);

const h = pageBuilder('history');
const history = page('history', 'History', 'ইতিহাস', [
  h('Heading', { text: 'Our history', textBn: 'আমাদের ইতিহাস', sub: 'Sample text: a short introduction to your institution’s story.', subBn: 'নমুনা লেখা: প্রতিষ্ঠানের ইতিহাসের সংক্ষিপ্ত ভূমিকা।', level: 'h1', tone: 'soft', pad: 'md', align: 'center' }),
  h('Timeline', { heading: '', headingBn: '' }),
  h('Gallery', { heading: 'Then and now', headingBn: 'তখন ও এখন' }),
]);

export const classicHeritage: SiteTemplate = {
  key: 'classic-heritage',
  name: 'Classic Heritage',
  nameBn: 'ঐতিহ্যবাহী',
  description: 'Serif headings, deep maroon and gold — for established schools with a long tradition.',
  descriptionBn: 'সেরিফ শিরোনাম, গাঢ় মেরুন ও সোনালি — দীর্ঘ ঐতিহ্যের প্রতিষ্ঠানের জন্য।',
  suits: ['school', 'college'],
  preview: { background: 'linear-gradient(160deg,#7f1d1d 0%,#450a0a 70%)', layout: 'classic' },
  theme: { primary: '#7f1d1d', accent: '#ca8a04', font: 'lora', headingFont: 'playfair', radius: 'sm', mode: 'light' },
  navigation: { header: [STANDARD_HEADER[0], STANDARD_HEADER[1], nav('History', 'ইতিহাস', '/history'), ...STANDARD_HEADER.slice(2)], footer: STANDARD_FOOTER },
  pages: [...standardPages(home, { tone: 'surface', cardStyle: 'plain' }), history],
};
