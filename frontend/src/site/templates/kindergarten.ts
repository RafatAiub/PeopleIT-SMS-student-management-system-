import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const card = (icon: string, title: string, titleBn: string) => ({ icon, image: '', title, titleBn, text: 'Sample text — describe this activity.', textBn: 'নমুনা লেখা — এই কার্যক্রম সম্পর্কে লিখুন।', href: '', linkLabel: '', linkLabelBn: '' });

const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'Hello, little learners!', eyebrowBn: 'ছোট্ট বন্ধুরা, স্বাগতম!', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: a warm line about play, care and learning.', subtitleBn: 'নমুনা লেখা: খেলা, যত্ন ও শেখা নিয়ে একটি উষ্ণ লাইন।',
    layout: 'split', tone: 'soft', buttons: [btn('Book a visit', 'পরিদর্শনের সময় নিন', '/admissions', 'accent'), btn('Our day', 'আমাদের দিন', '/daily-life', 'outline')],
  }),
  b('Cards', {
    heading: 'Learning through play', headingBn: 'খেলায় খেলায় শেখা', align: 'center', style: 'centered', columns: '4',
    cards: [card('palette', 'Art & craft', 'আঁকা ও হাতের কাজ'), card('book', 'Stories', 'গল্প'), card('ball', 'Outdoor play', 'খোলা মাঠে খেলা'), card('heart', 'Care', 'যত্ন')],
  }),
  b('Gallery', { heading: 'Happy moments', headingBn: 'আনন্দের মুহূর্ত', align: 'center', columns: '4' }),
  b('Testimonials', { tone: 'soft' }),
  b('EventsCalendar', { view: 'list', heading: 'What’s coming up', headingBn: 'সামনে যা আছে' }),
  b('FAQ', { tone: 'surface' }),
  b('CallToAction', { style: 'card', tone: 'accent', title: 'Come and say hello', titleBn: 'একবার ঘুরে যান' }),
]);

const d = pageBuilder('daily');
const daily = page('daily-life', 'Daily life', 'দৈনন্দিন', [
  d('Heading', { text: 'A day at {{institution.name}}', textBn: '{{institution.name}}-এ একটি দিন', level: 'h1', tone: 'soft', pad: 'md', align: 'center' }),
  d('Timeline', {
    heading: 'Our daily rhythm', headingBn: 'দিনের রুটিন',
    items: [
      { year: 'Morning', title: 'Arrival & circle time', titleBn: 'আগমন ও বৃত্তে বসা', text: 'Sample text.', textBn: 'নমুনা লেখা।' },
      { year: 'Midday', title: 'Lunch & rest', titleBn: 'দুপুরের খাবার ও বিশ্রাম', text: 'Sample text.', textBn: 'নমুনা লেখা।' },
    ],
  }),
  d('Gallery', { heading: '', headingBn: '' }),
]);

export const kindergarten: SiteTemplate = {
  key: 'kindergarten',
  name: 'Kindergarten Playful',
  nameBn: 'কিন্ডারগার্টেন',
  description: 'Rounded shapes and cheerful colours for pre-schools and kindergartens.',
  descriptionBn: 'গোলাকার আকৃতি ও উজ্জ্বল রঙ — প্রি-স্কুল ও কিন্ডারগার্টেনের জন্য।',
  suits: ['kindergarten'],
  preview: { background: 'linear-gradient(135deg,#f472b6 0%,#facc15 55%,#34d399 100%)', layout: 'playful' },
  theme: { primary: '#be185d', accent: '#facc15', font: 'nunito', radius: 'xl', mode: 'light' },
  navigation: { header: [STANDARD_HEADER[0], STANDARD_HEADER[1], nav('Daily life', 'দৈনন্দিন', '/daily-life'), STANDARD_HEADER[2], STANDARD_HEADER[4], STANDARD_HEADER[5]], footer: STANDARD_FOOTER },
  pages: [...standardPages(home, { cardStyle: 'centered', radiusHeavy: true }), daily],
};
