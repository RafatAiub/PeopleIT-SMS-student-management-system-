/**
 * The ⚡ "bind to data" control (W2). Rendered under every text / textarea /
 * number / select / rich-text field through Puck's `overrides.fieldTypes`
 * (`bindFieldOverrides` below) — Puck's `fieldTransforms` only transform preview
 * *values*, they can't add sidebar UI, so the field renderer is the right seam.
 *
 * Picking a field writes `_bind[<prop path>] = { src, path, fmt?, fallback? }` on the
 * selected block (via `EditorBindContext.setBinding`); the render wrapper in
 * `bindable.tsx` resolves it. Image fields are plain URL text fields, so they get it too.
 */
import { useId, useState, type ReactNode } from 'react';
import type { FieldRenderFunctions } from '@puckeditor/core';
import { BIND_FORMAT_LABELS, BIND_FORMATS, type BindFmt } from '../format';
import { describeBind, type BindSpec, type BindSrc } from '../binding';
import { COMPUTED_FIELDS, type CollectionMeta } from '../collections';
import { SITE_TOKENS } from '../tokens';
import { SRC_LABEL, useEditorBind, type ScopeCollections } from './bindContext';

const cls = 'w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900';

function pathOptions(src: BindSrc, scope: ScopeCollections): Array<{ value: string; label: string }> {
  if (src === 'site') return SITE_TOKENS.map((t) => ({ value: t.token.replace(/[{}]/g, ''), label: t.label }));
  const meta: CollectionMeta | null | undefined = src === 'item' ? scope.item : src === 'parent' ? scope.parent : scope.page;
  if (!meta) return [];
  return [
    ...meta.fields.map((f) => ({ value: f.key, label: `${f.label} (${f.type})` })),
    ...meta.relations.map((r) => ({ value: r.key, label: `${r.label} (related ${r.many ? 'list' : 'item'})` })),
    ...(meta.routeBase ? COMPUTED_FIELDS : COMPUTED_FIELDS.filter((f) => f.key !== '_url')).map((f) => ({ value: f.key, label: f.label })),
  ];
}

function BindPanel({ name, current, onClose }: { name: string; current?: BindSpec; onClose: () => void }) {
  const uid = useId();
  const ed = useEditorBind();
  const scope = ed?.scopeForSelected() ?? {};
  const sources: BindSrc[] = [
    ...(scope.item ? (['item'] as const) : []),
    ...(scope.parent ? (['parent'] as const) : []),
    ...(scope.page && scope.page !== scope.item ? (['page'] as const) : []),
    'site',
  ];
  const [src, setSrc] = useState<BindSrc>(current?.src ?? sources[0]);
  const [path, setPath] = useState(current?.path ?? '');
  const [fmt, setFmt] = useState<BindFmt | ''>(current?.fmt ?? '');
  const [fallback, setFallback] = useState(current?.fallback ?? '');
  const options = pathOptions(src, scope);
  const apply = () => {
    if (!path.trim()) return;
    ed?.setBinding(name, { src, path: path.trim(), ...(fmt ? { fmt } : {}), ...(fallback.trim() ? { fallback: fallback.trim() } : {}) });
    onClose();
  };
  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded border border-amber-300 bg-amber-50 p-2" role="group" aria-label="Bind to data">
      <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-700">
        Take the value from
        <select className={cls} value={src} onChange={(e) => { setSrc(e.target.value as BindSrc); setPath(''); }}>
          {sources.map((s) => <option key={s} value={s}>{SRC_LABEL[s]}{s === 'item' && scope.item ? ` — ${scope.item.label}` : ''}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-700">
        Field
        <input className={cls} list={`${uid}-paths`} value={path} placeholder="Choose or type a field, e.g. name" onChange={(e) => setPath(e.target.value)} />
        <datalist id={`${uid}-paths`}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
      </label>
      {sources.length === 1 && sources[0] === 'site' && (
        <p className="text-[11px] text-slate-600">Place this block inside a Collection list (or on a template page) to bind it to that item’s fields.</p>
      )}
      <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-700">
        Format
        <select className={cls} value={fmt} onChange={(e) => setFmt(e.target.value as BindFmt | '')}>
          <option value="">As is</option>
          {BIND_FORMATS.map((f) => <option key={f} value={f}>{BIND_FORMAT_LABELS[f]}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs font-medium text-slate-700">
        If empty, show
        <input className={cls} value={fallback} placeholder="(nothing)" onChange={(e) => setFallback(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50" disabled={!path.trim()} onClick={apply}>Bind</button>
        <button type="button" className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function BindWrap({ name, children, readOnly }: { name?: string; children: ReactNode; readOnly?: boolean }) {
  const ed = useEditorBind();
  const [open, setOpen] = useState(false);
  const selected = ed?.selectedProps();
  // Root fields, reserved props and fields with no selected block have nothing to bind.
  if (!ed || !name || name.startsWith('_') || !selected) return <>{children}</>;
  const current = ed.bindings()[name];
  return (
    <div>
      {children}
      {current && !open ? (
        <div className="mt-1 flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900" title="The typed value above is replaced by this data on the live page">
          <span aria-hidden>⚡</span>
          <span className="min-w-0 flex-1 truncate font-medium">{describeBind(current)}</span>
          <button type="button" className="underline" onClick={() => setOpen(true)} disabled={readOnly}>Edit</button>
          <button type="button" className="ml-1 underline" onClick={() => ed.setBinding(name, null)} disabled={readOnly} aria-label="Remove data binding">Remove</button>
        </div>
      ) : open ? (
        <BindPanel name={name} current={current} onClose={() => setOpen(false)} />
      ) : (
        <button type="button" className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100" onClick={() => setOpen(true)} disabled={readOnly}>
          <span aria-hidden>⚡</span> Bind to data
        </button>
      )}
    </div>
  );
}

type Overrides = Partial<FieldRenderFunctions>;

/** Pass as `<Puck overrides={{ fieldTypes: bindFieldOverrides }} />`. */
export const bindFieldOverrides: Overrides = {
  text: ({ children, name, readOnly }) => <BindWrap name={name} readOnly={readOnly}>{children}</BindWrap>,
  textarea: ({ children, name, readOnly }) => <BindWrap name={name} readOnly={readOnly}>{children}</BindWrap>,
  number: ({ children, name, readOnly }) => <BindWrap name={name} readOnly={readOnly}>{children}</BindWrap>,
  select: ({ children, name, readOnly }) => <BindWrap name={name} readOnly={readOnly}>{children}</BindWrap>,
  richtext: ({ children, name, readOnly }) => <BindWrap name={name} readOnly={readOnly}>{children}</BindWrap>,
};
