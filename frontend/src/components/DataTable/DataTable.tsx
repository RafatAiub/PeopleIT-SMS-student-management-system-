import React, { useState, useMemo } from 'react';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, Eye, Edit, Trash2, Columns3, Download, X,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { Dropdown } from '@/components/ui/Dropdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useT, formatNumber } from '@/i18n';

export interface Column<T> {
  key: string;
  header: string;
  accessor?: keyof T;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  /** Mobile card: use this column as the card title. Defaults to the first column. */
  primary?: boolean;
  /** Hide this column in the mobile card layout. */
  hideOnMobile?: boolean;
  /** Start hidden (user can re-enable from the Columns menu). */
  defaultHidden?: boolean;
  /** Value written to CSV/Excel. Defaults to the accessor value. */
  exportValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
}

export interface RowAction<T> {
  label: string;
  icon?: 'view' | 'edit' | 'delete';
  onClick: (row: T) => void;
  variant?: 'default' | 'danger';
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  actions?: RowAction<T>[];
  searchPlaceholder?: string;
  isLoading?: boolean;
  onSearch?: (query: string) => void;
  serverSearch?: boolean;
  pageSize?: number;
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /**
   * When set, `data` is treated as already being just the current page's
   * rows (fetched from the API), and pagination controls drive the caller's
   * own fetch instead of slicing `data` client-side. Requires `totalCount`,
   * `page`, and `onPageChange`; `onPageSizeChange` is optional but expected
   * alongside a caller-controlled `pageSize`. Sorting/search still operate
   * only on the current page's rows unless the caller also wires
   * `onSearch`/`serverSearch`.
   */
  serverPagination?: boolean;
  totalCount?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Enables the Export menu (CSV / Excel) for the rows currently in view. */
  exportFileName?: string;
  /** Rendered in a sticky bar when rows are selected (requires `selectable`). */
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  /** Extra controls (filters) placed in the toolbar next to search. */
  toolbar?: React.ReactNode;
  /** Card layout below the md breakpoint (default true). */
  mobileCards?: boolean;
  /** Show the Columns visibility menu (default: when there are more than 4 columns). */
  columnToggle?: boolean;
  /** Row click (e.g. open a quick-view drawer). */
  onRowClick?: (row: T) => void;
  /** Accessible table caption (visually hidden). */
  caption?: string;
}

type SortDirection = 'asc' | 'desc' | null;

const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ['72%', '58%', '84%', '66%', '76%'];

function cellText<T>(row: T, col: Column<T>): string {
  if (col.exportValue) return String(col.exportValue(row) ?? '');
  if (col.accessor) return String(row[col.accessor] ?? '');
  return '';
}

async function exportRows<T>(rows: T[], cols: Column<T>[], fileName: string, kind: 'csv' | 'xlsx') {
  const exportable = cols.filter((c) => c.accessor || c.exportValue);
  const header = exportable.map((c) => c.header);
  const body = rows.map((r) => exportable.map((c) => cellText(r, c)));
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'csv') {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...body].map((line) => line.map(esc).join(',')).join('\r\n');
    // BOM so Excel opens Bangla text as UTF-8
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  // xlsx is loaded on demand so it stays out of every table's bundle.
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`);
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  actions,
  searchPlaceholder = 'Search...',
  isLoading = false,
  onSearch,
  serverSearch = false,
  pageSize: defaultPageSize = 10,
  selectable = false,
  onSelectionChange,
  emptyTitle,
  emptyDescription,
  emptyAction,
  serverPagination = false,
  totalCount,
  page: controlledPage,
  onPageChange,
  onPageSizeChange,
  exportFileName,
  bulkActions,
  toolbar,
  mobileCards = true,
  columnToggle,
  onRowClick,
  caption,
}: DataTableProps<T>) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(defaultPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)));

  const page = serverPagination ? (controlledPage ?? 1) : internalPage;
  const pageSize = serverPagination ? defaultPageSize : internalPageSize;
  const setPage = (updater: (p: number) => number) => {
    if (serverPagination) {
      onPageChange?.(updater(page));
    } else {
      setInternalPage(updater);
    }
  };

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);

  // Client-side filtering
  const filtered = useMemo(() => {
    if (serverSearch || !query) return data;
    const q = query.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (col.accessor) {
          const val = row[col.accessor];
          return String(val ?? '').toLowerCase().includes(q);
        }
        return false;
      })
    );
  }, [data, query, columns, serverSearch]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const col = columns.find((c) => c.key === sortKey);
      if (!col?.accessor) return 0;
      const av = String(a[col.accessor] ?? '');
      const bv = String(b[col.accessor] ?? '');
      const cmp = av.localeCompare(bv, 'bn', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  // Paginate — server-paginated tables treat `data` as already the current
  // page's rows; client-paginated tables slice the full sorted set.
  const effectiveTotal = serverPagination ? (totalCount ?? sorted.length) : sorted.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const paginated = serverPagination ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir(null); }
  };

  const handleSearch = (val: string) => {
    setQuery(val);
    setPage(() => 1);
    if (serverSearch) onSearch?.(val);
  };

  const handlePageSizeChange = (val: number) => {
    if (serverPagination) {
      onPageSizeChange?.(val);
    } else {
      setInternalPageSize(val);
    }
    setPage(() => 1);
  };

  const handleSelectAll = (checked: boolean) => {
    const newSet = checked ? new Set(paginated.map((r) => r.id)) : new Set<string>();
    setSelected(newSet);
    onSelectionChange?.(checked ? paginated : []);
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSet = new Set(selected);
    if (checked) newSet.add(id); else newSet.delete(id);
    setSelected(newSet);
    onSelectionChange?.(data.filter((r) => newSet.has(r.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
    onSelectionChange?.([]);
  };

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" aria-hidden />;
    if (sortDir === 'asc') return <ChevronUp className="w-3.5 h-3.5 text-primary-600 dark:text-primary-300" aria-hidden />;
    return <ChevronDown className="w-3.5 h-3.5 text-primary-600 dark:text-primary-300" aria-hidden />;
  };

  const getActionIcon = (icon?: 'view' | 'edit' | 'delete') => {
    if (icon === 'view') return <Eye className="w-4 h-4" />;
    if (icon === 'edit') return <Edit className="w-4 h-4" />;
    if (icon === 'delete') return <Trash2 className="w-4 h-4" />;
    return null;
  };

  const renderCell = (row: T, col: Column<T>) =>
    col.render ? col.render(row) : col.accessor ? String(row[col.accessor] ?? '') : null;

  const renderActions = (row: T, compact = false) =>
    actions && actions.length > 0 ? (
      <div className={cn('flex items-center gap-0.5', compact ? '' : 'justify-end')} onClick={(e) => e.stopPropagation()}>
        {actions.map((action, ai) => (
          <button
            key={ai}
            type="button"
            id={`action-${action.label.toLowerCase().replace(' ', '-')}-${row.id}${compact ? '-m' : ''}`}
            onClick={() => action.onClick(row)}
            title={action.label}
            aria-label={action.label}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg transition-colors',
              compact ? 'px-2.5 py-1.5 text-xs font-medium' : 'p-1.5',
              action.variant === 'danger'
                ? 'text-slate-500 hover:text-red-700 dark:text-slate-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
            )}
          >
            {getActionIcon(action.icon)}
            {(compact || !action.icon) && action.label}
          </button>
        ))}
      </div>
    ) : null;

  const allCols = visibleColumns.length + (selectable ? 1 : 0) + (actions?.length ? 1 : 0);
  const showColumnToggle = columnToggle ?? columns.length > 4;
  const primaryCol = visibleColumns.find((c) => c.primary) ?? visibleColumns[0];
  const selectedRows = data.filter((r) => selected.has(r.id));

  // A small, fully client-side table (no server search/pagination, and
  // everything already fits on one page) has nothing for search or a page
  // size selector to do — showing them just reads as unfinished UI.
  const needsListControls = serverSearch || serverPagination || data.length > pageSize;
  const showToolbar = needsListControls || !!toolbar || showColumnToggle || !!exportFileName;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {needsListControls && (
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
              <input
                id="datatable-search"
                type="search"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="input-field pl-9"
              />
            </div>
          )}
          {toolbar}
          <div className="flex items-center gap-2 ml-auto">
            {showColumnToggle && (
              <Dropdown
                width="w-52"
                trigger={(p) => (
                  <button {...p} type="button" className="btn-secondary h-10 px-3 hidden md:inline-flex" aria-label={t('Columns')}>
                    <Columns3 className="w-4 h-4" />
                    <span className="hidden lg:inline">{t('Columns')}</span>
                  </button>
                )}
                sections={[
                  {
                    label: t('Columns'),
                    items: columns.map((c) => ({
                      id: c.key,
                      label: c.header,
                      selected: !hidden.has(c.key),
                      onSelect: () =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.key)) next.delete(c.key);
                          else if (columns.length - next.size > 1) next.add(c.key);
                          return next;
                        }),
                    })),
                  },
                ]}
              />
            )}
            {exportFileName && (
              <Dropdown
                width="w-56"
                trigger={(p) => (
                  <button {...p} type="button" className="btn-secondary h-10 px-3" aria-label={t('Export')}>
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('Export')}</span>
                  </button>
                )}
                sections={[
                  {
                    label: serverPagination ? 'Rows on this page' : 'Rows matching filters',
                    items: [
                      { id: 'csv', label: 'CSV (.csv)', onSelect: () => exportRows(sorted, visibleColumns, exportFileName, 'csv') },
                      { id: 'xlsx', label: 'Excel (.xlsx)', onSelect: () => exportRows(sorted, visibleColumns, exportFileName, 'xlsx') },
                      { id: 'print', label: 'Print / PDF', onSelect: () => window.print() },
                    ],
                  },
                ]}
              />
            )}
            {needsListControls && (
              <label className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {t('Show')}
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="input-field w-auto min-h-10 py-1.5 pr-8"
                >
                  {[10, 25, 50].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectable && bulkActions && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary-200 dark:border-primary-400/25 bg-primary-50 dark:bg-primary-500/10 px-3 py-2 animate-fadeIn">
          <span className="text-sm font-semibold text-primary-900 dark:text-primary-100">
            {t('{n} selected', { n: formatNumber(selectedRows.length) })}
          </span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions(selectedRows, clearSelection)}</div>
          <button type="button" onClick={clearSelection} className="ml-auto p-1 rounded text-primary-800 dark:text-primary-200 hover:bg-primary-100 dark:hover:bg-primary-500/20" aria-label={t('Clear selection')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mobile cards */}
      {mobileCards && (
        <div className="md:hidden flex flex-col gap-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-card p-4 space-y-2.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            ))
          ) : paginated.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                compact
                title={emptyTitle || t('No results found')}
                description={emptyDescription || t('Try adjusting your search or filters.')}
                action={emptyAction}
              />
            </div>
          ) : (
            paginated.map((row) => (
              <div
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'glass-card p-4',
                  onRowClick && 'cursor-pointer active:bg-slate-50 dark:active:bg-white/5',
                  selected.has(row.id) && 'ring-2 ring-primary-500/40'
                )}
              >
                <div className="flex items-start gap-3">
                  {selectable && (
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={selected.has(row.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                      className="mt-1 w-4 h-4 rounded accent-primary-600"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {primaryCol && (
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-50 wrap-break-word">{renderCell(row, primaryCol)}</div>
                    )}
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                      {visibleColumns
                        .filter((c) => c !== primaryCol && !c.hideOnMobile)
                        .map((col) => (
                          <div key={col.key} className="min-w-0">
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{col.header}</dt>
                            <dd className="text-sm text-slate-800 dark:text-slate-200 wrap-break-word">{renderCell(row, col)}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                </div>
                {actions && actions.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-white/5 -mx-1">{renderActions(row, true)}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Table */}
      <div className={cn('overflow-x-auto rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-slate-900 shadow-xs', mobileCards && 'hidden md:block')}>
        <table className="w-full">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-white/3">
              {selectable && (
                <th scope="col" className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={paginated.length > 0 && paginated.every((r) => selected.has(r.id))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-white/20 accent-primary-600 cursor-pointer"
                  />
                </th>
              )}
              {visibleColumns.map((col) => {
                const sortable = col.sortable !== false;
                const ariaSort = sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn('table-header', col.align === 'right' && 'text-right', col.align === 'center' && 'text-center')}
                    style={{ width: col.width }}
                    aria-sort={ariaSort}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1.5 uppercase tracking-wide hover:text-slate-800 dark:hover:text-white transition-colors',
                          col.align === 'right' && 'flex-row-reverse'
                        )}
                      >
                        {col.header}
                        {getSortIcon(col.key)}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
              {actions && actions.length > 0 && (
                <th scope="col" className="table-header text-right">{t('Actions')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                  {Array.from({ length: allCols }).map((__, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <Skeleton className="h-4" style={{ width: SKELETON_WIDTHS[(i + j) % SKELETON_WIDTHS.length] }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={allCols}>
                  <EmptyState
                    title={emptyTitle || t('No results found')}
                    description={emptyDescription || t('Try adjusting your search or filters.')}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-slate-100 dark:border-white/5 last:border-0 transition-colors duration-100 hover:bg-slate-50 dark:hover:bg-white/3',
                    onRowClick && 'cursor-pointer',
                    selected.has(row.id) && 'bg-primary-50/70 dark:bg-primary-500/10'
                  )}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected.has(row.id)}
                        onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-white/20 accent-primary-600 cursor-pointer"
                      />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td key={col.key} className={cn('table-cell', col.align === 'right' && 'text-right tabular-nums', col.align === 'center' && 'text-center')}>
                      {renderCell(row, col)}
                    </td>
                  ))}
                  {actions && actions.length > 0 && <td className="table-cell text-right">{renderActions(row)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!isLoading && paginated.length > 0 && needsListControls && (
        <nav aria-label="Pagination" className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 text-sm">
          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
            {t('Showing {from}–{to} of {total}', {
              from: formatNumber((page - 1) * pageSize + 1),
              to: formatNumber(Math.min(page * pageSize, effectiveTotal)),
              total: formatNumber(effectiveTotal),
            })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              id="datatable-prev"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label={t('Previous page')}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i + 1;
              if (totalPages > 5) {
                if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
              }
              return (
                <button
                  type="button"
                  key={p}
                  id={`datatable-page-${p}`}
                  onClick={() => setPage(() => p)}
                  aria-current={page === p ? 'page' : undefined}
                  className={cn(
                    'min-w-8 h-8 px-2 rounded-lg text-xs font-semibold tabular-nums transition-colors',
                    page === p
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                  )}
                >
                  {formatNumber(p)}
                </button>
              );
            })}
            <button
              type="button"
              id="datatable-next"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label={t('Next page')}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
