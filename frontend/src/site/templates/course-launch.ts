import { page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('SplitHero', {
    eyebrow: 'New course', eyebrowBn: 'নতুন কোর্স',
    title: 'Master a new skill — sample course title', titleBn: 'নতুন দক্ষতা অর্জন করুন — নমুনা কোর্সের শিরোনাম',
    subtitle: 'Sample text: describe the transformation this course gives learners, in one confident sentence.', subtitleBn: 'নমুনা লেখা: এই কোর্স শিক্ষার্থীদের কী পরিবর্তন দেবে তা এক আত্মবিশ্বাসী বাক্যে লিখুন।',
    badges: [{ label: 'Certificate', labelBn: 'সার্টিফিকেট' }, { label: 'Lifetime access', labelBn: 'আজীবন অ্যাক্সেস' }],
    buttons: [{ label: 'Enrol now', labelBn: 'এখনই ভর্তি হোন', href: '/courses', variant: 'primary' }, { label: 'See curriculum', labelBn: 'পাঠ্যক্রম দেখুন', href: '#curriculum', variant: 'outline' }],
    image: '', imageAlt: '', side: 'right', gradient: true,
  }),
  b('Countdown', { heading: 'Early-bird price ends in', headingBn: 'আরলি-বার্ড মূল্য শেষ হবে', targetDate: '', expiredText: 'The early-bird offer has ended — regular price now applies.', expiredTextBn: 'আরলি-বার্ড অফার শেষ — এখন নিয়মিত মূল্য প্রযোজ্য।', tone: 'dark' }),
  b('FeaturedCourse', { anchor: 'curriculum', slug: '' }),
  b('Steps', {
    heading: 'What you will learn', headingBn: 'আপনি যা শিখবেন', align: 'center',
    items: [
      { icon: 'book', title: 'Foundations', titleBn: 'ভিত্তি', text: 'Sample text — the basics covered in module one.', textBn: 'নমুনা লেখা — প্রথম মডিউলের মূল বিষয়।' },
      { icon: 'wrench', title: 'Hands-on practice', titleBn: 'হাতে-কলমে অনুশীলন', text: 'Sample text — practical exercises and projects.', textBn: 'নমুনা লেখা — ব্যবহারিক অনুশীলন ও প্রকল্প।' },
      { icon: 'trophy', title: 'Certification', titleBn: 'সনদপত্র', text: 'Sample text — finish and earn your certificate.', textBn: 'নমুনা লেখা — শেষ করে সনদপত্র অর্জন করুন।' },
    ],
  }),
  b('PricingTable', {
    heading: 'Enrol today', headingBn: 'আজই ভর্তি হোন', align: 'center',
    plans: [{ name: 'This course', nameBn: 'এই কোর্স', price: '৳1,500', period: 'one-time', periodBn: 'একবার', features: 'Full video lessons\nDownloadable resources\nCertificate on completion', featuresBn: 'সম্পূর্ণ ভিডিও পাঠ\nডাউনলোডযোগ্য উপকরণ\nসমাপনী সনদপত্র', highlighted: true, badge: 'Early bird', badgeBn: 'আরলি-বার্ড', buttonLabel: 'Enrol now', buttonLabelBn: 'এখনই ভর্তি হোন', href: '/courses' }],
  }),
  b('TestimonialWall', { heading: 'What learners say', headingBn: 'শিক্ষার্থীদের মতামত', items: [] }),
  b('FAQ'),
  b('GradientBanner', { title: 'Seats are limited', titleBn: 'আসন সীমিত', buttons: [{ label: 'Enrol now', labelBn: 'এখনই ভর্তি হোন', href: '/courses' }] }),
]);

export const courseLaunch: SiteTemplate = {
  key: 'course-launch',
  name: 'Course Launch',
  nameBn: 'কোর্স লঞ্চ',
  description: 'A single-course sales page: countdown, curriculum, pricing and testimonials, built to convert.',
  descriptionBn: 'একক-কোর্স বিক্রয় পাতা: কাউন্টডাউন, পাঠ্যক্রম, মূল্য ও প্রশংসাপত্র সহ, রূপান্তরের জন্য তৈরি।',
  suits: ['coaching', 'any'],
  preview: { background: 'linear-gradient(135deg,#7c2d12 0%,#d97706 100%)', layout: 'split' },
  theme: { primary: '#b45309', accent: '#0891b2', font: 'poppins', radius: 'md', mode: 'light' },
  settings: { courses: { enabled: true } },
  navigation: { header: STANDARD_HEADER, footer: STANDARD_FOOTER },
  pages: standardPages(home, { tone: 'soft' }),
};
