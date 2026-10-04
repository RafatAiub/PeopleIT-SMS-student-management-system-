// Custom field definitions (entity STUDENT). Values live in Student.customFields
// as { [key]: string | number | null }. Mirrors backend/src/modules/custom-fields.

export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface CustomFieldDefinition {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomFieldFormValues {
  label: string;
  key: string;
  type: CustomFieldType;
  /** One option per line in the form; split on save. */
  optionsText: string;
  required: boolean;
}

export const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown (select)' },
];

export const EMPTY_FIELD_FORM: CustomFieldFormValues = {
  label: '',
  key: '',
  type: 'text',
  optionsText: '',
  required: false,
};

export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Same derivation as the backend's keyFromLabel, so the preview matches what gets saved. */
export function keyFromLabel(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!base) return '';
  return /^[a-z]/.test(base) ? base : `field_${base}`.slice(0, 40);
}

export function parseOptions(text: string): string[] {
  return [...new Set(text.split('\n').map((o) => o.trim()).filter(Boolean))];
}

/** Values as edited in forms: always strings ('' = empty). */
export type CustomFieldFormState = Record<string, string>;

export function toFormState(values: unknown): CustomFieldFormState {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {};
  const out: CustomFieldFormState = {};
  for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

/** Only defined keys, blanks dropped, numbers sent as numbers. */
export function toPayload(defs: CustomFieldDefinition[], state: CustomFieldFormState): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const def of defs) {
    const raw = state[def.key]?.trim();
    if (!raw) continue;
    out[def.key] = def.type === 'number' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  }
  return out;
}

/** Client-side mirror of the backend rules, so errors show inline before submit. */
export function validateCustomFields(
  defs: CustomFieldDefinition[],
  state: CustomFieldFormState,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const raw = state[def.key]?.trim() ?? '';
    if (!raw) {
      if (def.required) errors[def.key] = `${def.label} is required`;
      continue;
    }
    if (def.type === 'number' && !Number.isFinite(Number(raw))) errors[def.key] = `${def.label} must be a number`;
    if (def.type === 'select' && def.options && !def.options.includes(raw)) {
      errors[def.key] = `${def.label} must be one of the listed options`;
    }
  }
  return errors;
}
