import { page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('SplitHero', {
    eyebrow: 'Modern & fast', eyebrowBn: 'আধুনিক ও দ্রুত',
    title: 'A beautiful home for {{institution.name}} online', titleBn: '{{institution.name}}-এর জন্য অনলাইনে একটি সুন্দর ঠিকানা',
    subtitle: 'Sample text: one clear sentence about what makes your institution different.', subtitleBn: 'নমুনা লেখা: আপনার প্রতিষ্ঠানকে আলাদা করে এমন একটি বাক্য।',
    badges: [{ label: 'Modern', labelBn: 'আধুনিক' }, { label: 'Mobile friendly', labelBn: 'মোবাইল বান্ধব' }],
    buttons: [{ label: 'Get started', labelBn: 'শুরু করুন', href: '/admissions', variant: 'primary' }, { label: 'See features', labelBn: 'বৈশিষ্ট্য দেখুন', href: '#features', variant: 'outline' }],
    image: '', imageAlt: '', side: 'right', gradient: true,
  }),
  b('LogoStrip', { heading: 'Trusted by families across the country', headingBn: 'দেশজুড়ে পরিবারের আস্থা', logos: [] }),
  b('FeatureGrid', {
    anchor: 'features', eyebrow: 'Features', eyebrowBn: 'বৈশিষ্ট্য', heading: 'Everything in one place', headingBn: 'সবকিছু একই জায়গায়', align: 'center',
    items: [
      { icon: 'computer', title: 'Online admissions', titleBn: 'অনলাইন ভর্তি', text: 'Sample text — apply and track status online.', textBn: 'নমুনা লেখা — অনলাইনে আবেদন ও অবস্থা দেখুন।' },
      { icon: 'shield', title: 'Secure & reliable', titleBn: 'নিরাপদ ও নির্ভরযোগ্য', text: 'Sample text — your data is protected.', textBn: 'নমুনা লেখা — আপনার তথ্য সুরক্ষিত।' },
      { icon: 'phone', title: 'Always reachable', titleBn: 'সবসময় যোগাযোগযোগ্য', text: 'Sample text — talk to us anytime.', textBn: 'নমুনা লেখা — যেকোনো সময় যোগাযোগ করুন।' },
      { icon: 'globe', title: 'Works everywhere', titleBn: 'সব জায়গায় কাজ করে', text: 'Sample text — fast on any device.', textBn: 'নমুনা লেখা — যেকোনো ডিভাইসে দ্রুত।' },
    ],
  }),
  b('BentoGrid', {
    heading: 'Highlights', headingBn: 'বিশেষত্ব',
    items: [
      { size: 'wide', icon: 'trophy', title: 'Proven results', titleBn: 'প্রমাণিত ফলাফল', text: 'Sample text — share your institution’s achievements here.', textBn: 'নমুনা লেখা — প্রতিষ্ঠানের সাফল্য এখানে তুলে ধরুন।', href: '/about' },
      { size: 'sm', icon: 'users', title: 'Caring staff', titleBn: 'যত্নশীল কর্মীবৃন্দ', text: 'Sample text.', textBn: 'নমুনা লেখা।', href: '' },
      { size: 'sm', icon: 'calendar', title: 'Flexible schedule', titleBn: 'নমনীয় সময়সূচি', text: 'Sample text.', textBn: 'নমুনা লেখা।', href: '' },
    ],
  }),
  b('ComparisonTable', {
    heading: 'Compare plans', headingBn: 'পরিকল্পনা তুলনা করুন',
    columns: [{ label: 'Standard' }, { label: 'Plus' }],
    rows: [
      { label: 'Sample feature', col1: 'yes', col2: 'yes' },
      { label: 'Sample feature', col1: 'no', col2: 'yes' },
      { label: 'Priority support', col1: 'no', col2: 'yes' },
    ],
  }),
  b('TestimonialWall', { heading: 'What people say', headingBn: 'মানুষ যা বলে', items: [] }),
  b('Newsletter', {}),
  b('GradientBanner', {}),
]);

export const saasLanding: SiteTemplate = {
  key: 'saas-landing',
  name: 'Modern Landing',
  nameBn: 'আধুনিক ল্যান্ডিং',
  description: 'A crisp, modern product-style landing page: feature grid, bento highlights, comparison table and testimonials.',
  descriptionBn: 'একটি ঝকঝকে, আধুনিক পণ্য-শৈলীর ল্যান্ডিং পেজ: বৈশিষ্ট্য গ্রিড, বেন্তো হাইলাইট, তুলনা টেবিল ও প্রশংসাপত্র।',
  suits: ['any'],
  preview: { background: 'linear-gradient(135deg,#111827 0%,#6366f1 100%)', layout: 'split' },
  theme: { primary: '#4f46e5', accent: '#22d3ee', font: 'inter', radius: 'lg', mode: 'light' },
  navigation: { header: STANDARD_HEADER, footer: STANDARD_FOOTER },
  pages: standardPages(home, { tone: 'soft', cardStyle: 'plain' }),
};
