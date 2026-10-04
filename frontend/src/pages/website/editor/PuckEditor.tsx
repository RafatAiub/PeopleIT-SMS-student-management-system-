import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Puck, createUsePuck, useGetPuck, type ComponentData, type Config, type Data, type Field } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { siteConfig, BLOCK_CATEGORIES, SITE_COMPONENTS } from '@/site/config';
import { modulePaletteComponents } from '@/site/modules/CustomModule';
import { normaliseModuleTypes, setEditorModules } from '@/site/modules/registry';
import { moduleAliasType, type ModuleDef } from '@/site/modules/types';
import { useLocale } from '@/i18n';
import { useSiteData, useSiteRuntime } from '@/site/runtime';
import { PageScope } from '@/site/scopeContext';
import { isBindSpec, withBinding, type BindMap, type BindSpec, type Rec } from '@/site/binding';
import { decorateItem } from '@/site/blocks/collection-list';
import { detectIncludes, nestedMeta, publicCollections, type CollectionMeta } from '@/site/collections';
import { bindFieldOverrides } from '@/site/editor/BindControl';
import { EditorBindContext, EditorDataContext, type EditorBindValue, type ScopeCollections } from '@/site/editor/bindContext';
import type { SiteComponentData } from '@/site/types';

// This module is lazy-loaded by PageEditor so the Puck bundle and its CSS are
// only downloaded when someone opens the editor.

const usePuck = createUsePuck();

/** What the page being edited is: a normal page, or the template of one collection. */
interface Env {
  collections: CollectionMeta[];
  pageCollection: CollectionMeta | null;
}

/**
 * siteConfig with the block palette grouped by BLOCK_CATEGORIES, titled in the
 * dashboard language, plus one "My modules" entry per published custom module
 * (alias types, normalised to CustomModule on change — see modules/registry.ts).
 */
function editorConfigFor(lang: string, sampleField: Field | null, modules: ModuleDef[]): Config {
  const moduleEntries = modulePaletteComponents(modules, SITE_COMPONENTS.CustomModule, lang === 'bn' ? 'bn' : 'en');
  return {
    ...siteConfig,
    components: { ...siteConfig.components, ...moduleEntries },
    categories: Object.fromEntries(
      BLOCK_CATEGORIES.map((c) => [
        c.key,
        {
          title: lang === 'bn' ? c.titleBn : c.title,
          components: c.key === 'modules' ? [...modules.map((m) => moduleAliasType(m.key)), ...c.components] : (c.components as string[]),
          defaultExpanded: true,
        },
      ])
    ),
    // Template pages get a "Preview with item" picker in the page (root) settings.
    root: sampleField ? { ...siteConfig.root, fields: { _sample: sampleField } } : siteConfig.root,
  };
}

const VIEWPORTS = [
  { width: 1280, height: 'auto' as const, label: 'Desktop', icon: 'Monitor' as const },
  { width: 768, height: 'auto' as const, label: 'Tablet', icon: 'Tablet' as const },
  { width: 360, height: 'auto' as const, label: 'Mobile', icon: 'Smartphone' as const },
];

export interface PuckEditorProps {
  data: Data;
  headerTitle: string;
  onChange: (data: Data) => void;
  /** Rendered in Puck's header in place of its default Publish button. */
  actions: React.ReactNode;
  /** Set for collection TEMPLATE pages: the collection whose item the page shows. */
  collectionKey?: string | null;
}

/* ── Scope resolution: which collection is `item` / `parent` for the selected block? ── */

function collectionForList(list: ComponentData, owner: CollectionMeta | null, all: CollectionMeta[]): CollectionMeta | null {
  const p = list.props as Rec;
  if (p.sourceKind === 'relation') {
    const rel = owner?.relations.find((r) => r.key === p.relation);
    if (!rel || !owner) return null;
    return rel.collection ? all.find((c) => c.key === rel.collection) ?? null : nestedMeta(owner.key, rel.key, rel.label);
  }
  return all.find((c) => c.key === p.collection) ?? null;
}

/** `lists`: the CollectionList ancestors of a block, outermost first. */
export function scopeCollections(lists: ComponentData[], page: CollectionMeta | null, all: CollectionMeta[]): ScopeCollections {
  let cur = page;
  let prev: CollectionMeta | null = null;
  for (const l of lists) {
    prev = cur;
    cur = collectionForList(l, cur, all);
  }
  return { item: cur, parent: lists.length ? prev : null, page };
}

/* ── Editor providers (inside <Puck>, where usePuck works) ───────────────── */

function PageSample({ env, children }: { env: Env; children: React.ReactNode }) {
  const rt = useSiteRuntime();
  const content = usePuck((s) => s.appState.data.content);
  const sampleSlug = usePuck((s) => ((s.appState.data.root as { props?: { _sample?: { slug?: string } } })?.props?._sample?.slug) ?? '');
  const key = env.pageCollection?.key ?? '';
  const relationKeys = React.useMemo(() => env.pageCollection?.relations.map((r) => r.key) ?? [], [env.pageCollection]);
  const include = React.useMemo(() => detectIncludes(content, relationKeys), [content, relationKeys]).join(',');
  const mode = rt.previewToken ? 'preview' : 'live';
  // No sample chosen yet: preview with the collection's first item so the page is never blank.
  const firstQ = useQuery({
    queryKey: ['site-public', rt.siteId, mode, 'collection-first', key],
    queryFn: () => rt.api.collectionItems(rt.siteId as string, key, { pageSize: 1 }),
    enabled: Boolean(rt.siteId && key && !sampleSlug),
    staleTime: 60_000,
  });
  const slug = sampleSlug || firstQ.data?.items[0]?.slug || '';
  const itemQ = useQuery({
    queryKey: ['site-public', rt.siteId, mode, 'collection-item', key, slug, include],
    queryFn: () => rt.api.collectionItem(rt.siteId as string, key, slug, { include: include ? include.split(',') : [] }),
    enabled: Boolean(rt.siteId && key && slug),
    staleTime: 60_000,
    retry: 0,
  });
  const record = React.useMemo(() => (itemQ.data ? decorateItem(itemQ.data.item, env.pageCollection ?? undefined, 0) : null), [itemQ.data, env.pageCollection]);
  return <PageScope record={record}>{children}</PageScope>;
}

function BindProvider({ env, children }: { env: Env; children: React.ReactNode }) {
  const getPuck = useGetPuck();
  const content = usePuck((s) => s.appState.data.content);
  const selected = usePuck((s) => s.selectedItem);
  const value = React.useMemo<EditorBindValue>(() => {
    const ancestors = (): ComponentData[] => {
      const chain: ComponentData[] = [];
      try {
        const api = getPuck();
        let id = api.selectedItem?.props?.id as string | undefined;
        for (let guard = 0; id && guard < 24; guard++) {
          const parent = api.getParentById(id);
          if (!parent) break;
          chain.push(parent);
          id = parent.props?.id as string | undefined;
        }
      } catch { /* selection changed mid-read */ }
      return chain;
    };
    return {
      collections: env.collections,
      version: 0,
      scopeForSelected: () => scopeCollections(ancestors().filter((c) => c.type === 'CollectionList').reverse(), env.pageCollection, env.collections),
      selectedProps: () => {
        const it = getPuck().selectedItem;
        return it ? (it.props as Rec) : null;
      },
      bindings: () => {
        const raw = getPuck().selectedItem?.props?._bind;
        const out: Record<string, BindSpec> = {};
        if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw as Rec)) if (isBindSpec(v)) out[k] = v;
        return out;
      },
      setBinding: (propPath, spec) => {
        const api = getPuck();
        const item = api.selectedItem;
        const id = item?.props?.id as string | undefined;
        if (!item || !id) return;
        const sel = api.getSelectorForId(id);
        if (!sel) return;
        const next: BindMap | undefined = withBinding(item.props._bind, propPath, spec);
        const props: Rec = { ...item.props };
        if (next) props._bind = next;
        else delete props._bind;
        api.dispatch({ type: 'replace', destinationIndex: sel.index, destinationZone: sel.zone, data: { ...item, props } as ComponentData });
      },
    };
    // `selected` is a dependency on purpose: the picker UIs re-read the selection / `_bind` when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, getPuck, selected]);
  const data = React.useMemo(() => ({ content: content as unknown as SiteComponentData[] }), [content]);
  return (
    <EditorBindContext.Provider value={value}>
      <EditorDataContext.Provider value={data}>{children}</EditorDataContext.Provider>
    </EditorBindContext.Provider>
  );
}

// Stable override components that read the (changing) values from context,
// so Puck never remounts the header buttons (which would drop focus).
const ActionsContext = React.createContext<React.ReactNode>(null);
const HeaderActions = () => <>{React.useContext(ActionsContext)}</>;
const EnvContext = React.createContext<Env>({ collections: [], pageCollection: null });
const PuckShell = ({ children }: { children: React.ReactNode }) => {
  const env = React.useContext(EnvContext);
  const inner = <BindProvider env={env}>{children}</BindProvider>;
  return env.pageCollection ? <PageSample env={env}>{inner}</PageSample> : inner;
};
const OVERRIDES = { headerActions: HeaderActions, puck: PuckShell, fieldTypes: bindFieldOverrides };
const IFRAME = { enabled: true, waitForStyles: true };

const NO_MODULES: ModuleDef[] = [];

export default function PuckEditor(props: PuckEditorProps) {
  // Custom modules must be known before Puck mounts (a config change resets the editor).
  const modulesQ = useSiteData(['modules'], (id, api) => api.modules(id), { staleTime: 2 * 60_000 });
  if (modulesQ.connected && modulesQ.isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500" aria-busy="true">Loading blocks…</div>;
  }
  return <PuckEditorInner {...props} modules={modulesQ.data ?? NO_MODULES} />;
}

function PuckEditorInner({ data, headerTitle, onChange, actions, collectionKey, modules }: PuckEditorProps & { modules: ModuleDef[] }) {
  const { lang } = useLocale();
  const rt = useSiteRuntime();
  // Read by CustomModule.resolveFields (outside React) to build each module's form.
  setEditorModules(modules);
  // Palette aliases (CustomModule__<key>) never reach the saved page.
  const handleChange = React.useCallback((d: Data) => onChange(normaliseModuleTypes(d)), [onChange]);
  const registry = useSiteData(['collections'], (id, api) => api.collections(id), { staleTime: 5 * 60_000 });
  const collections = React.useMemo(() => publicCollections(registry.data), [registry.data]);
  const pageCollection = React.useMemo(() => (collectionKey ? collections.find((c) => c.key === collectionKey) ?? null : null), [collectionKey, collections]);
  const env = React.useMemo<Env>(() => ({ collections, pageCollection }), [collections, pageCollection]);

  const { api, siteId } = rt;
  // Read through a ref so a late registry load doesn't swap the config (which would reset Puck).
  const titleFieldRef = React.useRef('name');
  titleFieldRef.current = pageCollection?.titleField ?? 'name';
  const sampleField = React.useMemo<Field | null>(() => {
    if (!collectionKey || !siteId) return null;
    return {
      type: 'external',
      label: 'Preview with item',
      placeholder: 'Choose an item to preview',
      showSearch: true,
      fetchList: async ({ query }: { query: string }) => (await api.collectionItems(siteId, collectionKey, { pageSize: 20, ...(query ? { q: query } : {}) })).items,
      mapProp: (item: Rec) => ({ slug: String(item.slug ?? ''), title: String(item[titleFieldRef.current] ?? item.slug ?? '') }),
      getItemSummary: (item: { slug?: string; title?: string }) => item.title || item.slug || 'Item',
    } as Field;
  }, [api, siteId, collectionKey]);

  const config = React.useMemo(() => editorConfigFor(lang, sampleField, modules), [lang, sampleField, modules]);
  return (
    <ActionsContext.Provider value={actions}>
      <EnvContext.Provider value={env}>
        <Puck
          config={config}
          data={data}
          onChange={handleChange}
          headerTitle={headerTitle}
          viewports={VIEWPORTS}
          overrides={OVERRIDES}
          iframe={IFRAME}
          height="100%"
        />
      </EnvContext.Provider>
    </ActionsContext.Provider>
  );
}
