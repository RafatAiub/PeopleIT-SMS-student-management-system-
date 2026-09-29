/** A dense, editorial "newspaper" look — banner masthead, serif type, columns footer — over the full DSHE portal (heavy on notices/news). */
import { bangladeshPortalHome, PORTAL_FOOTER, PORTAL_HEADER_NAV, portalPages } from './portal-builders';
import type { SiteTemplate } from './types';

export const newspaperStyle: SiteTemplate = {
  key: 'newspaper-style',
  name: 'Newspaper Style',
  nameBn: 'সংবাদপত্র শৈলী',
  description: 'A dense, editorial masthead look with serif type and a scrolling news ticker — for schools that publish news and notices often.',
  descriptionBn: 'সেরিফ ফন্ট ও স্ক্রলিং নিউজ টিকারসহ ঘন সম্পাদকীয় মাস্টহেড শৈলী — যেসব প্রতিষ্ঠান নিয়মিত খবর ও নোটিশ প্রকাশ করে তাদের জন্য।',
  suits: ['school', 'college', 'any'],
  preview: { background: 'linear-gradient(160deg,#111827 0%,#000 100%)', layout: 'newspaper' },
  theme: { primary: '#111827', accent: '#b91c1c', font: 'merriweather', headingFont: 'playfair', radius: 'none', mode: 'light', headerStyle: 'banner', footerStyle: 'columns', layout: 'boxed', pageBackground: 'grid' },
  settings: { defaultLanguage: 'bn', languages: ['bn', 'en'] },
  navigation: { header: PORTAL_HEADER_NAV, footer: PORTAL_FOOTER },
  pages: portalPages(bangladeshPortalHome(), { tone: 'default', cardStyle: 'plain' }),
};
