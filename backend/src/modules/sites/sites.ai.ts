// =============================================================================
// AI site generator. Asks the model (Claude → Gemini via runAi) only for
// COPY, as JSON, grounded in the institution's real data; the Puck page
// structure is then built deterministically here, so a model can never emit
// broken page data. With no AI key the copy comes from a template built from
// the same data (demo: true). Nothing is saved: the pages come back as drafts
// the admin reviews and applies through POST /me/apply-template.
// =============================================================================

import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { runAi, GROUNDING_RULES, type AiCallContext } from '../ai/ai.client';
import { normalizePuckData, readGates, sanitizeText, type PuckData } from './sites.logic';
import { getOrCreateSite } from './sites.service';
import type { GenerateSiteDtoType } from './sites.dto';

type Lang = 'en' | 'bn';

export interface SiteCopy {
  tagline: string;
  heroSubtitle: string;
  about: string;
  admissions: string;
  academics: string;
  contactIntro: string;
  ctaTitle: string;
}

const COPY_KEYS: (keyof SiteCopy)[] = ['tagline', 'heroSubtitle', 'about', 'admissions', 'academics', 'contactIntro', 'ctaTitle'];

interface Facts {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  aboutText: string | null;
  students: number;
  teachers: number;
  classes: string[];
  establishedYear: number | null;
}

async function gatherFacts(institutionId: string, settings: unknown): Promise<Facts> {
  const [inst, students, teachers, classes] = await Promise.all([
    prisma.institution.findUniqueOrThrow({
      where: { id: institutionId },
      select: { name: true, address: true, contactEmail: true, email: true, contactPhone: true, phone: true, aboutText: true },
    }),
    prisma.student.count({ where: { institutionId, status: 'ACTIVE' } }),
    prisma.user.count({ where: { institutionId, role: 'TEACHER', isActive: true } }),
    prisma.class.findMany({ where: { branch: { institutionId } }, select: { name: true }, orderBy: { level: 'asc' }, take: 20 }),
  ]);
  return {
    name: inst.name,
    address: inst.address,
    email: inst.contactEmail ?? inst.email,
    phone: inst.contactPhone ?? inst.phone,
    aboutText: inst.aboutText,
    students,
    teachers,
    classes: [...new Set(classes.map((c) => c.name))],
    establishedYear: readGates(settings).establishedYear,
  };
}

/** Deterministic copy from the facts — used in demo mode and as the fallback. */
export function templateCopy(f: Facts, lang: Lang): SiteCopy {
  const classRange = f.classes.length ? `${f.classes[0]} to ${f.classes[f.classes.length - 1]}` : null;
  if (lang === 'bn') {
    return {
      tagline: `${f.name}-এ স্বাগতম`,
      heroSubtitle: 'শেখা, বেড়ে ওঠা এবং ভবিষ্যৎ গড়ার জন্য একটি যত্নশীল পরিবেশ।',
      about: f.aboutText ?? `${f.name} শিক্ষার্থীদের মানসম্মত শিক্ষা ও সুন্দর ভবিষ্যৎ গড়তে প্রতিশ্রুতিবদ্ধ।`,
      admissions: 'ভর্তি সংক্রান্ত তথ্যের জন্য নিচের ফর্মটি পূরণ করুন, আমরা শীঘ্রই যোগাযোগ করব।',
      academics: classRange ? `আমরা ${classRange} পর্যন্ত পাঠদান করি।` : 'আমাদের শিক্ষা কার্যক্রম সম্পর্কে জানুন।',
      contactIntro: 'যেকোনো প্রশ্নে আমাদের সাথে যোগাযোগ করুন।',
      ctaTitle: 'ভর্তি চলছে — আজই যোগাযোগ করুন',
    };
  }
  return {
    tagline: `Welcome to ${f.name}`,
    heroSubtitle: 'A caring place to learn, grow and prepare for the future.',
    about:
      f.aboutText ??
      `${f.name} is committed to quality education${f.establishedYear ? `, serving students since ${f.establishedYear}` : ''}.`,
    admissions: 'Interested in joining us? Fill in the enquiry form below and our admissions team will contact you.',
    academics: classRange ? `We teach classes from ${classRange}.` : 'Learn about our academic programmes.',
    contactIntro: 'Have a question? Get in touch with us.',
    ctaTitle: 'Admissions are open — contact us today',
  };
}

/** Parses the model's JSON; returns null (→ template) if anything is off. */
export function parseCopy(text: string): SiteCopy | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const out = {} as SiteCopy;
    for (const k of COPY_KEYS) {
      const v = obj[k];
      if (typeof v !== 'string' || !v.trim()) return null;
      out[k] = sanitizeText(v, k === 'about' ? 1500 : 500);
    }
    return out;
  } catch {
    return null;
  }
}

const bid = (type: string) => `${type}-${crypto.randomBytes(4).toString('hex')}`;
const block = (type: string, props: Record<string, unknown>) => ({ type, props: { id: bid(type), ...props } });

/** Builds Puck pages from copy. Bangla twins go in *Bn props. */
export function buildPages(f: Facts, en: SiteCopy, bn: SiteCopy | null) {
  const t = (k: keyof SiteCopy) => ({ en: en[k], bn: bn?.[k] ?? null });
  const page = (content: ReturnType<typeof block>[]): PuckData => normalizePuckData({ root: { props: {} }, content });
  const contact = block('ContactInfo', { address: f.address ?? '', email: f.email ?? '', phone: f.phone ?? '' });

  return [
    {
      slug: '',
      title: 'Home',
      titleBn: 'হোম',
      data: page([
        block('Hero', { title: t('tagline').en, titleBn: t('tagline').bn, subtitle: t('heroSubtitle').en, subtitleBn: t('heroSubtitle').bn, ctaLabel: 'Admissions', ctaLabelBn: 'ভর্তি', ctaHref: '/admissions' }),
        block('StatsLive', {}),
        block('RichText', { text: t('about').en, textBn: t('about').bn }),
        block('Notices', { limit: 5 }),
        block('CallToAction', { title: t('ctaTitle').en, titleBn: t('ctaTitle').bn, buttonLabel: 'Contact us', buttonLabelBn: 'যোগাযোগ', buttonHref: '/contact' }),
      ]),
    },
    {
      slug: 'about',
      title: 'About',
      titleBn: 'আমাদের সম্পর্কে',
      data: page([block('Heading', { text: 'About us', textBn: 'আমাদের সম্পর্কে' }), block('RichText', { text: t('about').en, textBn: t('about').bn }), block('TeacherDirectory', {})]),
    },
    {
      slug: 'admissions',
      title: 'Admissions',
      titleBn: 'ভর্তি',
      data: page([block('Heading', { text: 'Admissions', textBn: 'ভর্তি' }), block('RichText', { text: t('admissions').en, textBn: t('admissions').bn }), block('EnquiryForm', {})]),
    },
    {
      slug: 'academics',
      title: 'Academics',
      titleBn: 'শিক্ষা কার্যক্রম',
      data: page([block('Heading', { text: 'Academics', textBn: 'শিক্ষা কার্যক্রম' }), block('RichText', { text: t('academics').en, textBn: t('academics').bn }), block('ClassRoutine', {})]),
    },
    {
      slug: 'notices',
      title: 'Notices',
      titleBn: 'নোটিশ',
      data: page([block('Heading', { text: 'Notices & events', textBn: 'নোটিশ ও ইভেন্ট' }), block('Notices', { limit: 20 }), block('EventsCalendar', {})]),
    },
    {
      slug: 'contact',
      title: 'Contact',
      titleBn: 'যোগাযোগ',
      data: page([block('Heading', { text: 'Contact', textBn: 'যোগাযোগ' }), block('RichText', { text: t('contactIntro').en, textBn: t('contactIntro').bn }), contact]),
    },
  ];
}

const TONE_TEXT: Record<string, string> = {
  formal: 'formal and dignified',
  friendly: 'warm and friendly',
  inspiring: 'inspiring and aspirational',
  modern: 'modern and concise',
};

function prompt(f: Facts, lang: Lang) {
  return [
    `School name: ${f.name}`,
    f.address ? `Address: ${f.address}` : null,
    f.establishedYear ? `Established: ${f.establishedYear}` : null,
    `Active students: ${f.students}`,
    `Teachers: ${f.teachers}`,
    f.classes.length ? `Classes: ${f.classes.join(', ')}` : null,
    f.aboutText ? `The school's own description: ${f.aboutText}` : null,
    '',
    `Write the copy in ${lang === 'bn' ? 'Bangla (Bengali script)' : 'English'}.`,
    `Return ONLY a JSON object with these string keys: ${COPY_KEYS.join(', ')}.`,
    'tagline ≤ 8 words; heroSubtitle ≤ 20 words; about 60–120 words; admissions, academics, contactIntro 20–50 words each; ctaTitle ≤ 10 words.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export async function generateSite(ctx: AiCallContext, data: GenerateSiteDtoType) {
  const site = await getOrCreateSite(ctx.institutionId);
  const facts = await gatherFacts(ctx.institutionId, site.settings);
  const languages: Lang[] = data.languages?.length ? data.languages : ['en', 'bn'];
  const tone = TONE_TEXT[data.tone ?? 'friendly'];

  const system =
    `You write website copy for a school in Bangladesh. Use a ${tone} tone. ` +
    'This is sample copy the school will review and edit before publishing. ' +
    `${GROUNDING_RULES} Output strict JSON only, no Markdown fences.`;

  const copies: Partial<Record<Lang, SiteCopy>> = {};
  let demo = false;
  let aiError: string | undefined;
  let model: string | null = null;

  for (const lang of languages) {
    const fallback = templateCopy(facts, lang);
    const ai = await runAi(ctx, {
      feature: 'site_generator',
      system,
      prompt: prompt(facts, lang),
      demoText: JSON.stringify(fallback),
      maxTokens: 1200,
      postProcess: (text) => (parseCopy(text) ? text : ''),
    });
    copies[lang] = parseCopy(ai.text) ?? fallback;
    if (ai.demo) demo = true;
    if (ai.aiError) aiError = ai.aiError;
    model = model ?? ai.model;
  }

  const en = copies.en ?? templateCopy(facts, 'en');
  const bn = languages.includes('bn') ? (copies.bn ?? templateCopy(facts, 'bn')) : null;
  return {
    pages: buildPages(facts, en, bn),
    templateKey: site.templateKey ?? 'modern-campus',
    demo,
    model,
    ...(aiError ? { aiError } : {}),
    notice: 'AI-generated draft. Review and edit every page before publishing.',
  };
}
