/**
 * "Visibility" field (W6) — added to every block by `makeBindable`. Show-if
 * rules on the item / URL, plus hide-on phone / tablet / desktop. Kept free of
 * the Puck runtime (custom-field props only) so the public bundle stays light.
 */
import { useId } from 'react';
import type { CustomFieldRender } from '@puckeditor/core';
import { VIS_OPS, VIS_VIEWPORTS, type VisibleSpec, type VisOp, type VisRule, type VisViewport } from '../binding';
import { useEditorBind } from './bindContext';

const OP_LABEL: Record<VisOp, string> = {
  empty: 'is empty',
  notEmpty: 'is not empty',
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  lt: 'is less than',
  contains: 'contains',
};
const VP_LABEL: Record<VisViewport, string> = { sm: 'Phone', md: 'Tablet', lg: 'Desktop' };
const inputCls = 'w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900';

const norm = (v: unknown): Required<VisibleSpec> => {
  const s = (v && typeof v === 'object' ? v : {}) as VisibleSpec;
  return { match: s.match === 'any' ? 'any' : 'all', when: Array.isArray(s.when) ? s.when : [], hideOn: Array.isArray(s.hideOn) ? s.hideOn : [] };
};

export const VisibilityField: CustomFieldRender<VisibleSpec | undefined> = ({ value, onChange, readOnly }) => {
  const uid = useId();
  const editor = useEditorBind();
  const spec = norm(value);
  const scope = editor?.scopeForSelected();
  const keysFor = (src: VisRule['src']): string[] => {
    const meta = src === 'item' ? scope?.item : src === 'parent' ? scope?.parent : src === 'page' ? scope?.page : null;
    return meta ? meta.fields.map((f) => f.key) : [];
  };
  const sources: VisRule['src'][] = ['item', 'url', ...(scope?.parent ? (['parent'] as const) : []), ...(scope?.page && scope.page !== scope.item ? (['page'] as const) : [])];
  const set = (next: Partial<Required<VisibleSpec>>) => onChange({ ...spec, ...next });
  const setRule = (i: number, patch: Partial<VisRule>) => set({ when: spec.when.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const count = spec.when.length + spec.hideOn.length;

  return (
    <details className="rounded border border-slate-200 bg-slate-50 p-2" open={count > 0}>
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
        Visibility {count > 0 && <span className="ml-1 rounded bg-primary-600/10 px-1.5 py-0.5 text-[10px] text-primary-700">{count} rule{count === 1 ? '' : 's'}</span>}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {spec.when.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-slate-700">
            Show when
            <select className={inputCls} disabled={readOnly} value={spec.match} onChange={(e) => set({ match: e.target.value as 'all' | 'any' })}>
              <option value="all">all rules match</option>
              <option value="any">any rule matches</option>
            </select>
          </label>
        )}
        {spec.when.map((r, i) => (
          <div key={i} className="flex flex-col gap-1 rounded border border-slate-200 bg-white p-1.5">
            <div className="flex gap-1">
              <select aria-label="Data source" className={inputCls} disabled={readOnly} value={r.src} onChange={(e) => setRule(i, { src: e.target.value as VisRule['src'] })}>
                {sources.map((s) => <option key={s} value={s}>{s === 'url' ? 'URL' : s}</option>)}
              </select>
              <input
                aria-label="Field"
                className={inputCls}
                list={`${uid}-${i}`}
                placeholder={r.src === 'url' ? 'e.g. q' : 'field'}
                disabled={readOnly}
                value={r.path}
                onChange={(e) => setRule(i, { path: e.target.value })}
              />
              <datalist id={`${uid}-${i}`}>{keysFor(r.src).map((k) => <option key={k} value={k} />)}</datalist>
            </div>
            <div className="flex gap-1">
              <select aria-label="Condition" className={inputCls} disabled={readOnly} value={r.op} onChange={(e) => setRule(i, { op: e.target.value as VisOp })}>
                {VIS_OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
              </select>
              {r.op !== 'empty' && r.op !== 'notEmpty' && (
                <input aria-label="Value" className={inputCls} placeholder="value" disabled={readOnly} value={r.value ?? ''} onChange={(e) => setRule(i, { value: e.target.value })} />
              )}
              <button type="button" className="rounded px-2 text-xs text-red-600 hover:bg-red-50" disabled={readOnly} aria-label="Remove rule" onClick={() => set({ when: spec.when.filter((_, j) => j !== i) })}>×</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          disabled={readOnly}
          onClick={() => set({ when: [...spec.when, { src: scope?.item ? 'item' : 'url', path: '', op: 'notEmpty' }] })}
        >
          + Show only if…
        </button>
        <fieldset className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
          <legend className="mb-1 font-medium">Hide on</legend>
          {VIS_VIEWPORTS.map((v) => (
            <label key={v} className="flex items-center gap-1">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={spec.hideOn.includes(v)}
                onChange={(e) => set({ hideOn: e.target.checked ? [...spec.hideOn, v] : spec.hideOn.filter((x) => x !== v) })}
              />
              {VP_LABEL[v]}
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-slate-500">Hidden blocks stay visible (dimmed) in the editor so you can still edit them.</p>
      </div>
    </details>
  );
};
