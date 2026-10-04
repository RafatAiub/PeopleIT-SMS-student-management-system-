/**
 * Puck custom fields used by CustomModule forms (editor only at runtime):
 * colour, date, image (URL + preview) and the collection picker
 * (collection + filters + sort + limit, defaults from the module schema).
 * They read the collection registry from `EditorBindContext` (page editor).
 */
import type { CustomField, Field } from '@puckeditor/core';
import { FILTER_OP_LABEL, FILTER_OPS, publicCollections, type CollectionMeta } from '../collections';
import { useEditorBind } from '../editor/bindContext';
import { collectionFieldQuery, type CollectionFieldValue, type FilterOp, type ModuleField } from './types';

const inputCls = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900';
const smallCls = 'rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-900';

export function colorField(label: string): Field {
  const field: CustomField<string | undefined> = {
    type: 'custom',
    label,
    render: ({ value, onChange, readOnly, id }) => {
      const hex = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#f57722';
      return (
        <div className="flex items-center gap-2">
          <input type="color" aria-label={label} disabled={readOnly} value={hex} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
          <input id={id} className={inputCls} disabled={readOnly} value={value ?? ''} placeholder="#1e3a8a or var(--site-primary)" onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    },
  };
  return field as Field;
}

export function dateField(label: string): Field {
  const field: CustomField<string | undefined> = {
    type: 'custom',
    label,
    render: ({ value, onChange, readOnly, id }) => (
      <input id={id} type="date" className={inputCls} disabled={readOnly} value={typeof value === 'string' ? value.slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} />
    ),
  };
  return field as Field;
}

export function imageField(label: string): Field {
  const field: CustomField<string | undefined> = {
    type: 'custom',
    label,
    render: ({ value, onChange, readOnly, id }) => (
      <div className="flex flex-col gap-1.5">
        <input id={id} className={inputCls} disabled={readOnly} value={value ?? ''} placeholder="https://… (copy from Website → Media)" onChange={(e) => onChange(e.target.value)} />
        {typeof value === 'string' && /^https?:\/\//.test(value) && (
          <img src={value} alt="" className="h-20 w-full rounded border border-slate-200 object-cover" loading="lazy" />
        )}
      </div>
    ),
  };
  return field as Field;
}

function CollectionControl({ f, value, onChange, readOnly }: { f: ModuleField; value: CollectionFieldValue | undefined; onChange: (v: CollectionFieldValue) => void; readOnly?: boolean }) {
  const ed = useEditorBind();
  const all: CollectionMeta[] = publicCollections(ed?.collections);
  const q = collectionFieldQuery(f, value);
  const meta = all.find((c) => c.key === q.collection);
  const v: CollectionFieldValue = value && typeof value === 'object' ? value : {};
  const set = (patch: Partial<CollectionFieldValue>) => onChange({ ...v, ...patch });
  const sortField = (q.sort ?? '').replace(/^-/, '');
  const desc = (q.sort ?? '').startsWith('-');
  const filters = Array.isArray(v.filters) ? v.filters : q.filters;
  const filterable = meta?.fields.filter((x) => x.filter.length > 0) ?? [];
  return (
    <div className="flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-2">
      <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-700">
        Collection
        <select className={inputCls} disabled={readOnly} value={q.collection} onChange={(e) => set({ collection: e.target.value, filters: [], sort: '' })}>
          {!all.length && q.collection && <option value={q.collection}>{q.collection}</option>}
          {all.map((c) => <option key={c.key} value={c.key} disabled={!c.available}>{c.labelPlural}{c.available ? '' : ' (switched off)'}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_auto_4.5rem] items-end gap-1.5">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-700">
          Sort by
          <select className={inputCls} disabled={readOnly} value={sortField} onChange={(e) => set({ sort: e.target.value ? `${desc ? '-' : ''}${e.target.value}` : '' })}>
            <option value="">(default order)</option>
            {(meta?.fields.filter((x) => x.sortable) ?? (sortField ? [{ key: sortField, label: sortField }] : [])).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1 pb-2 text-xs text-slate-700">
          <input type="checkbox" disabled={readOnly || !sortField} checked={desc} onChange={(e) => set({ sort: `${e.target.checked ? '-' : ''}${sortField}` })} /> Z→A
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-700">
          How many
          <input type="number" min={1} max={50} className={inputCls} disabled={readOnly} value={q.limit} onChange={(e) => set({ limit: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-700">Filters (all must match)</span>
        {filters.map((fl, i) => (
          <div key={i} className="grid grid-cols-[1fr_5.5rem_1fr_auto] gap-1">
            <select aria-label="Filter field" className={smallCls} disabled={readOnly} value={fl.field} onChange={(e) => set({ filters: filters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
              <option value="">— field —</option>
              {(filterable.length ? filterable : [{ key: fl.field, label: fl.field }]).filter((x) => x.key).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <select aria-label="Condition" className={smallCls} disabled={readOnly} value={fl.op} onChange={(e) => set({ filters: filters.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterOp } : x)) })}>
              {FILTER_OPS.map((o) => <option key={o} value={o}>{FILTER_OP_LABEL[o]}</option>)}
            </select>
            <input aria-label="Value" className={smallCls} disabled={readOnly} value={fl.value} placeholder="value or {{item.x}}" onChange={(e) => set({ filters: filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
            <button type="button" className="px-1 text-xs text-red-700" disabled={readOnly} aria-label="Remove filter" onClick={() => set({ filters: filters.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        {filters.length < 10 && (
          <button type="button" className="self-start rounded px-1.5 py-0.5 text-xs font-medium text-slate-700 underline" disabled={readOnly} onClick={() => set({ filters: [...filters, { field: '', op: 'eq', value: '' }] })}>
            + Add filter
          </button>
        )}
      </div>
    </div>
  );
}

export function collectionField(f: ModuleField, label: string): Field {
  const field: CustomField<CollectionFieldValue | undefined> = {
    type: 'custom',
    label,
    render: ({ value, onChange, readOnly }) => <CollectionControl f={f} value={value} onChange={onChange} readOnly={readOnly} />,
  };
  return field as Field;
}

export const DEFAULT_CONTROLS = { color: colorField, date: dateField, image: imageField, collection: collectionField };
