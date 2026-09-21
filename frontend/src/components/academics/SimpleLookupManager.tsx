import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, Columns3, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { ConfirmModal } from '../common/ConfirmModal';
import { Button } from '../ui/Button';

interface LookupItem {
  id: string;
  name?: string;
  createdAt?: string;
  [key: string]: any;
}

interface SimpleLookupManagerProps {
  /** Human-readable label, e.g. "Medium" — used for headings, placeholders, and toasts. */
  title: string;
  /** REST base path, e.g. "/academics/mediums". POST hits this path directly; PUT/DELETE append "/:id". Also used for the list GET unless `listPath` is given. */
  apiBasePath: string;
  /** Override the list GET path when it differs from `apiBasePath` (e.g. a shared base path whose bare GET has different query requirements/shape). */
  listPath?: string;
  /**
   * Extracts the display name from a list item — override for endpoints whose
   * record shape doesn't use a plain `name` field. Defaults to `item.name`.
   */
  getDisplayName?: (item: LookupItem) => string;
}

/**
 * Replicates eSchool's "Manage Medium" layout: a left "Create X" form card
 * and a right "List X" card (search + refresh + column picker + a NO./NAME/
 * ACTION table + a "Showing X to Y of Z rows" footer). Reused as-is for
 * Medium/Stream/Shift/Semester/Subject management.
 */
export const SimpleLookupManager: React.FC<SimpleLookupManagerProps> = ({
  title,
  apiBasePath,
  listPath,
  getDisplayName,
}) => {
  const fetchPath = listPath || apiBasePath;
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<LookupItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [nameColumnVisible, setNameColumnVisible] = useState(true);

  const displayName = getDisplayName || ((item: LookupItem) => item.name ?? '');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(fetchPath);
      setItems(res.data?.data || []);
    } catch (err) {
      console.error(`Failed to fetch ${title.toLowerCase()} list`, err);
      toast.error(`Failed to load ${title.toLowerCase()} list`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPath]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
  };

  const handleEdit = (item: LookupItem) => {
    setEditingId(item.id);
    setName(displayName(item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await apiClient.put(`${apiBasePath}/${editingId}`, { name: name.trim() });
        toast.success(`${title} updated successfully`);
      } else {
        await apiClient.post(apiBasePath, { name: name.trim() });
        toast.success(`${title} created successfully`);
      }
      resetForm();
      fetchItems();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to save ${title.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`${apiBasePath}/${itemToDelete.id}`);
      toast.success(`${title} deleted successfully`);
      if (editingId === itemToDelete.id) resetForm();
      setItemToDelete(null);
      fetchItems();
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to delete ${title.toLowerCase()}`);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = items.filter((item) =>
    displayName(item).toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Left: Create/Edit form */}
      <div className="glass-card p-6 rounded-2xl lg:col-span-1 space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          {editingId ? `Edit ${title}` : `Create ${title}`}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="lookup-name" className="text-sm font-medium text-slate-700 dark:text-slate-400">
              Name<span className="text-red-500 ml-1">*</span>
            </label>
            <input
              id="lookup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder={`Enter ${title.toLowerCase()} name`}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" isLoading={saving} className="w-full justify-center">
              {editingId ? 'Update' : 'Submit'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Right: List */}
      <div className="glass-card p-6 rounded-2xl lg:col-span-2 space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">List {title}</h3>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              aria-label={`Search ${title.toLowerCase()}`}
              className="input-field pl-10 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={fetchItems}
            title="Refresh"
            aria-label="Refresh list"
            className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowColumnPicker((v) => !v)}
              title="Columns"
              aria-label="Toggle column visibility"
              className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <Columns3 className="w-4 h-4" />
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-900 shadow-lg p-2 z-10">
                <label className="flex items-center gap-2 text-sm px-2 py-1.5 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={nameColumnVisible}
                    onChange={(e) => setNameColumnVisible(e.target.checked)}
                    className="rounded-sm"
                  />
                  Name
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
          <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium w-16">No.</th>
                {nameColumnVisible && <th className="px-4 py-3 font-medium">Name</th>}
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">No {title.toLowerCase()} records found.</td>
                </tr>
              ) : (
                filtered.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">{index + 1}</td>
                    {nameColumnVisible && (
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{displayName(item)}</td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          title={`Edit ${displayName(item)}`}
                          aria-label={`Edit ${displayName(item)}`}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setItemToDelete(item)}
                          title={`Delete ${displayName(item)}`}
                          aria-label={`Delete ${displayName(item)}`}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing {filtered.length > 0 ? 1 : 0} to {filtered.length} of {items.length} rows
          </p>
        )}
      </div>

      <ConfirmModal
        isOpen={!!itemToDelete}
        title={`Delete ${title}`}
        message={`Delete "${itemToDelete ? displayName(itemToDelete) : ''}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};

export default SimpleLookupManager;
