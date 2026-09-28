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
  | 'course-launch';

export type ThumbLayout = 'hero-center' | 'split' | 'playful' | 'classic' | 'arch' | 'cards' | 'bold' | 'grid' | 'minimal' | 'courses';

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
  settings?: Partial<Pick<SiteSettings, 'liteMode' | 'languages' | 'defaultLanguage' | 'shop' | 'courses'>>;
  pages: TemplatePage[];
}
