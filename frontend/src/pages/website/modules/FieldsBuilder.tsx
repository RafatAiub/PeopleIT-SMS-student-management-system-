import React from 'react';
import { ArrowDown, ArrowUp, Braces, ListPlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { CodeEditor } from '@/site/fields/CodeField';
import { useSiteData } from '@/site/runtime';
import { FILTER_OP_LABEL, FILTER_OPS, publicCollections, type CollectionMeta } from '@/site/collections';
import { FIELD_TYPE_LABELS, MODULE_FIELD_TYPES, isTextType, optionList, type FilterOp, type ModuleField, type ModuleFieldType } from '@/site/modules/types';
import { useMT } from './modules.i18n';

// =============================================================================
// Visual builder for a module's fields schema (W16) + a raw JSON toggle.
// Writes plain JSON the server validates (sites.modules.logic.ts); the
// builder never drops keys it doesn't show (e.g. `help`, `placeholder`).
// =============================================================================

const inputCls = 'w-full rounded-md border border-slate-300 dark:border-white/15 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100';
const labelCls = 'flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300';

type FieldLike = ModuleField & Record<string, unknown>;

function nextKey(fields: FieldLike[], base = 'field'): string {
  const taken = new Set(fields.map((f) => f.key));
  for (let i = 1; i < 999; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_${Date.now()}`;
}

function DefaultInput({ f, onChange }: { f: FieldLike; onChange: (v: unknown) => void }) {
  const d = f.default;
  if (f.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={d === true} onChange={(e) => onChange(e.target.checked)} /> {d === true ? 'Yes' : 'No'}
      </label>
    );
  }
  if (f.type === 'number') {
    return <input className={inputCls} type="number" value={typeof d === 'number' ? d : ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
  }
  if (f.type === 'repeater' || f.type === 'collection') return null;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    // { en, bn } default for a text twin
    const o = d as { en?: string; bn?: string };
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <input className={inputCls} value={o.en ?? ''} placeholder="English" onChange={(e) => onChange({ ...o, en: e.target.value })} />
        <input className={inputCls} value={o.bn ?? ''} placeholder="বাংলা" onChange={(e) => onChange({ ...o, bn: e.target.value })} />
      </div>
    );
  }
  if (f.type === 'select') {
    return (
      <select className={inputCls} value={typeof d === 'string' ? d : ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">(first option)</option>
        {optionList(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input
      className={inputCls}
      type={f.type === 'date' ? 'date' : 'text'}
      value={typeof d === 'string' ? d : ''}
      placeholder={f.type === 'color' ? '#1e3a8a' : f.type === 'link' ? '/admissions' : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
    />
  );
}

function CollectionSettings({ f, set, collections }: { f: FieldLike; set: (patch: Partial<FieldLike>) => void; collections: CollectionMeta[] }) {
  const mt = useMT();
  const meta = collections.find((c) => c.key === f.collection);
  const filters = f.filters ?? [];
  const sortField = (f.sort ?? '').replace(/^-/, '');
  const desc = (f.sort ?? '').startsWith('-');
  return (
    <div className="col-span-full grid gap-2 sm:grid-cols-3">
      <label className={labelCls}>
        {mt('Collection')}
        <select className={inputCls} value={f.collection ?? ''} onChange={(e) => set({ collection: e.target.value, sort: undefined, filters: undefined })}>
          <option value="">— choose —</option>
          {f.collection && !meta && <option value={f.collection}>{f.collection}</option>}
          {collections.map((c) => <option key={c.key} value={c.key}>{c.labelPlural} ({c.key})</option>)}
        </select>
      </label>
      <label className={labelCls}>
        {mt('Sort')}
        <div className="flex gap-1.5">
          <select className={inputCls} value={sortField} onChange={(e) => set({ sort: e.target.value ? `${desc ? '-' : ''}${e.target.value}` : undefined })}>
            <option value="">(default order)</option>
            {sortField && !meta?.fields.some((x) => x.key === sortField) && <option value={sortField}>{sortField}</option>}
            {meta?.fields.filter((x) => x.sortable).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" checked={desc} disabled={!sortField} onChange={(e) => set({ sort: `${e.target.checked ? '-' : ''}${sortField}` })} />Z→A</label>
        </div>
      </label>
      <label className={labelCls}>
        {mt('How many')}
        <input className={inputCls} type="number" min={1} max={50} value={f.limit ?? ''} onChange={(e) => set({ limit: e.target.value ? Math.min(50, Math.max(1, Number(e.target.value))) : undefined })} />
      </label>
      <div className="col-span-full flex flex-col gap-1">
        {filters.map((fl, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_1fr_auto] gap-1.5">
            <select aria-label="Filter field" className={inputCls} value={fl.field} onChange={(e) => set({ filters: filters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
              <option value="">— field —</option>
              {fl.field && !meta?.fields.some((x) => x.key === fl.field) && <option value={fl.field}>{fl.field}</option>}
              {meta?.fields.filter((x) => x.filter.length).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <select aria-label="Condition" className={inputCls} value={fl.op} onChange={(e) => set({ filters: filters.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterOp } : x)) })}>
              {FILTER_OPS.map((o) => <option key={o} value={o}>{FILTER_OP_LABEL[o]}</option>)}
            </select>
            <input aria-label="Value" className={inputCls} value={fl.value} placeholder="Science or {{item.department}}" onChange={(e) => set({ filters: filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
            <Button size="icon-sm" variant="ghost" aria-label={mt('Remove')} onClick={() => set({ filters: filters.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
        {filters.length < 10 && (
          <Button size="sm" variant="ghost" className="self-start" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => set({ filters: [...filters, { field: '', op: 'eq', value: '' }] })}>Filter</Button>
        )}
      </div>
    </div>
  );
}

function FieldRow({ f, index, count, depth, onChange, onRemove, onMove, collections }: {
  f: FieldLike; index: number; count: number; depth: number; collections: CollectionMeta[];
  onChange: (f: FieldLike) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const mt = useMT();
  const set = (patch: Partial<FieldLike>) => {
    const next = { ...f, ...patch } as FieldLike;
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (next as Record<string, unknown>)[k];
    onChange(next);
  };
  const types = MODULE_FIELD_TYPES.filter((t) => depth === 0 || (t !== 'repeater' && t !== 'collection'));
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <label className={labelCls}>
          {mt('Key')}
          <input className={`${inputCls} font-mono`} value={f.key} onChange={(e) => set({ key: e.target.value.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40) })} />
        </label>
        <label className={labelCls}>
          {mt('Type')}
          <select className={inputCls} value={f.type} onChange={(e) => {
            const type = e.target.value as ModuleFieldType;
            const patch: Partial<FieldLike> = { type, default: undefined };
            if (type === 'repeater' && !f.fields) patch.fields = [{ key: 'title', type: 'text', label: 'Title', bn: true }];
            if (type === 'select' && !f.options) patch.options = ['Option 1', 'Option 2'];
            if (type === 'collection' && !f.collection) { patch.collection = 'notices'; patch.limit = 6; }
            set(patch);
          }}>
            {types.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          {mt('Label')}
          <input className={inputCls} value={f.label ?? ''} onChange={(e) => set({ label: e.target.value || undefined })} />
        </label>
        <div className="flex items-end gap-0.5">
          <Button size="icon-sm" variant="ghost" aria-label={mt('Move up')} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="w-4 h-4" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={mt('Move down')} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="w-4 h-4" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={mt('Remove')} onClick={onRemove}><Trash2 className="w-4 h-4 text-red-600" /></Button>
        </div>
        <label className={labelCls}>
          {mt('Label (Bangla)')}
          <input className={inputCls} value={f.labelBn ?? ''} onChange={(e) => set({ labelBn: e.target.value || undefined })} />
        </label>
        {f.type !== 'repeater' && f.type !== 'collection' && (
          <label className={`${labelCls} sm:col-span-2`}>
            {mt('Default')}
            <DefaultInput f={f} onChange={(v) => set({ default: v })} />
          </label>
        )}
        {isTextType(f.type) && (
          <label className="flex items-end gap-2 pb-2 text-xs font-medium text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={f.bn === true} onChange={(e) => set({ bn: e.target.checked || undefined })} /> {mt('Bangla twin')}
          </label>
        )}
        {f.type === 'select' && (
          <label className={`${labelCls} col-span-full`}>
            {mt('Options (one per line)')}
            <textarea
              className={`${inputCls} font-mono`}
              rows={3}
              value={optionList(f).map((o) => (o.label && o.label !== o.value ? `${o.value}|${o.label}` : o.value)).join('\n')}
              onChange={(e) => set({ options: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [v, ...rest] = l.split('|'); return rest.length ? { value: v.trim(), label: rest.join('|').trim() } : v; }) })}
            />
          </label>
        )}
        {f.type === 'number' && (
          <div className="col-span-full grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className={labelCls}>Min<input className={inputCls} type="number" value={f.min ?? ''} onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
            <label className={labelCls}>Max<input className={inputCls} type="number" value={f.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
          </div>
        )}
        {f.type === 'collection' && <CollectionSettings f={f} set={set} collections={collections} />}
        {f.type === 'repeater' && (
          <div className="col-span-full rounded-md border border-dashed border-slate-300 dark:border-white/15 p-2">
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{mt('Item fields')}</p>
            <FieldList fields={(f.fields ?? []) as FieldLike[]} onChange={(fields) => set({ fields })} depth={depth + 1} collections={collections} />
          </div>
        )}
      </div>
    </div>
  );
}

function FieldList({ fields, onChange, depth, collections }: { fields: FieldLike[]; onChange: (f: FieldLike[]) => void; depth: number; collections: CollectionMeta[] }) {
  const mt = useMT();
  const move = (i: number, dir: -1 | 1) => {
    const next = [...fields];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, i) => (
        <FieldRow
          key={i}
          f={f}
          index={i}
          count={fields.length}
          depth={depth}
          collections={collections}
          onChange={(nf) => onChange(fields.map((x, j) => (j === i ? nf : x)))}
          onRemove={() => onChange(fields.filter((_, j) => j !== i))}
          onMove={(dir) => move(i, dir)}
        />
      ))}
      <Button size="sm" variant="secondary" className="self-start" leftIcon={<ListPlus className="w-4 h-4" />} onClick={() => onChange([...fields, { key: nextKey(fields), type: 'text', label: 'New field', bn: true } as FieldLike])}>
        {mt('Add field')}
      </Button>
    </div>
  );
}

export function FieldsBuilder({ value, onChange }: { value: unknown[]; onChange: (fields: unknown[]) => void }) {
  const mt = useMT();
  const [raw, setRaw] = React.useState(false);
  const [text, setText] = React.useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const registry = useSiteData(['collections'], (id, api) => api.collections(id), { staleTime: 5 * 60_000 });
  const collections = React.useMemo(() => publicCollections(registry.data).filter((c) => !c.key.includes('.')), [registry.data]);

  const openRaw = () => { setText(JSON.stringify(value, null, 2)); setJsonError(null); setRaw(true); };
  const onText = (t: string) => {
    setText(t);
    try {
      const parsed = JSON.parse(t);
      if (!Array.isArray(parsed)) throw new Error('The fields must be a JSON array: [ { "key": …, "type": … } ]');
      setJsonError(null);
      onChange(parsed);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : mt('Invalid JSON'));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        {raw ? (
          <Button size="sm" variant="secondary" leftIcon={<ListPlus className="w-4 h-4" />} disabled={Boolean(jsonError)} onClick={() => setRaw(false)}>{mt('Visual editor')}</Button>
        ) : (
          <Button size="sm" variant="secondary" leftIcon={<Braces className="w-4 h-4" />} onClick={openRaw}>{mt('Edit as JSON')}</Button>
        )}
      </div>
      {raw ? (
        <>
          <CodeEditor value={text} onChange={onText} language="javascript" height={420} />
          {jsonError && <p className="field-error" role="alert">{mt('Invalid JSON')}: {jsonError}</p>}
        </>
      ) : (
        <FieldList fields={(Array.isArray(value) ? value : []) as FieldLike[]} onChange={(f) => onChange(f)} depth={0} collections={collections} />
      )}
    </div>
  );
}
