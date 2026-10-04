import { nav, page, pageBuilder, standardPages, STANDARD_FOOTER, STANDARD_HEADER } from './builders';
import type { SiteTemplate } from './types';

const b = pageBuilder('home');
const home = page('', 'Home', 'হোম', [
  b('SplitHero', {
    eyebrow: 'Official school store', eyebrowBn: 'অফিসিয়াল স্কুল স্টোর',
    title: 'Uniforms, books and more — delivered', titleBn: 'ইউনিফর্ম, বই ও আরও অনেক কিছু — ঘরে বসে',
    subtitle: 'Sample text: shop everything your child needs for {{institution.name}}, from uniforms to textbooks.', subtitleBn: 'নমুনা লেখা: {{institution.name}}-এর জন্য প্রয়োজনীয় সবকিছু — ইউনিফর্ম থেকে বই — কিনুন।',
    badges: [{ label: 'Cash on delivery', labelBn: 'ক্যাশ অন ডেলিভারি' }, { label: 'Genuine products', labelBn: 'আসল পণ্য' }],
    buttons: [{ label: 'Shop now', labelBn: 'এখনই কিনুন', href: '/shop', variant: 'primary' }, { label: 'Track an order', labelBn: 'অর্ডার ট্র্যাক করুন', href: '/order', variant: 'outline' }],
    image: '', imageAlt: '', side: 'right', gradient: true,
  }),
  b('ProductGrid', { eyebrow: 'Shop', eyebrowBn: 'দোকান', heading: 'Popular items', headingBn: 'জনপ্রিয় পণ্য', limit: 8, columns: '4', showAddToCart: true }),
  b('FeatureGrid', {
    heading: 'Why shop with us', headingBn: 'কেন আমাদের কাছ থেকে কিনবেন', align: 'center',
    items: [
      { icon: 'shield', title: 'Genuine products', titleBn: 'আসল পণ্য', text: 'Sample text — every item is sourced and checked by the school.', textBn: 'নমুনা লেখা — প্রতিটি পণ্য প্রতিষ্ঠান কর্তৃক যাচাইকৃত।' },
      { icon: 'wrench', title: 'Cash on delivery', titleBn: 'ক্যাশ অন ডেলিভারি', text: 'Sample text — pay when your order arrives.', textBn: 'নমুনা লেখা — অর্ডার হাতে পেয়ে টাকা দিন।' },
      { icon: 'phone', title: 'Easy support', titleBn: 'সহজ সহায়তা', text: 'Sample text — questions about sizing or delivery? We are here.', textBn: 'নমুনা লেখা — সাইজ বা ডেলিভারি নিয়ে প্রশ্ন থাকলে যোগাযোগ করুন।' },
    ],
  }),
  b('TestimonialWall', { heading: 'What parents say', headingBn: 'অভিভাবকদের মতামত', items: [] }),
  b('Newsletter', {}),
  b('GradientBanner', { title: 'New session uniforms are here', titleBn: 'নতুন শিক্ষাবর্ষের ইউনিফর্ম এসেছে', text: 'Sample text — order early to avoid delays.', textBn: 'নমুনা লেখা — দেরি এড়াতে আগেই অর্ডার করুন।', buttons: [{ label: 'Shop now', labelBn: 'এখনই কিনুন', href: '/shop' }] }),
]);

export const onlineStore: SiteTemplate = {
  key: 'online-store',
  name: 'Online Store',
  nameBn: 'অনলাইন স্টোর',
  description: 'A shop-first storefront for uniforms, books and supplies, with cart, checkout and order tracking built in.',
  descriptionBn: 'ইউনিফর্ম, বই ও সরঞ্জামের জন্য দোকান-কেন্দ্রিক স্টোরফ্রন্ট — কার্ট, চেকআউট ও অর্ডার ট্র্যাকিং সহ।',
  suits: ['school', 'college', 'any'],
  preview: { background: 'linear-gradient(135deg,#0f766e 0%,#f59e0b 100%)', layout: 'grid' },
  theme: { primary: '#0f766e', accent: '#f59e0b', font: 'poppins', radius: 'lg', mode: 'light' },
  settings: { shop: { enabled: true, currency: 'BDT', shippingFee: 60, freeShippingOver: 2000, codEnabled: true, notifyEmails: [] } },
  navigation: {
    header: [STANDARD_HEADER[0], nav('Shop', 'দোকান', '/shop'), STANDARD_HEADER[1], STANDARD_HEADER[2], STANDARD_HEADER[5]],
    footer: [...STANDARD_FOOTER, nav('Track order', 'অর্ডার ট্র্যাক', '/order')],
  },
  pages: standardPages(home, { tone: 'soft', cardStyle: 'card' }),
};
