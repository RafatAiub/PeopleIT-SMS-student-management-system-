/**
 * The Puck config for school websites. The same config drives the editor
 * (Engineer C: `<Puck config={siteConfig} …/>`) and the public renderer
 * (`SiteRender`, which renders from this config without loading Puck).
 *
 * Only Puck *types* are imported here, so importing `siteConfig` never pulls
 * the editor runtime into the public bundle.
 */
import type { Config } from '@puckeditor/core';
import type { ReactNode } from 'react';
import { SiteRoot } from './SiteRoot';
import { Columns, Divider, Section, Spacer } from './blocks/layout';
import { ButtonGroup, CallToAction, Heading, Hero, RichText } from './blocks/text';
import { Embed, Gallery, ImageBlock, LogoStrip, MapBlock, Video } from './blocks/media';
import { Cards, ContactInfo, FAQ, PrincipalMessage, StatsCounter, Testimonials, Timeline } from './blocks/content';
import { Courses, EventsCalendar, FeePayment, LatestNews, Notices, StatsLive, TeacherDirectory, Toppers } from './blocks/live-feeds';
import { AiAssistant, ClassRoutine, EnquiryForm, ResultsLookup } from './blocks/live-forms';
import type { SiteBlock } from './blocks/shared';

export const SITE_COMPONENTS = {
  // Layout
  Section, Columns, Spacer, Divider,
  // Content
  Hero, Heading, RichText, Image: ImageBlock, Gallery, Video, ButtonGroup, Cards, StatsCounter, Testimonials, FAQ,
  LogoStrip, Map: MapBlock, Embed, CallToAction, ContactInfo, Timeline, PrincipalMessage,
  // Live school data
  // (StatsLive / EnquiryForm names match the backend AI site generator.)
  Notices, EventsCalendar, TeacherDirectory, Toppers, ResultsLookup, ClassRoutine, StatsLive, EnquiryForm,
  FeePayment, LatestNews, Courses, AiAssistant,
} satisfies Record<string, SiteBlock>;

export type SiteBlockType = keyof typeof SITE_COMPONENTS;

export interface BlockCategory {
  key: 'layout' | 'content' | 'media' | 'live';
  title: string;
  titleBn: string;
  components: SiteBlockType[];
}

/** Palette grouping for the editor (also passed to Puck as `categories`). */
export const BLOCK_CATEGORIES: BlockCategory[] = [
  { key: 'layout', title: 'Layout', titleBn: 'লেআউট', components: ['Section', 'Columns', 'Spacer', 'Divider'] },
  {
    key: 'content', title: 'Content', titleBn: 'কনটেন্ট',
    components: ['Hero', 'Heading', 'RichText', 'ButtonGroup', 'Cards', 'StatsCounter', 'Testimonials', 'FAQ', 'CallToAction', 'ContactInfo', 'Timeline', 'PrincipalMessage'],
  },
  { key: 'media', title: 'Media', titleBn: 'মিডিয়া', components: ['Image', 'Gallery', 'Video', 'LogoStrip', 'Map', 'Embed'] },
  {
    key: 'live', title: 'Live school data', titleBn: 'লাইভ তথ্য',
    components: ['Notices', 'EventsCalendar', 'TeacherDirectory', 'Toppers', 'ResultsLookup', 'ClassRoutine', 'StatsLive', 'EnquiryForm', 'FeePayment', 'LatestNews', 'Courses', 'AiAssistant'],
  },
];

/** Blocks that fetch live data (the editor may badge them). */
export const LIVE_BLOCKS = new Set<string>(BLOCK_CATEGORIES.find((c) => c.key === 'live')!.components);

function RootRender({ children }: { children?: ReactNode }) {
  // Inside the public renderer this collapses into the outer SiteRoot; in the
  // editor it creates the themed `.site-root` scope inside Puck's preview.
  return <SiteRoot className="min-h-full">{children}</SiteRoot>;
}

export const siteConfig: Config = {
  categories: Object.fromEntries(BLOCK_CATEGORIES.map((c) => [c.key, { title: c.title, components: c.components, defaultExpanded: true }])),
  components: SITE_COMPONENTS,
  root: {
    fields: {},
    render: RootRender as NonNullable<Config['root']>['render'],
  },
};

/** An empty page document. */
export function emptyPageData(title = '') {
  return { root: { props: { title } }, content: [], zones: {} };
}
