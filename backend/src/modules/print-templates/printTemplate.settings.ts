import { z } from 'zod';

// =============================================================================
// P3 print template settings — stored as JSON on PrintTemplate.settings.
// `version` lets a later shape migrate old rows; parseStoredSettings() never
// throws (a corrupt row falls back to the defaults for its type).
// =============================================================================

export const PRINT_DOC_TYPES = ['INVOICE', 'RECEIPT'] as const;
export type PrintDocType = (typeof PRINT_DOC_TYPES)[number];

export const SETTINGS_VERSION = 1;

export const PAPER_SIZES = ['A4', 'A5', 'A4_2COPY', 'THERMAL_80'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const LANGUAGES = ['en', 'bn', 'bilingual'] as const;
export type PrintLanguage = (typeof LANGUAGES)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;
// Signature images are small PNG/JPEG data URLs (≈ 200 KB max once decoded).
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/;

const text = (max: number) => z.string().trim().max(max);

export const FieldsSchema = z.object({
  studentPhoto: z.boolean(),
  studentId: z.boolean(),
  roll: z.boolean(),
  classSection: z.boolean(),
  guardianName: z.boolean(),
  month: z.boolean(),
  dueDate: z.boolean(),
  items: z.boolean(),
  discounts: z.boolean(),
  previousDues: z.boolean(),
  paymentMethod: z.boolean(),
  collector: z.boolean(),
  amountInWords: z.boolean(),
  paymentHistory: z.boolean(),
  notes: z.boolean(),
});
export type TemplateFields = z.infer<typeof FieldsSchema>;

export const SignatureSchema = z.object({
  label: text(40),
  image: z.string().max(280_000).regex(IMAGE_DATA_URL, 'Signature image must be a PNG or JPEG').nullable().optional(),
});

export const TemplateSettingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  language: z.enum(LANGUAGES),
  banglaDigits: z.boolean(),
  paper: z.enum(PAPER_SIZES),
  fontSize: z.number().min(7).max(14),
  accentColor: z.string().regex(HEX, 'Use a colour like #1e3a8a'),
  /** Title override; empty = the language's default ("Invoice" / "ফি ইনভয়েস"). */
  title: text(60),
  header: z.object({
    showLogo: z.boolean(),
    showName: z.boolean(),
    /** Print the Bangla name (Institution.nameBn) under/instead of the English one. */
    showNameBn: z.boolean(),
    showAddress: z.boolean(),
    showPhone: z.boolean(),
    showEmail: z.boolean(),
    showEiin: z.boolean(),
    /** Extra free lines (registration no., slogan, "Estd. 1985"…). */
    customLines: z.array(text(120)).max(4),
  }),
  fields: FieldsSchema,
  signatures: z.array(SignatureSchema).max(3),
  footerNote: text(500),
  /** AUTO = "PAID" on fully paid documents, "DUE" otherwise. */
  watermark: z.enum(['NONE', 'AUTO']),
  copyLabels: z.object({ office: text(30), student: text(30) }),
});
export type TemplateSettings = z.infer<typeof TemplateSettingsSchema>;

const BASE_FIELDS: TemplateFields = {
  studentPhoto: false,
  studentId: true,
  roll: true,
  classSection: true,
  guardianName: false,
  month: true,
  dueDate: true,
  items: true,
  discounts: true,
  previousDues: false,
  paymentMethod: true,
  collector: true,
  amountInWords: true,
  paymentHistory: true,
  notes: true,
};

export function defaultSettings(type: PrintDocType): TemplateSettings {
  const receipt = type === 'RECEIPT';
  return {
    version: SETTINGS_VERSION,
    language: 'bilingual',
    banglaDigits: false,
    paper: receipt ? 'A5' : 'A4',
    fontSize: 10,
    accentColor: '#1e3a8a',
    title: '',
    header: {
      showLogo: true,
      showName: true,
      showNameBn: true,
      showAddress: true,
      showPhone: true,
      showEmail: false,
      showEiin: true,
      customLines: [],
    },
    fields: { ...BASE_FIELDS, paymentHistory: !receipt, previousDues: false },
    signatures: receipt
      ? [{ label: 'Received by', image: null }, { label: "Payer's signature", image: null }]
      : [{ label: 'Prepared by', image: null }, { label: 'Authorized signature', image: null }],
    footerNote: '',
    watermark: 'AUTO',
    copyLabels: { office: 'Office copy', student: 'Student copy' },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-merges a partial over the defaults (arrays replace, objects merge). */
export function mergeSettings(base: TemplateSettings, patch: unknown): Record<string, unknown> {
  const merge = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a;
    if (isObject(a) && isObject(b)) {
      const out: Record<string, unknown> = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
      return out;
    }
    return b;
  };
  return merge(base, patch) as Record<string, unknown>;
}

/** API input: a partial settings object → full validated settings (throws ZodError). */
export function buildSettings(type: PrintDocType, patch: unknown): TemplateSettings {
  const merged = mergeSettings(defaultSettings(type), patch);
  merged.version = SETTINGS_VERSION;
  return TemplateSettingsSchema.parse(merged);
}

/** Stored JSON → settings. Never throws: invalid rows fall back field-by-field, then to defaults. */
export function parseStoredSettings(type: PrintDocType, raw: unknown): TemplateSettings {
  const merged = mergeSettings(defaultSettings(type), raw);
  merged.version = SETTINGS_VERSION;
  const parsed = TemplateSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : defaultSettings(type);
}
