import type { SiteNavigation, SitePageData, SiteSeo, SiteSettings, SiteTheme } from '../types';

export type TemplateKey =
  | 'modern-campus'
  | 'classic-heritage'
  | 'kindergarten'
  | 'english-medium'
  | 'madrasa'
  | 'college'
  | 'coaching'
  | 'polytechnic'
  | 'minimal'
  | 'academy'
  | 'online-store'
  | 'lms-academy'
  | 'saas-landing'
  | 'event-landing'
  | 'course-launch'
  | 'bangla-portal'
  | 'english-medium-corporate'
  | 'portal-green'
  | 'madrasa-portal'
  | 'college-classic'
  | 'kindergarten-bright'
  | 'modern-bangla'
  | 'newspaper-style';

export type ThumbLayout =
  | 'hero-center' | 'split' | 'playful' | 'classic' | 'arch' | 'cards' | 'bold' | 'grid' | 'minimal' | 'courses'
  | 'portal-banner' | 'corporate-bars' | 'newspaper';

export interface TemplatePreview {
  /** CSS background for the gallery card (gradient; no external images). */
  background: string;
  /** Wireframe layout drawn by <TemplateThumbnail>. */
  layout: ThumbLayout;
}

export interface TemplatePage {
  /** '' = home. */
  slug: string;
  title: string;
  titleBn: string;
  seo?: SiteSeo;
  data: SitePageData;
}

export interface SiteTemplate {
  key: TemplateKey;
  name: string;
  nameBn: string;
  description: string;
  descriptionBn: string;
  /** Institution types it suits, for filtering the gallery. */
  suits: Array<'school' | 'kindergarten' | 'college' | 'madrasa' | 'coaching' | 'technical' | 'any'>;
  preview: TemplatePreview;
  theme: SiteTheme;
  navigation: SiteNavigation;
  settings?: Partial<Pick<SiteSettings, 'liteMode' | 'languages' | 'defaultLanguage' | 'shop' | 'courses' | 'topBar' | 'hotlines' | 'importantLinks' | 'eServices'>>;
  pages: TemplatePage[];
}
