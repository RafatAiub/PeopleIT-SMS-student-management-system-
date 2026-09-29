/** A clean, modern take on the Bangla school site — the sticky/blurred modern header instead of the classic portal chrome — full DSHE portal underneath. */
import { bangladeshPortalHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const modernBangla: SiteTemplate = {
  key: 'modern-bangla',
  name: 'Modern Bangla',
  nameBn: 'আধুনিক বাংলা',
  description: 'A clean, modern header and footer (not the classic portal chrome) with Bangla-first navigation and the full DSHE portal underneath.',
  descriptionBn: 'আধুনিক ও পরিচ্ছন্ন হেডার-ফুটার (ক্লাসিক পোর্টাল ক্রোম নয়), বাংলা-প্রথম নেভিগেশন এবং সম্পূর্ণ DSHE পোর্টালসহ।',
  suits: ['school', 'college', 'any'],
  preview: { background: 'linear-gradient(160deg,#1d4ed8 0%,#0f172a 100%)', layout: 'hero-center' },
  theme: { primary: '#1d4ed8', accent: '#f59e0b', font: 'inter', radius: 'md', mode: 'light', headerStyle: 'modern', footerStyle: 'modern', layout: 'full', pageBackground: 'none' },
  settings: { defaultLanguage: 'bn', languages: ['bn', 'en'] },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(bangladeshPortalHome(), { tone: 'soft', cardStyle: 'card' }),
};
