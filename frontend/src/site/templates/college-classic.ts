/** A heritage-serif college look (banner header, columns footer) with the full DSHE portal underneath. */
import { bangladeshPortalHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const collegeClassic: SiteTemplate = {
  key: 'college-classic',
  name: 'College Classic',
  nameBn: 'কলেজ ক্লাসিক',
  description: 'A serif, heritage feel for colleges — a wide banner header, four-column footer, deep maroon and gold — over the full DSHE portal.',
  descriptionBn: 'কলেজের জন্য সেরিফ ও ঐতিহ্যবাহী অনুভূতি — প্রশস্ত ব্যানার হেডার, চার-কলাম ফুটার, গাঢ় মেরুন ও সোনালি রঙ — সম্পূর্ণ DSHE পোর্টালসহ।',
  suits: ['college'],
  preview: { background: 'linear-gradient(160deg,#7f1d1d 0%,#450a0a 100%)', layout: 'classic' },
  theme: { primary: '#7f1d1d', accent: '#ca8a04', font: 'lora', headingFont: 'playfair', radius: 'sm', mode: 'light', headerStyle: 'banner', footerStyle: 'columns', layout: 'full', pageBackground: 'none' },
  settings: { defaultLanguage: 'bn', languages: ['bn', 'en'] },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(bangladeshPortalHome(), { tone: 'surface', cardStyle: 'plain' }),
};
