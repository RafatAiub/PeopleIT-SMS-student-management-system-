/**
 * CollectionList (W3) — the Webflow "collection list": query a school collection
 * (or iterate a relation of the current item), design ONE item with any blocks,
 * and it repeats for every result inside its own data scope (`item`, `parent`).
 *
 * Editor: Puck can render a slot only once, so item 1 is the editable template
 * and items 2..N are read-only copies drawn from the live page data
 * (`EditorDataContext`) by our own renderer — they update as you edit item 1.
 * Public: the (light) renderer's slot is called once per item.
 */
import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import type { Field } from '@puckeditor/core';
import { getPath, type Rec } from '../binding';
import {
  buildCollectionQuery, detectIncludes, FILTER_OP_LABEL, FILTER_OPS, itemPath, paramsKey, publicCollections,
  type CollectionFilterSpec, type CollectionItem, type CollectionMeta, type CollectionPage, type CollectionQuerySpec, type PaginateMode,
} from '../collections';
import { EditorDataContext } from '../editor/bindContext';
import { collectionPickerField, filterFieldPicker, relationPickerField, sortFieldPicker } from '../editor/pickers';
import { RenderBlocks } from '../render';
import { useSiteData, useSiteRuntime, useSiteText } from '../runtime';
import { ItemScope, useScope } from '../scopeContext';
import { findComponent } from '../tree';
import type { SiteComponentData } from '../types';
import {
  BlockSection, EditorHint, EmptyBlock, ErrorBlock, numberField, radioField, SkeletonRows, selectField, textField, yesNo,
  type SiteBlock, type SlotRender,
} from './shared';

const GAP_PX: Record<string, number> = { none: 0, sm: 8, md: 16, lg: 32 };
const colsField = (label: string) => selectField(label, [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']]);

const filtersField: Field = {
  type: 'array',
  label: 'Filters (all must match)',
  max: 10,
  arrayFields: {
    field: filterFieldPicker('Field'),
    op: selectField('Condition', FILTER_OPS.map((o) => [o, FILTER_OP_LABEL[o]] as [string, string])),
    source: selectField('Value comes from', [['literal', 'Typed value'], ['url', 'URL parameter (?name=)'], ['item', 'Field of the current item'], ['parent', 'Field of the parent item'], ['page', 'Field of this page’s record']]),
    value: textField('Value / URL parameter / field path', 'e.g. Science, dept, department'),
  },
  defaultItemProps: { field: '', op: 'eq', source: 'literal', value: '' },
  getItemSummary: (f: CollectionFilterSpec) => (f.field ? `${f.field} ${f.op} ${f.source && f.source !== 'literal' ? `${f.source}.` : ''}${f.value ?? ''}` : 'Filter'),
};

export const CollectionList: SiteBlock = {
  label: 'Collection list',
  fields: {
    sourceKind: radioField('List', [['collection', 'A collection'], ['relation', 'Related items of the current item']]),
    collection: collectionPickerField('Collection'),
    relation: relationPickerField('Related data'),
    filters: filtersField,
    sortField: sortFieldPicker('Sort by'),
    sortDir: radioField('Sort order', [['asc', 'A → Z / oldest first'], ['desc', 'Z → A / newest first']]),
    search: textField('Search text (optional)', 'e.g. {{url.q}}'),
    limit: numberField('How many (per page when paginated; 0 = default)', 0, 50),
    paginate: selectField('Pagination', [['none', 'None (show the first items)'], ['pages', 'Page numbers (Previous / Next)'], ['more', '“Load more” button']]),
    layout: selectField('Layout', [['grid', 'Grid'], ['list', 'List'], ['slider', 'Slider'], ['table', 'Table rows']]),
    colsSm: colsField('Columns on phone'),
    colsMd: colsField('Columns on tablet'),
    colsLg: colsField('Columns on desktop'),
    gap: selectField('Gap', [['none', 'None'], ['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
    wrap: yesNo('Wrap in a page section (container + spacing)'),
    tone: selectField('Section background', [['default', 'Page'], ['surface', 'Light surface'], ['soft', 'Brand tint'], ['dark', 'Dark']]),
    pad: selectField('Section spacing', [['none', 'None'], ['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']]),
    width: selectField('Section width', [['narrow', 'Narrow'], ['default', 'Standard'], ['wide', 'Wide'], ['full', 'Full width']]),
    item: { type: 'slot', label: 'Item design (repeats for every item)' },
    empty: { type: 'slot', label: 'When there are no items' },
  },
  defaultProps: {
    sourceKind: 'collection', collection: '', relation: '', filters: [], sortField: '', sortDir: 'asc', search: '', limit: 6, paginate: 'none',
    layout: 'grid', colsSm: '1', colsMd: '2', colsLg: '3', gap: 'md', wrap: true, tone: 'default', pad: 'md', width: 'default', item: [], empty: [],
  },
  resolveFields: (data, { fields }) => {
    const out = { ...fields } as Record<string, unknown>;
    const rel = data.props.sourceKind === 'relation';
    if (rel) for (const k of ['collection', 'filters', 'sortField', 'sortDir', 'search', 'paginate']) delete out[k];
    else delete out.relation;
    if (data.props.layout === 'list' || data.props.layout === 'table') for (const k of ['colsSm', 'colsMd', 'colsLg']) delete out[k];
    if (data.props.wrap === false) for (const k of ['tone', 'pad', 'width']) delete out[k];
    return out as typeof fields;
  },
  render: (p) => <CollectionListView {...p} />,
};

/* ── Data ───────────────────────────────────────────────────────────────── */

function asRecords(v: unknown): Rec[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object') as Rec[];
  return v && typeof v === 'object' ? [v as Rec] : [];
}

/** Adds the computed `_url` (profile page link) and `_index` (1-based) the picker offers. */
export function decorateItem(item: Rec, meta: Pick<CollectionMeta, 'routeBase' | 'key'> | undefined, index: number): Rec {
  const url = itemPath(meta, typeof item.slug === 'string' ? item.slug : undefined);
  return { ...item, ...(url ? { _url: url } : {}), ...(meta ? { _collection: meta.key } : {}), _index: index + 1 };
}

function useRegistry() {
  return useSiteData(['collections'], (id, api) => api.collections(id), { staleTime: 5 * 60_000 });
}

function slotContent(slot: unknown): SiteComponentData[] | undefined {
  const c = (slot as { content?: SiteComponentData[] } | undefined)?.content;
  return Array.isArray(c) ? c : undefined;
}

function CollectionListView(p: Record<string, any>) {
  const rt = useSiteRuntime();
  const { s } = useSiteText();
  const scope = useScope();
  const editorData = useContext(EditorDataContext);
  const editing = rt.mode === 'editor';
  const registry = useRegistry();
  const relationMode = p.sourceKind === 'relation';
  const all = useMemo(() => publicCollections(registry.data), [registry.data]);

  // Which collection do the items belong to? (for `_url` and relation includes)
  const ownerKey = typeof scope.item?._collection === 'string' ? scope.item._collection : undefined;
  const parentMeta = useMemo(() => {
    // Relation mode: the target collection of the relation, looked up via the enclosing item's collection.
    if (!relationMode) return undefined;
    const rel = all.find((c) => c.key === ownerKey)?.relations.find((r) => r.key === p.relation);
    return rel?.collection ? all.find((x) => x.key === rel.collection) : undefined;
  }, [all, relationMode, p.relation, ownerKey]);
  const meta = relationMode ? parentMeta : all.find((c) => c.key === p.collection);

  // Item-template blocks: from the live page data in the editor, from the slot function publicly.
  const ItemSlot = p.item as SlotRender | undefined;
  const EmptySlot = p.empty as SlotRender | undefined;
  const itemContent = useMemo<SiteComponentData[] | undefined>(() => {
    if (editing) {
      const self = findComponent({ content: editorData?.content }, String(p.id ?? ''));
      return Array.isArray(self?.props.item) ? (self!.props.item as SiteComponentData[]) : undefined;
    }
    return slotContent(p.item);
  }, [editing, editorData, p.id, p.item]);
  const emptyContent = useMemo<SiteComponentData[] | undefined>(() => {
    if (editing) {
      const self = findComponent({ content: editorData?.content }, String(p.id ?? ''));
      return Array.isArray(self?.props.empty) ? (self!.props.empty as SiteComponentData[]) : undefined;
    }
    return slotContent(p.empty);
  }, [editing, editorData, p.id, p.empty]);

  const paginate: PaginateMode = p.paginate === 'pages' || p.paginate === 'more' ? p.paginate : 'none';
  const [page, setPage] = useState(1);
  const spec: CollectionQuerySpec = useMemo(() => ({
    filters: Array.isArray(p.filters) ? p.filters : [],
    sortField: p.sortField || undefined,
    sortDir: p.sortDir === 'desc' ? 'desc' : 'asc',
    search: p.search || undefined,
    limit: Number(p.limit) || 0,
    paginate,
    include: meta && !relationMode ? detectIncludes(itemContent, meta.relations.map((r) => r.key)) : [],
  }), [p.filters, p.sortField, p.sortDir, p.search, p.limit, paginate, meta, relationMode, itemContent]);
  const baseParams = useMemo(() => buildCollectionQuery(spec, scope), [spec, scope]);
  const baseKey = paramsKey(baseParams);
  useEffect(() => setPage(1), [baseKey]);

  const key = relationMode ? '' : String(p.collection ?? '');
  const enabled = Boolean(rt.siteId) && !relationMode && Boolean(key) && registry.isSuccess;
  const mode = rt.previewToken ? 'preview' : 'live';
  const paged = useQuery<CollectionPage>({
    queryKey: ['site-public', rt.siteId, mode, 'collection', key, baseKey, page],
    queryFn: () => rt.api.collectionItems(rt.siteId as string, key, { ...baseParams, page }),
    enabled: enabled && paginate !== 'more',
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
  });
  const more = useInfiniteQuery<CollectionPage>({
    queryKey: ['site-public', rt.siteId, mode, 'collection-more', key, baseKey],
    queryFn: ({ pageParam }) => rt.api.collectionItems(rt.siteId as string, key, { ...baseParams, page: Number(pageParam) || 1 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled: enabled && paginate === 'more',
    staleTime: 60_000,
    retry: 1,
  });
  const q = paginate === 'more' ? more : paged;

  const rawItems: Rec[] = useMemo(() => {
    if (relationMode) {
      const rows = asRecords(getPath(scope.item, String(p.relation ?? '')));
      const lim = Number(p.limit) || 0;
      return lim > 0 ? rows.slice(0, lim) : rows;
    }
    if (paginate === 'more') return (more.data?.pages ?? []).flatMap((pg) => pg.items as CollectionItem[]);
    return (paged.data?.items ?? []) as CollectionItem[];
  }, [relationMode, scope.item, p.relation, p.limit, paginate, more.data, paged.data]);
  const items = useMemo(() => rawItems.map((it, i) => decorateItem(it, meta, i)), [rawItems, meta]);

  const wrapSection = p.wrap !== false;
  const shell = (body: ReactNode) => (wrapSection ? <BlockSection tone={p.tone} pad={p.pad} width={p.width}>{body}</BlockSection> : <>{body}</>);

  if (!rt.siteId) return shell(<EmptyBlock title={s('Live data appears once the site is connected.')} />);
  if (!relationMode && !key) return editing ? shell(<EditorHint icon={<Layers size={28} />} title={s('Choose a collection in the settings panel.')} />) : null;
  if (relationMode && !p.relation) return editing ? shell(<EditorHint icon={<Layers size={28} />} title={s('Choose a collection in the settings panel.')} />) : null;
  if (!relationMode && registry.isSuccess && !meta) return editing ? shell(<EditorHint icon={<Layers size={28} />} title={s('This collection is not available.')} />) : null;

  const loading = !relationMode && (registry.isLoading || (enabled && q.isLoading));
  const failed = !relationMode && (registry.isError || (enabled && q.isError));
  const gap = GAP_PX[p.gap as string] ?? 16;
  const layout = (['grid', 'list', 'slider', 'table'] as const).includes(p.layout) ? (p.layout as 'grid' | 'list' | 'slider' | 'table') : 'grid';
  const cols = { ['--c-sm' as string]: Number(p.colsSm) || 1, ['--c-md' as string]: Number(p.colsMd) || 2, ['--c-lg' as string]: Number(p.colsLg) || 3, ['--site-gap' as string]: `${gap}px` };
  const cellCls = layout === 'table' ? 'flex min-w-0 flex-row flex-wrap items-center gap-4' : 'flex min-w-0 flex-col gap-3';

  const cell = (it: Rec | null, i: number) => (
    <ItemScope key={typeof it?.slug === 'string' ? `${it.slug}-${i}` : i} item={it}>
      {editing && i > 0 ? (
        <div className={cellCls}><RenderBlocks content={itemContent} /></div>
      ) : typeof ItemSlot === 'function' ? (
        <ItemSlot className={cellCls} minEmptyHeight={editing ? 96 : undefined} />
      ) : null}
    </ItemScope>
  );

  let body: ReactNode;
  if (failed) {
    body = <ErrorBlock onRetry={() => { void registry.refetch(); void q.refetch(); }} />;
  } else if (loading) {
    body = <SkeletonRows rows={3} className="h-24" />;
  } else if (items.length === 0) {
    body = (
      <>
        {/* The editable item template stays visible in the editor even with no data. */}
        {editing && <div style={layout === 'grid' || layout === 'slider' ? undefined : { display: 'flex', flexDirection: 'column', gap }}>{cell(null, 0)}</div>}
        {editing ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-400 p-2">
            <p className="mb-1 text-xs font-medium opacity-70">{s('Shown when there are no items')}</p>
            {typeof EmptySlot === 'function' && <EmptySlot className="flex flex-col gap-3" minEmptyHeight={56} />}
          </div>
        ) : emptyContent && emptyContent.length > 0 && typeof EmptySlot === 'function' ? (
          <EmptySlot className="flex flex-col gap-3" />
        ) : (
          <EmptyBlock title={s('Nothing to show yet.')} />
        )}
      </>
    );
  } else {
    const cells = items.map((it, i) => cell(it, i));
    body = layout === 'grid' ? (
      <div className="site-cols" style={cols}>{cells}</div>
    ) : layout === 'slider' ? (
      <div className="site-slider" style={cols}>{cells}</div>
    ) : layout === 'table' ? (
      <div className="site-rows">{cells}</div>
    ) : (
      <div className="flex flex-col" style={{ gap }}>{cells}</div>
    );
  }

  const info = paged.data;
  const pager = !relationMode && paginate === 'pages' && info && info.totalPages > 1 && (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{s('Previous')}</button>
      <span className="site-muted text-sm">{s('Page {page} of {pages}', { page, pages: info.totalPages })}</span>
      <button type="button" className="site-btn site-btn-outline site-btn-sm" disabled={!info.hasNext} onClick={() => setPage(page + 1)}>{s('Next')}</button>
    </nav>
  );
  const loadMore = !relationMode && paginate === 'more' && more.hasNextPage && (
    <div className="mt-8 flex justify-center">
      <button type="button" className="site-btn site-btn-outline" disabled={more.isFetchingNextPage} onClick={() => void more.fetchNextPage()}>
        {more.isFetchingNextPage ? s('Loading…') : s('Load more')}
      </button>
    </div>
  );

  return shell(<>{body}{pager}{loadMore}</>);
}
