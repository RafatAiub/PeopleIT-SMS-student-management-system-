/** A playful, brightly-coloured kindergarten look (centred header, rounded corners) with the full DSHE portal underneath. */
import { bangladeshPortalHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const kindergartenBright: SiteTemplate = {
  key: 'kindergarten-bright',
  name: 'Kindergarten Bright',
  nameBn: 'কিন্ডারগার্টেন উজ্জ্বল',
  description: 'Playful, rounded and colourful — a centred header, pink and yellow accents, friendly type — over the full DSHE portal.',
  descriptionBn: 'খেলাধুলাপূর্ণ, গোলাকার ও রঙিন — কেন্দ্রীভূত হেডার, গোলাপি ও হলুদ রঙ, বন্ধুত্বপূর্ণ ফন্ট — সম্পূর্ণ DSHE পোর্টালসহ।',
  suits: ['kindergarten'],
  preview: { background: 'linear-gradient(160deg,#f472b6 0%,#facc15 100%)', layout: 'playful' },
  theme: { primary: '#be185d', accent: '#facc15', font: 'nunito', radius: 'xl', mode: 'light', headerStyle: 'centered', footerStyle: 'minimal', layout: 'boxed', pageBackground: 'waves' },
  settings: { defaultLanguage: 'bn', languages: ['bn', 'en'] },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(bangladeshPortalHome(), { tone: 'soft', cardStyle: 'centered' }),
};
