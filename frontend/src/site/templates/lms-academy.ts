import { btn, nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('Hero', {
    eyebrow: 'Learn at your own pace', eyebrowBn: 'নিজের গতিতে শিখুন', title: '{{institution.name}}', titleBn: '',
    subtitle: 'Sample text: video lessons, downloadable materials and progress tracking for every learner.', subtitleBn: 'নমুনা লেখা: প্রতিটি শিক্ষার্থীর জন্য ভিডিও পাঠ, ডাউনলোডযোগ্য উপকরণ ও অগ্রগতি ট্র্যাকিং।',
    layout: 'split', tone: 'soft', backgroundImage: '',
    buttons: [btn('Browse courses', 'কোর্স দেখুন', '/courses'), btn('Sign in', 'সাইন ইন', '/account/login', 'outline')],
  }),
  b('CourseGrid', { eyebrow: 'Catalogue', eyebrowBn: 'ক্যাটালগ', heading: 'Featured courses', headingBn: 'নির্বাচিত কোর্স', limit: 6, columns: '3' }),
  b('Steps', {
    heading: 'Your learning journey', headingBn: 'আপনার শেখার যাত্রা', align: 'center',
    items: [
      { icon: 'book', title: 'Choose a course', titleBn: 'কোর্স বাছাই করুন', text: 'Sample text — browse the catalogue and pick what you want to learn.', textBn: 'নমুনা লেখা — ক্যাটালগ দেখে পছন্দের কোর্স বেছে নিন।' },
      { icon: 'users', title: 'Enrol', titleBn: 'ভর্তি হোন', text: 'Sample text — create a free account and enrol instantly.', textBn: 'নমুনা লেখা — ফ্রি অ্যাকাউন্ট খুলে সাথে সাথে ভর্তি হোন।' },
      { icon: 'trophy', title: 'Learn and track progress', titleBn: 'শিখুন ও অগ্রগতি দেখুন', text: 'Sample text — watch lessons, complete them and see your progress grow.', textBn: 'নমুনা লেখা — পাঠ দেখুন, সম্পন্ন করুন ও অগ্রগতি দেখুন।' },
    ],
  }),
  b('Team', { heading: 'Meet the instructors', headingBn: 'প্রশিক্ষকদের সাথে পরিচিত হোন', members: [] }),
  b('PricingTable', {
    heading: 'Choose your course', headingBn: 'আপনার কোর্স বেছে নিন', align: 'center',
    plans: [
      { name: 'Free courses', nameBn: 'ফ্রি কোর্স', price: '৳0', period: '', periodBn: '', features: 'Sample lessons\nCommunity support', featuresBn: 'নমুনা পাঠ\nকমিউনিটি সহায়তা', highlighted: false, badge: '', badgeBn: '', buttonLabel: 'Browse free', buttonLabelBn: 'ফ্রি দেখুন', href: '/courses' },
      { name: 'Premium courses', nameBn: 'প্রিমিয়াম কোর্স', price: 'From ৳500', period: '', periodBn: '', features: 'Full curriculum\nCertificates\nDirect instructor support', featuresBn: 'সম্পূর্ণ পাঠ্যক্রম\nসার্টিফিকেট\nসরাসরি প্রশিক্ষক সহায়তা', highlighted: true, badge: 'Most popular', badgeBn: 'সবচেয়ে জনপ্রিয়', buttonLabel: 'Browse courses', buttonLabelBn: 'কোর্স দেখুন', href: '/courses' },
    ],
  }),
  b('TestimonialWall', { heading: 'Learner stories', headingBn: 'শিক্ষার্থীদের গল্প', items: [] }),
  b('AiAssistant', { display: 'floating' }),
]);

export const lmsAcademy: SiteTemplate = {
  key: 'lms-academy',
  name: 'LMS Academy',
  nameBn: 'এলএমএস একাডেমি',
  description: 'Course catalogue plus a full learner journey: enrolment, video lessons, progress and certificates-ready pages.',
  descriptionBn: 'কোর্স ক্যাটালগ ও সম্পূর্ণ শিক্ষার্থী যাত্রা: ভর্তি, ভিডিও পাঠ, অগ্রগতি ও সার্টিফিকেট-প্রস্তুত পৃষ্ঠা।',
  suits: ['coaching', 'college', 'any'],
  preview: { background: 'linear-gradient(135deg,#4338ca 0%,#0ea5e9 100%)', layout: 'courses' },
  theme: { primary: '#4338ca', accent: '#0ea5e9', font: 'inter', radius: 'lg', mode: 'light' },
  settings: { courses: { enabled: true } },
  navigation: {
    header: [STANDARD_HEADER[0], nav('Courses', 'কোর্স', '/courses'), STANDARD_HEADER[1], STANDARD_HEADER[5]],
    footer: STANDARD_FOOTER,
  },
  pages: standardPages(home),
};
