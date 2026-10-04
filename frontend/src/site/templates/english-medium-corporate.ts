/** Style B — English-medium corporate: thin navy top bar, white header with round logo, navy nav with an accent home tile and dropdowns. */
import { corporateHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const englishMediumCorporate: SiteTemplate = {
  key: 'english-medium-corporate',
  name: 'English-Medium Corporate',
  nameBn: 'ইংলিশ-মিডিয়াম কর্পোরেট',
  description: 'A polished English-medium look: navy top bar, a round logo header with search-style tagline, navy dropdown navigation and an orange accent.',
  descriptionBn: 'পরিপাটি ইংলিশ-মিডিয়াম লুক: নেভি টপবার, গোলাকার লোগো হেডার, নেভি ড্রপডাউন নেভিগেশন এবং কমলা অ্যাকসেন্ট।',
  suits: ['school', 'college'],
  preview: { background: 'linear-gradient(160deg,#0b1a3a 0%,#071230 100%)', layout: 'corporate-bars' },
  theme: { primary: '#0b1a3a', accent: '#f97316', font: 'inter', headingFont: 'poppins', radius: 'md', mode: 'light', headerStyle: 'corporate', footerStyle: 'corporate', layout: 'full', pageBackground: 'none' },
  settings: {
    defaultLanguage: 'en', languages: ['en', 'bn'],
    topBar: { showDate: false, showContact: true, showSocial: true, loginLinks: [{ label: 'Parent portal', labelBn: 'অভিভাবক পোর্টাল', href: '/account/login' }] },
  },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(corporateHome(), { tone: 'surface', cardStyle: 'plain' }),
};
