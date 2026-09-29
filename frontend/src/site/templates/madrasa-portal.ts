/** A DSHE-complete school-portal layout with a Naskh typeface and deep-green/gold palette, for madrasas and Islamic institutions. */
import { bangladeshPortalHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const madrasaPortal: SiteTemplate = {
  key: 'madrasa-portal',
  name: 'Madrasa Portal',
  nameBn: 'মাদ্রাসা পোর্টাল',
  description: 'The classic Bangla school-portal layout with an Arabic-script accent — for madrasas that also need the full DSHE portal (results, admission, notices).',
  descriptionBn: 'আরবি লিপির ছোঁয়াসহ ক্লাসিক স্কুল-পোর্টাল কাঠামো — যেসব মাদ্রাসার সম্পূর্ণ DSHE পোর্টাল (ফলাফল, ভর্তি, নোটিশ) দরকার তাদের জন্য।',
  suits: ['madrasa'],
  preview: { background: 'linear-gradient(160deg,#065f46 0%,#022c22 100%)', layout: 'arch' },
  theme: { primary: '#065f46', accent: '#d4a017', font: 'noto-naskh', radius: 'sm', mode: 'light', headerStyle: 'portal', footerStyle: 'portal', layout: 'boxed', pageBackground: 'none' },
  settings: {
    defaultLanguage: 'bn', languages: ['bn', 'en'],
    topBar: { showDate: true, showContact: true, showSocial: true },
  },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(bangladeshPortalHome(), { tone: 'soft', cardStyle: 'centered' }),
};
