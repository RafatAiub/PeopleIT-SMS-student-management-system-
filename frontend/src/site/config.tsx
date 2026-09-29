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
import {
  AnnouncementBar, BentoGrid, ComparisonTable, Countdown, FeatureGrid, GradientBanner, Marquee, Newsletter, PricingTable,
  SplitHero, Steps, Tabs, Team, TestimonialWall,
} from './blocks/design';
import { AccountButton, CartButton, FeaturedCourse, FeaturedProduct, CourseGrid, ProductGrid } from './blocks/commerce';
import { CustomCode } from './blocks/code';
import {
  AdmissionCirculars, AlbumGrid, Branches, ClassStats, CommitteeList, DataList, DownloadsList, ExamRoutine, FeeChart,
  HolidayList, LibraryCatalogue, NewsTicker, NoticeBoard, ProfileFacts, ResultSummary, StaffDirectory, TransportRoutes,
} from './blocks/portal-data';
import {
  AudioPlayer, DataTable, EServices, FacebookPage, HeadMessage, HotlineList, ImageSlider, ImportantLinks, InfoBoxGrid,
  SidebarCard, SidebarLayout, VideoGallery,
} from './blocks/portal-static';
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
  // Design (landing pages)
  FeatureGrid, PricingTable, Steps, Team, BentoGrid, Countdown, Newsletter, Tabs, Marquee, ComparisonTable,
  SplitHero, GradientBanner, TestimonialWall, AnnouncementBar,
  // Commerce (shop + courses/LMS)
  ProductGrid, FeaturedProduct, CartButton, CourseGrid, FeaturedCourse, AccountButton,
  // Custom code
  CustomCode,
  // Portal / DSHE data (Bangladeshi school-portal templates)
  DataList, NoticeBoard, NewsTicker, StaffDirectory, CommitteeList, DownloadsList, AlbumGrid, AdmissionCirculars,
  ResultSummary, ExamRoutine, ClassStats, FeeChart, HolidayList, LibraryCatalogue, TransportRoutes, Branches, ProfileFacts,
  InfoBoxGrid, SidebarLayout, SidebarCard, HeadMessage, HotlineList, FacebookPage, VideoGallery, AudioPlayer, ImageSlider,
  ImportantLinks, EServices, DataTable,
} satisfies Record<string, SiteBlock>;

export type SiteBlockType = keyof typeof SITE_COMPONENTS;

export interface BlockCategory {
  key: 'layout' | 'content' | 'media' | 'live' | 'design' | 'commerce' | 'code' | 'portal';
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
  {
    key: 'design', title: 'Design (landing pages)', titleBn: 'ডিজাইন (ল্যান্ডিং পেজ)',
    components: ['FeatureGrid', 'PricingTable', 'Steps', 'Team', 'BentoGrid', 'Countdown', 'Newsletter', 'Tabs', 'Marquee', 'ComparisonTable', 'SplitHero', 'GradientBanner', 'TestimonialWall', 'AnnouncementBar'],
  },
  {
    key: 'commerce', title: 'Shop & courses', titleBn: 'দোকান ও কোর্স',
    components: ['ProductGrid', 'FeaturedProduct', 'CartButton', 'CourseGrid', 'FeaturedCourse', 'AccountButton'],
  },
  { key: 'code', title: 'Custom code', titleBn: 'কাস্টম কোড', components: ['CustomCode'] },
  {
    key: 'portal', title: 'Portal & DSHE data', titleBn: 'পোর্টাল ও তথ্য',
    components: [
      'DataList', 'NoticeBoard', 'NewsTicker', 'StaffDirectory', 'CommitteeList', 'DownloadsList', 'AlbumGrid',
      'AdmissionCirculars', 'ResultSummary', 'ExamRoutine', 'ClassStats', 'FeeChart', 'HolidayList', 'LibraryCatalogue',
      'TransportRoutes', 'Branches', 'ProfileFacts', 'InfoBoxGrid', 'SidebarLayout', 'SidebarCard', 'HeadMessage',
      'HotlineList', 'FacebookPage', 'VideoGallery', 'AudioPlayer', 'ImageSlider', 'ImportantLinks', 'EServices', 'DataTable',
    ],
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
