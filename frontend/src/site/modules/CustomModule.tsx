/**
 * `CustomModule` (W15): renders a school-written module (Liquid template +
 * scoped CSS, or a sandboxed frame when the module has JS) from page props
 * `{ moduleKey, version?, values }`.
 *
 * - Definitions: the site's PUBLISHED modules (`GET /public/sites/:id/modules`,
 *   React Query cached), or whatever a `ModuleDefsContext` provides (the
 *   Modules tab preview passes the draft).
 * - Editor form: `resolveFields` builds `values.*` from the module's schema
 *   (registry.ts), so editors fill in a normal form.
 * - Works inside CollectionList items and template pages: `item` / `parent` /
 *   `page` come from the ambient scope (scopeContext.tsx), and makeBindable
 *   adds ⚡ bindings + visibility like every block.
 */
import { createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Blocks } from 'lucide-react';
import type { ComponentConfig, CustomField, Field } from '@puckeditor/core';
import { paramsKey, publicCollections, type CollectionParams } from '../collections';
import { decorateItem } from '../blocks/collection-list';
import { BlockSection, EditorHint, SkeletonRows, sectionDefaults, sectionFields, yesNo, type SectionProps, type SiteBlock } from '../blocks/shared';
import { SandboxFrame } from '../code/SandboxFrame';
import { useSiteData, useSiteHref, useSiteRuntime } from '../runtime';
import { sanitizeModuleHtml } from '../sanitize';
import { useScope } from '../scopeContext';
import { cssForStyleTag, moduleScopeAttr, safeInstanceId, scopeCss } from './cssScope';
import { DEFAULT_CONTROLS } from './fieldControls';
import { moduleFieldsToPuck } from './puckFields';
import { editorModuleList, getEditorModule } from './registry';
import { defaultValues, moduleAliasType, moduleItem, stableKey, type ModuleDef, type Rec } from './types';

/* ── Definitions ────────────────────────────────────────────────────────── */

/** Optional override of where module definitions come from (module editor preview). */
export const ModuleDefsContext = createContext<{ defs: ModuleDef[] } | null>(null);

function useModuleDefs(): { defs: ModuleDef[]; loading: boolean; error: boolean } {
  const override = useContext(ModuleDefsContext);
  const q = useSiteData(['modules'], (id, api) => api.modules(id), { enabled: !override, staleTime: 2 * 60_000 });
  if (override) return { defs: override.defs, loading: false, error: false };
  return { defs: q.data ?? [], loading: q.isLoading && q.connected, error: q.isError };
}

/* ── Values from Puck (rich text may arrive as React elements in the editor) ── */

function richToString(v: unknown, depth = 0): unknown {
  if (depth > 12) return v;
  if (isValidElement(v)) {
    const props = v.props as { content?: unknown; children?: unknown };
    if (typeof props.content === 'string') return props.content;
    return props.children !== undefined ? richToString(props.children, depth + 1) : '';
  }
  if (Array.isArray(v)) return v.map((x) => richToString(x, depth + 1));
  if (v && typeof v === 'object') {
    const out: Rec = {};
    for (const [k, x] of Object.entries(v as Rec)) out[k] = richToString(x, depth + 1);
    return out;
  }
  return v;
}

/* ── Renderer ───────────────────────────────────────────────────────────── */

export interface ModuleRendererProps extends SectionProps {
  def: ModuleDef;
  values: Rec | null | undefined;
  instanceId: string;
  wrap?: boolean;
  /** Show the Liquid error box (editor / module preview). Defaults to editor mode. */
  showErrors?: boolean;
}

type RenderState = { html: string | null; error: { message: string; line: number | null } | null; busy: boolean };

function ErrorBox({ error, name }: { error: { message: string; line: number | null }; name: string }) {
  return (
    <div role="alert" style={{ border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>
      <strong>Module “{name}” has an error{error.line ? ` on line ${error.line}` : ''}:</strong> {error.message}
    </div>
  );
}

function RouterNavigate({ onReady }: { onReady: (fn: (to: string) => void) => void }) {
  const navigate = useNavigate();
  // `onReady` stores the function with a functional setState (`setX(() => fn)`).
  useEffect(() => { onReady((to: string) => navigate(to)); }, [navigate, onReady]);
  return null;
}

export function ModuleRenderer({ def, values, instanceId, wrap = true, tone, pad, width, anchor, showErrors }: ModuleRendererProps) {
  const rt = useSiteRuntime();
  const scope = useScope();
  const qc = useQueryClient();
  const toHref = useSiteHref();
  const inRouter = useInRouterContext();
  const editing = rt.mode === 'editor';
  const showErr = showErrors ?? editing;
  const [state, setState] = useState<RenderState>({ html: null, error: null, busy: true });
  const [navigate, setNavigate] = useState<((to: string) => void) | null>(null);
  const onRouterReady = useCallback((fn: (to: string) => void) => setNavigate(() => fn), []);

  const cleanValues = useMemo(() => richToString(values ?? {}) as Rec, [values]);
  const mode = rt.previewToken ? 'preview' : 'live';
  const institution = useMemo<Rec>(() => {
    const i = rt.institution;
    return i ? { name: i.name, nameBn: i.nameBn ?? null, logo: i.logo ?? null, phone: i.contact?.phone ?? null, email: i.contact?.email ?? null, address: i.contact?.address ?? null } : {};
  }, [rt.institution]);

  const fetchCollection = useCallback(async (key: string, params: CollectionParams): Promise<Rec[]> => {
    const siteId = rt.siteId;
    if (!siteId) return [];
    const registry = await qc.fetchQuery({ queryKey: ['site-public', siteId, mode, 'collections'], queryFn: () => rt.api.collections(siteId), staleTime: 5 * 60_000 });
    const meta = publicCollections(registry).find((c) => c.key === key);
    if (!meta) throw new Error(`Unknown collection "${key}"`);
    if (!meta.available) return [];
    const page = await qc.fetchQuery({
      queryKey: ['site-public', siteId, mode, 'collection', key, paramsKey(params), 'module'],
      queryFn: () => rt.api.collectionItems(siteId, key, params),
      staleTime: 60_000,
    });
    return page.items.map((it, i) => moduleItem(decorateItem(it, meta, i)));
  }, [qc, rt.api, rt.siteId, mode]);

  const renderKey = stableKey({
    t: def.template, f: def.fields, v: cleanValues, lang: rt.lang, tok: rt.tokens, inst: institution, site: rt.siteId, mode,
    s: { item: scope.item ?? null, parent: scope.parent ?? null, page: scope.page ?? null, url: scope.url ?? null },
  });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, busy: true }));
    import('./moduleRender')
      .then((m) => m.renderModule({
        def, values: cleanValues, lang: rt.lang, scope, tokens: rt.tokens, institution, siteId: rt.siteId, fetchCollection,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      }))
      .then((html) => { if (alive) setState({ html, error: null, busy: false }); })
      .catch((err: unknown) => {
        if (!alive) return;
        const e = err as { message?: string; line?: number | null };
        if (import.meta.env?.DEV) console.warn(`[site] module "${def.key}" failed`, err);
        setState({ html: null, error: { message: e?.message ?? 'Template error', line: typeof e?.line === 'number' ? e.line : null }, busy: false });
      });
    return () => { alive = false; };
    // `renderKey` captures every input of the render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey]);

  const id = safeInstanceId(instanceId);
  const hasJs = def.js.trim().length > 0;
  const mapHref = useCallback((href: string) => toHref(href) ?? href, [toHref]);
  const safeHtml = useMemo(() => (state.html && !hasJs ? sanitizeModuleHtml(state.html, mapHref) : ''), [state.html, hasJs, mapHref]);
  const css = useMemo(() => (hasJs ? '' : cssForStyleTag(scopeCss(def.css, moduleScopeAttr(id)))), [def.css, id, hasJs]);
  const onClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    if (editing) { e.preventDefault(); return; }
    const href = a.getAttribute('href') ?? '';
    if (!navigate || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || !href.startsWith('/') || href.startsWith('//')) return;
    e.preventDefault();
    navigate(href);
  }, [editing, navigate]);

  let body: ReactNode;
  if (state.error) {
    body = showErr ? <ErrorBox error={state.error} name={def.name} /> : null;
  } else if (state.html === null) {
    body = <SkeletonRows rows={2} className="h-20" />;
  } else if (hasJs) {
    body = <SandboxFrame html={state.html} css={def.css} js={def.js} minHeight={editing ? 120 : 40} title={def.name} />;
  } else {
    body = (
      <div data-module={id} data-module-key={def.key} className="site-module" onClick={onClick} style={state.busy ? { opacity: 0.85 } : undefined}>
        {css && <style>{css}</style>}
        <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
      </div>
    );
  }
  if (body === null) return null;
  const router = inRouter && !editing ? <RouterNavigate onReady={onRouterReady} /> : null;
  return wrap ? (
    <BlockSection tone={tone} pad={pad} width={width} anchor={anchor}>{router}{body}</BlockSection>
  ) : (
    <>{router}{body}</>
  );
}

/* ── The Puck block ─────────────────────────────────────────────────────── */

function CustomModuleView(p: Record<string, unknown>) {
  const rt = useSiteRuntime();
  const editing = rt.mode === 'editor';
  const key = typeof p.moduleKey === 'string' ? p.moduleKey : '';
  const pin = Number(p.version) > 0 ? Math.floor(Number(p.version)) : null;
  const { defs, loading } = useModuleDefs();
  const latest = defs.find((d) => d.key === key);
  const needPinned = Boolean(key && pin && latest && latest.version !== pin);
  const pinnedQ = useSiteData(['module-version', key, pin], (id, api) => api.moduleVersion(id, key, pin as number), { enabled: needPinned, staleTime: 10 * 60_000 });
  const def = needPinned ? pinnedQ.data ?? null : latest ?? null;
  const section = { wrap: p.wrap !== false, tone: p.tone as SectionProps['tone'], pad: p.pad as SectionProps['pad'], width: p.width as SectionProps['width'], anchor: p.anchor as string | undefined };

  if (!key) return editing ? <EditorHint icon={<Blocks size={28} />} title="Choose a module in the settings panel." hint="Create and publish modules in Website Builder → Modules." /> : null;
  if (loading || (needPinned && pinnedQ.isLoading)) return <SkeletonRows rows={2} className="h-20" />;
  if (!def) return editing ? <EditorHint icon={<Blocks size={28} />} title={`Module “${key}” is not published.`} hint="Publish it in Website Builder → Modules, or pick another module." /> : null;
  return <ModuleRenderer def={def} values={p.values as Rec} instanceId={String(p.id || `m-${key}`)} {...section} />;
}

const modulePickerField: CustomField<string | undefined> = {
  type: 'custom',
  label: 'Module',
  render: ({ value, onChange, readOnly }) => {
    const list = editorModuleList();
    return (
      <select aria-label="Module" className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900" disabled={readOnly} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— choose a module —</option>
        {value && !list.some((m) => m.key === value) && <option value={value}>{value} (not published)</option>}
        {list.map((m) => <option key={m.key} value={m.key}>{m.name}{m.version ? ` · v${m.version}` : ''}</option>)}
      </select>
    );
  },
};

const BASE_FIELDS: Record<string, Field> = {
  moduleKey: modulePickerField as Field,
  values: { type: 'object', label: 'Module fields', objectFields: {} } as Field,
  version: { type: 'number', label: 'Pin to version (empty = always the latest published)', min: 0 } as Field,
  wrap: yesNo('Wrap in a page section (container + spacing)'),
  ...sectionFields,
};

function fieldsFor(moduleKey: unknown, fields: Record<string, Field>, lang: 'en' | 'bn' = 'en'): Record<string, Field> {
  const def = getEditorModule(moduleKey);
  const out: Record<string, Field> = { ...fields };
  out.values = { type: 'object', label: def ? def.name : 'Module fields', objectFields: def ? moduleFieldsToPuck(def.fields, DEFAULT_CONTROLS, lang) : {} } as Field;
  return out;
}

export const CustomModule: SiteBlock = {
  label: 'Custom module',
  fields: BASE_FIELDS,
  defaultProps: { moduleKey: '', values: {}, version: undefined, wrap: true, ...sectionDefaults },
  resolveFields: (data, { fields }) => {
    const out = fieldsFor(data.props.moduleKey, fields as Record<string, Field>);
    if (data.props.wrap === false) for (const k of ['tone', 'pad', 'width', 'anchor']) delete out[k];
    return out as typeof fields;
  },
  resolveData: (data, { changed }) => {
    if (!changed.moduleKey) return data;
    const def = getEditorModule(data.props.moduleKey);
    if (!def) return data;
    const current = (data.props.values && typeof data.props.values === 'object' ? data.props.values : {}) as Rec;
    const defaults = defaultValues(def.fields);
    const kept = Object.fromEntries(Object.entries(current).filter(([k]) => k in defaults));
    return { ...data, props: { ...data.props, values: { ...defaults, ...kept } } };
  },
  render: (p) => <CustomModuleView {...(p as Record<string, unknown>)} />,
} as SiteBlock;

/**
 * One palette entry per published module ("My modules"). `base` is the
 * makeBindable-wrapped CustomModule, so entries get ⚡ / visibility too.
 */
export function modulePaletteComponents(defs: ModuleDef[], base: SiteBlock, lang: 'en' | 'bn' = 'en'): Record<string, ComponentConfig> {
  const out: Record<string, ComponentConfig> = {};
  for (const d of defs) {
    out[moduleAliasType(d.key)] = {
      ...base,
      label: (lang === 'bn' && d.nameBn) || d.name,
      defaultProps: { ...(base.defaultProps ?? {}), moduleKey: d.key, values: defaultValues(d.fields) },
    } as ComponentConfig;
  }
  return out;
}

