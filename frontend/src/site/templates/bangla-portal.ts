/** Style A — classic Bangla school portal (School360-like): purple top bar, banner header, portal nav, boxed layout on a dotted background. */
import { bangladeshPortalHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const banglaPortal: SiteTemplate = {
  key: 'bangla-portal',
  name: 'Bangla School Portal',
  nameBn: 'বাংলা স্কুল পোর্টাল',
  description: 'The classic Bangladeshi government-school portal look: purple top bar, banner header, home-icon nav and a boxed page over a patterned background.',
  descriptionBn: 'প্রচলিত বাংলাদেশি সরকারি স্কুল পোর্টাল — বেগুনি টপবার, ব্যানার হেডার, হোম আইকনসহ নেভিগেশন এবং প্যাটার্ন করা পটভূমিতে বক্সড পেজ।',
  suits: ['school', 'college'],
  preview: { background: 'linear-gradient(160deg,#6d28d9 0%,#4c1d95 100%)', layout: 'portal-banner' },
  theme: { primary: '#6d28d9', accent: '#f59e0b', font: 'nunito', radius: 'sm', mode: 'light', headerStyle: 'portal', footerStyle: 'portal', layout: 'boxed', pageBackground: 'dots' },
  settings: {
    defaultLanguage: 'bn', languages: ['bn', 'en'],
    topBar: { showDate: true, showContact: true, showSocial: true, loginLinks: [{ label: 'Login', labelBn: 'লগইন', href: '/account/login' }, { label: 'Student login', labelBn: 'শিক্ষার্থী লগইন', href: '/account/login' }] },
  },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(bangladeshPortalHome(), { tone: 'soft', cardStyle: 'card' }),
};
