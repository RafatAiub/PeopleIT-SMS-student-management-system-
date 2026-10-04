/**
 * Module fields schema → Puck fields (W15). Pure: the four custom controls
 * (colour, date, image, collection) are injected, so tests can pass stubs and
 * the editor passes `DEFAULT_CONTROLS` from fieldControls.tsx.
 *
 *   text / textarea / richtext  → Puck text / textarea / richtext (+ `<key>Bn` twin when `bn: true`)
 *   number → number (min/max/step) · boolean → Yes/No radio · select → select
 *   link → text · image / date / color → custom · repeater → array · collection → custom picker
 */
import type { Field } from '@puckeditor/core';
import { defaultValues, fieldLabel, optionList, type ModuleField, type Rec } from './types';

export interface FieldControls {
  color: (label: string) => Field;
  date: (label: string) => Field;
  image: (label: string) => Field;
  collection: (f: ModuleField, label: string) => Field;
}

const BN_SUFFIX = ' (বাংলা)';

function itemSummary(sub: ModuleField[], itemLabel: string | undefined) {
  const firstText = sub.find((x) => x.type === 'text' || x.type === 'textarea');
  return (item: Rec, i?: number) => {
    const v = firstText ? item?.[firstText.key] : undefined;
    return typeof v === 'string' && v.trim() ? v.slice(0, 60) : `${itemLabel || 'Item'} ${(i ?? 0) + 1}`;
  };
}

export function moduleFieldsToPuck(fields: ModuleField[], controls: FieldControls, lang: 'en' | 'bn' = 'en'): Record<string, Field> {
  const out: Record<string, Field> = {};
  for (const f of fields) {
    const label = `${fieldLabel(f, lang)}${f.required ? ' *' : ''}`;
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'richtext': {
        const base = { type: f.type, label, ...(f.placeholder && f.type !== 'richtext' ? { placeholder: f.placeholder } : {}) } as Field;
        out[f.key] = base;
        if (f.bn) out[`${f.key}Bn`] = { ...(base as object), label: `${fieldLabel(f, lang)}${BN_SUFFIX}` } as Field;
        break;
      }
      case 'number':
        out[f.key] = { type: 'number', label, ...(f.min !== undefined ? { min: f.min } : {}), ...(f.max !== undefined ? { max: f.max } : {}), ...(f.step !== undefined ? { step: f.step } : {}) } as Field;
        break;
      case 'boolean':
        out[f.key] = { type: 'radio', label, options: [{ value: true, label: lang === 'bn' ? 'হ্যাঁ' : 'Yes' }, { value: false, label: lang === 'bn' ? 'না' : 'No' }] } as Field;
        break;
      case 'select':
        out[f.key] = { type: 'select', label, options: optionList(f).map((o) => ({ value: o.value, label: (lang === 'bn' && o.labelBn) || o.label || o.value })) } as Field;
        break;
      case 'link':
        out[f.key] = { type: 'text', label, placeholder: f.placeholder ?? 'https://… or /page' } as Field;
        break;
      case 'image':
        out[f.key] = controls.image(label);
        break;
      case 'date':
        out[f.key] = controls.date(label);
        break;
      case 'color':
        out[f.key] = controls.color(label);
        break;
      case 'repeater': {
        const sub = f.fields ?? [];
        out[f.key] = {
          type: 'array',
          label,
          arrayFields: moduleFieldsToPuck(sub, controls, lang),
          defaultItemProps: defaultValues(sub),
          getItemSummary: itemSummary(sub, f.itemLabel),
          ...(f.maxItems ? { max: f.maxItems } : {}),
        } as unknown as Field;
        break;
      }
      case 'collection':
        out[f.key] = controls.collection(f, label);
        break;
      default:
        break;
    }
  }
  return out;
}
