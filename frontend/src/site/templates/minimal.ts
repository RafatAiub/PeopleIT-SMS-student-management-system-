import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER } from './builders';
import type { SiteTemplate } from './types';

/** Everything on one page; the menu jumps to sections. Inner pages are kept for completeness. */
const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: '', eyebrowBn: '', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: one clear sentence about your institution.', subtitleBn: 'নমুনা লেখা: প্রতিষ্ঠান সম্পর্কে একটি পরিষ্কার বাক্য।',
    layout: 'center', height: 'md', tone: 'default', buttons: [btn('Admissions', 'ভর্তি', '#admissions'), btn('Contact', 'যোগাযোগ', '#contact', 'outline')],
  }),
  b('RichText', { anchor: 'about', width: 'narrow', align: 'center', body: '<h2>About</h2><p>Sample text — a short paragraph about who you are.</p>', bodyBn: '<h2>পরিচিতি</h2><p>নমুনা লেখা — আপনার প্রতিষ্ঠান সম্পর্কে একটি ছোট অনুচ্ছেদ।</p>' }),
  b('Divider', { lineStyle: 'brand' }),
  b('Notices', { anchor: 'notices', heading: 'Notices', headingBn: 'নোটিশ', limit: 3, width: 'narrow', showBody: false }),
  b('Divider', { lineStyle: 'brand' }),
  b('EnquiryForm', { anchor: 'admissions', heading: 'Admissions', headingBn: 'ভর্তি' }),
  b('ContactInfo', { anchor: 'contact', layout: 'list', width: 'narrow' }),
]);

export const minimal: SiteTemplate = {
  key: 'minimal',
  name: 'One-page Minimal',
  nameBn: 'এক পাতার মিনিমাল',
  description: 'A calm single page with lots of white space. Fastest to load; lite mode on by default.',
  descriptionBn: 'প্রচুর ফাঁকা জায়গাসহ শান্ত এক পাতার সাইট। সবচেয়ে দ্রুত লোড হয়; লাইট মোড চালু থাকে।',
  suits: ['any'],
  preview: { background: 'linear-gradient(180deg,#f8fafc 0%,#e2e8f0 100%)', layout: 'minimal' },
  theme: { primary: '#0f172a', accent: '#0ea5e9', font: 'system', radius: 'none', mode: 'light' },
  settings: { liteMode: true },
  navigation: {
    header: [nav('About', 'পরিচিতি', '/#about'), nav('Notices', 'নোটিশ', '/#notices'), nav('Admissions', 'ভর্তি', '/#admissions'), nav('Contact', 'যোগাযোগ', '/#contact')],
    footer: STANDARD_FOOTER,
  },
  pages: standardPages(home, { tone: 'default', cardStyle: 'plain' }),
};
