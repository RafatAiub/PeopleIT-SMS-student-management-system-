import React, { useState, useMemo } from 'react';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, Eye, Edit, Trash2,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  accessor?: keyof T;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
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
}

type SortDirection = 'asc' | 'desc' | null;

const SKELETON_ROWS = 5;

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded shimmer-bg" style={{ width: `${60 + Math.random() * 30}%` }} />
        </td>
      ))}
    </tr>
  );
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
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir(null); }
  };

  const handleSearch = (val: string) => {
    setQuery(val);
    setPage(1);
    if (serverSearch) onSearch?.(val);
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

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return <ChevronsUpDown className="w-3.5 h-3.5 text-slate-600" />;
    if (sortDir === 'asc') return <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />;
    return <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />;
  };

  const getActionIcon = (icon?: 'view' | 'edit' | 'delete') => {
    if (icon === 'view') return <Eye className="w-4 h-4" />;
    if (icon === 'edit') return <Edit className="w-4 h-4" />;
    if (icon === 'delete') return <Trash2 className="w-4 h-4" />;
    return null;
  };

  const allCols = columns.length + (selectable ? 1 : 0) + (actions?.length ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="datatable-search"
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="input-field pl-10 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">Show</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white appearance-none"
          >
            {[10, 25, 50].map((s) => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/3">
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={paginated.length > 0 && paginated.every((r) => selected.has(r.id))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 accent-indigo-500"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="table-header"
                  style={{ width: col.width }}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1.5">
                    {col.header}
                    {col.sortable !== false && getSortIcon(col.key)}
                  </span>
                </th>
              ))}
              {actions && actions.length > 0 && (
                <th className="table-header text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <SkeletonRow key={i} cols={allCols} />
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={allCols}>
                  <EmptyState
                    title={emptyTitle || 'No results found'}
                    description={emptyDescription || 'Try adjusting your search or filters.'}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              paginated.map((row, rowIdx) => (
                <tr
                  key={row.id}
                  className={`border-b border-white/5 transition-colors hover:bg-white/3 ${
                    rowIdx % 2 === 1 ? 'bg-white/[0.02]' : ''
                  } ${selected.has(row.id) ? 'bg-indigo-500/5' : ''}`}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 accent-indigo-500"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="table-cell">
                      {col.render
                        ? col.render(row)
                        : col.accessor
                        ? String(row[col.accessor] ?? '')
                        : null}
                    </td>
                  ))}
                  {actions && actions.length > 0 && (
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {actions.map((action, ai) => (
                          <button
                            key={ai}
                            id={`action-${action.label.toLowerCase().replace(' ', '-')}-${row.id}`}
                            onClick={() => action.onClick(row)}
                            title={action.label}
                            className={`p-1.5 rounded-lg transition-colors ${
                              action.variant === 'danger'
                                ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                                : 'text-slate-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {getActionIcon(action.icon)}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!isLoading && paginated.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length} results
          </span>
          <div className="flex items-center gap-1">
            <button
              id="datatable-prev"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                  key={p}
                  id={`datatable-page-${p}`}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    page === p
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              id="datatable-next"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
