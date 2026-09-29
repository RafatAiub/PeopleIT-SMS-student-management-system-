/**
 * The site templates (the original ten, plus eight Bangladeshi DSHE-complete
 * portal templates — see `portal-builders.ts`), plus helpers for the Design
 * tab (Engineer C):
 *
 *   const t = getTemplate('modern-campus');
 *   await apiClient.post('/sites/me/apply-template', templateApplyPayload(t, 'replace'));
 *   await apiClient.put('/sites/me', { templateKey: t.key, theme: t.theme, navigation: t.navigation });
 *
 * Page copy keeps its `{{institution.*}}` tokens; the renderer fills them
 * from real data at render time (`fillTemplateTokens` is available if a
 * caller wants a filled snapshot instead).
 */
import { fillTokensDeep, type TokenMap } from '../tokens';
import { academy } from './academy';
import { banglaPortal } from './bangla-portal';
import { classicHeritage } from './classic-heritage';
import { coaching } from './coaching';
import { college } from './college';
import { collegeClassic } from './college-classic';
import { courseLaunch } from './course-launch';
import { englishMedium } from './english-medium';
import { englishMediumCorporate } from './english-medium-corporate';
import { eventLanding } from './event-landing';
import { kindergarten } from './kindergarten';
import { kindergartenBright } from './kindergarten-bright';
import { lmsAcademy } from './lms-academy';
import { madrasa } from './madrasa';
import { madrasaPortal } from './madrasa-portal';
import { minimal } from './minimal';
import { modernBangla } from './modern-bangla';
import { modernCampus } from './modern-campus';
import { newspaperStyle } from './newspaper-style';
import { onlineStore } from './online-store';
import { polytechnic } from './polytechnic';
import { portalGreen } from './portal-green';
import { saasLanding } from './saas-landing';
import type { SiteTemplate, TemplateKey, TemplatePage } from './types';

export type { SiteTemplate, TemplateKey, TemplatePage, TemplatePreview, ThumbLayout } from './types';
export { TemplateThumbnail } from './Thumbnail';

export const SITE_TEMPLATES: readonly SiteTemplate[] = [
  modernCampus,
  classicHeritage,
  kindergarten,
  englishMedium,
  madrasa,
  college,
  coaching,
  polytechnic,
  minimal,
  academy,
  onlineStore,
  lmsAcademy,
  saasLanding,
  eventLanding,
  courseLaunch,
  banglaPortal,
  englishMediumCorporate,
  portalGreen,
  madrasaPortal,
  collegeClassic,
  kindergartenBright,
  modernBangla,
  newspaperStyle,
];

export const TEMPLATE_KEYS = SITE_TEMPLATES.map((t) => t.key) as TemplateKey[];

export function getTemplate(key: string | null | undefined): SiteTemplate | undefined {
  return SITE_TEMPLATES.find((t) => t.key === key);
}

/** Body for `POST /sites/me/apply-template`. */
export function templateApplyPayload(t: SiteTemplate, mode: 'replace' | 'merge') {
  return {
    templateKey: t.key,
    mode,
    pages: t.pages.map((p) => ({ slug: p.slug, title: p.title, titleBn: p.titleBn, seo: p.seo, data: p.data })),
  };
}

/** A copy of the template's pages with every token filled from `tokens`. */
export function fillTemplateTokens(pages: TemplatePage[], tokens: TokenMap): TemplatePage[] {
  return fillTokensDeep(pages, tokens, { skipKeys: ['id', 'type', 'slug', 'href'] });
}
