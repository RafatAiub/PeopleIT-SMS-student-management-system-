import { btn, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('AnnouncementBar', { text: 'Limited seats — register today.', textBn: 'সীমিত আসন — আজই নিবন্ধন করুন।', linkLabel: 'Register', href: '#register', dismissible: true, tone: 'accent' }),
  b('Hero', {
    eyebrow: 'Admission fair', eyebrowBn: 'ভর্তি মেলা', title: '{{institution.name}} Admission Fair', titleBn: '{{institution.name}} ভর্তি মেলা',
    subtitle: 'Sample text: meet teachers, tour the campus and get your questions answered.', subtitleBn: 'নমুনা লেখা: শিক্ষকদের সাথে দেখা করুন, ক্যাম্পাস ঘুরে দেখুন ও প্রশ্নের উত্তর পান।',
    buttons: [btn('Register now', 'নিবন্ধন করুন', '#register'), btn('View schedule', 'সময়সূচি দেখুন', '#schedule', 'outline')],
    layout: 'center', height: 'lg', tone: 'dark',
  }),
  b('Countdown', {
    heading: 'Event starts in', headingBn: 'অনুষ্ঠান শুরু হতে বাকি', targetDate: '', expiredText: 'The event has started — see you there!', expiredTextBn: 'অনুষ্ঠান শুরু হয়ে গেছে — দেখা হবে!',
    buttons: [{ label: 'Register now', labelBn: 'নিবন্ধন করুন', href: '#register' }], tone: 'dark',
  }),
  b('Steps', {
    anchor: 'schedule', heading: 'Event agenda', headingBn: 'অনুষ্ঠান সূচি', align: 'center',
    items: [
      { icon: 'calendar', title: 'Doors open', titleBn: 'প্রবেশ শুরু', text: 'Sample text — arrival and registration.', textBn: 'নমুনা লেখা — আগমন ও নিবন্ধন।' },
      { icon: 'users', title: 'Campus tour', titleBn: 'ক্যাম্পাস ভ্রমণ', text: 'Sample text — guided walk through classrooms and facilities.', textBn: 'নমুনা লেখা — শ্রেণিকক্ষ ও সুবিধাদি ঘুরে দেখানো হবে।' },
      { icon: 'lightbulb', title: 'Q&A with teachers', titleBn: 'শিক্ষকদের সাথে প্রশ্নোত্তর', text: 'Sample text — ask anything about admissions and academics.', textBn: 'নমুনা লেখা — ভর্তি ও লেখাপড়া নিয়ে প্রশ্ন করুন।' },
    ],
  }),
  b('EnquiryForm', { anchor: 'register', heading: 'Register for the fair', headingBn: 'মেলার জন্য নিবন্ধন করুন', tone: 'surface' }),
  b('Testimonials', { heading: 'From past events', headingBn: 'আগের অনুষ্ঠান থেকে', items: [] }),
  b('GradientBanner', { title: 'See you at the fair', titleBn: 'মেলায় দেখা হবে', buttons: [{ label: 'Register now', labelBn: 'নিবন্ধন করুন', href: '#register' }] }),
]);

export const eventLanding: SiteTemplate = {
  key: 'event-landing',
  name: 'Event / Admission Fair',
  nameBn: 'অনুষ্ঠান / ভর্তি মেলা',
  description: 'A countdown-driven landing page for an admission fair, open house or annual event.',
  descriptionBn: 'ভর্তি মেলা, ওপেন হাউস বা বার্ষিক অনুষ্ঠানের জন্য কাউন্টডাউনসহ ল্যান্ডিং পেজ।',
  suits: ['school', 'college', 'any'],
  preview: { background: 'linear-gradient(135deg,#be123c 0%,#ea580c 100%)', layout: 'bold' },
  theme: { primary: '#be123c', accent: '#f59e0b', font: 'poppins', radius: 'md', mode: 'light' },
  navigation: { header: STANDARD_HEADER, footer: STANDARD_FOOTER },
  pages: standardPages(home, { tone: 'soft' }),
};
