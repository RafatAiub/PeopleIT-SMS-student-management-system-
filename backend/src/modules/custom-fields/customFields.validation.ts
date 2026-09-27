// =============================================================================
// Custom field value validation — pure, no I/O. Used by the students module
// to validate Student.customFields against the tenant's definitions, and
// unit-tested in tests/custom-fields-validation.test.ts.
// =============================================================================

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomFieldDef {
  key: string;
  label: string;
  type: string;
  options?: unknown;
  required: boolean;
}

export type CustomFieldValue = string | number | null;
export type CustomFieldValues = Record<string, CustomFieldValue>;

export interface CustomFieldIssue {
  field: string;
  message: string;
}

const MAX_TEXT = 1000;

/** Select options are stored as a JSON array of strings. Anything else reads as "no options". */
export function optionsOf(def: Pick<CustomFieldDef, 'options'>): string[] {
  return Array.isArray(def.options) ? def.options.filter((o): o is string => typeof o === 'string') : [];
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function coerce(def: CustomFieldDef, raw: unknown): { value?: CustomFieldValue; error?: string } {
  if (isBlank(raw)) return { value: null };

  switch (def.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
      if (!Number.isFinite(n)) return { error: `${def.label} must be a number` };
      return { value: n };
    }
    case 'date': {
      if (typeof raw !== 'string') return { error: `${def.label} must be a date` };
      const s = raw.trim();
      // Stored as a plain calendar date (YYYY-MM-DD) — no timezone drift.
      const iso = /^\d{4}-\d{2}-\d{2}/.exec(s)?.[0];
      if (!iso || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) return { error: `${def.label} must be a valid date` };
      return { value: iso };
    }
    case 'select': {
      const s = String(raw).trim();
      const options = optionsOf(def);
      if (!options.includes(s)) return { error: `${def.label} must be one of: ${options.join(', ')}` };
      return { value: s };
    }
    case 'text':
    default: {
      if (typeof raw !== 'string' && typeof raw !== 'number') return { error: `${def.label} must be text` };
      const s = String(raw).trim();
      if (s.length > MAX_TEXT) return { error: `${def.label} must be at most ${MAX_TEXT} characters` };
      return { value: s };
    }
  }
}

/**
 * Validates and normalises submitted values.
 *   - Unknown keys (no definition — e.g. a field that was since deleted) are
 *     dropped, never stored.
 *   - `existing` is merged underneath the submission (an update may send only
 *     the fields it changes).
 *   - `enforceRequired` checks required fields on the merged result.
 * Returns the normalised object to persist, or the list of issues.
 */
export function validateCustomFieldValues(
  defs: CustomFieldDef[],
  input: unknown,
  opts: { existing?: unknown; enforceRequired?: boolean } = {},
): { values: CustomFieldValues; issues: CustomFieldIssue[] } {
  const issues: CustomFieldIssue[] = [];
  const values: CustomFieldValues = {};
  const submitted = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const existing =
    opts.existing && typeof opts.existing === 'object' && !Array.isArray(opts.existing)
      ? (opts.existing as Record<string, unknown>)
      : {};

  for (const def of defs) {
    const raw = Object.prototype.hasOwnProperty.call(submitted, def.key) ? submitted[def.key] : existing[def.key];
    const { value, error } = coerce(def, raw);
    if (error) {
      issues.push({ field: `customFields.${def.key}`, message: error });
      continue;
    }
    if (value === null || value === undefined) {
      if (opts.enforceRequired && def.required) {
        issues.push({ field: `customFields.${def.key}`, message: `${def.label} is required` });
      }
      continue;
    }
    values[def.key] = value;
  }

  return { values, issues };
}

/** Keys are stable identifiers inside Student.customFields — lowercase snake_case. */
export const CUSTOM_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

export function keyFromLabel(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(base) ? base : `field_${base}`.slice(0, 40);
}
