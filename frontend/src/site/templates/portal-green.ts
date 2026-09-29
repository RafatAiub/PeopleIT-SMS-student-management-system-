/** A green/gold variant of the classic Bangla school portal (Style A), for schools that prefer green branding. */
import { bangladeshPortalHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const portalGreen: SiteTemplate = {
  key: 'portal-green',
  name: 'Green School Portal',
  nameBn: 'সবুজ স্কুল পোর্টাল',
  description: 'The classic Bangla school-portal layout in a deep-green and gold palette.',
  descriptionBn: 'ক্লাসিক বাংলা স্কুল-পোর্টাল কাঠামো, গাঢ় সবুজ ও সোনালি রঙে।',
  suits: ['school', 'college'],
  preview: { background: 'linear-gradient(160deg,#166534 0%,#052e16 100%)', layout: 'portal-banner' },
  theme: { primary: '#166534', accent: '#f59e0b', font: 'nunito', radius: 'sm', mode: 'light', headerStyle: 'portal', footerStyle: 'portal', layout: 'boxed', pageBackground: 'dots' },
  settings: {
    defaultLanguage: 'bn', languages: ['bn', 'en'],
    topBar: { showDate: true, showContact: true, showSocial: true, loginLinks: [{ label: 'Login', labelBn: 'লগইন', href: '/account/login' }] },
  },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(bangladeshPortalHome(), { tone: 'soft', cardStyle: 'card' }),
};
