import React, { useState, useEffect, useRef } from 'react';
import { Plus, Image as ImageIcon, Video, GalleryHorizontal, GraduationCap, HelpCircle } from 'lucide-react';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';
import { DataTable, Column, RowAction } from '../../components/DataTable/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Badge } from '../../components/ui/Badge';

export type WebsiteItemType = 'SLIDER' | 'PHOTO' | 'VIDEO' | 'PROGRAM' | 'FAQ';

interface Item {
  id: string;
  title: string;
  description: string | null;
  mediaUrl: string | null;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface TypeConfig {
  heading: string;
  itemLabel: string;
  icon: React.ReactNode;
  titleLabel: string;
  descriptionLabel?: string;
  descriptionRequired?: boolean;
  media?: 'image' | 'video';
  mediaRequired?: boolean;
  showLink?: boolean;
}

const CONFIG: Record<WebsiteItemType, TypeConfig> = {
  SLIDER: { heading: 'Sliders', itemLabel: 'Slider', icon: <GalleryHorizontal className="w-5 h-5" />, titleLabel: 'Title', media: 'image', mediaRequired: true, showLink: true },
  PHOTO: { heading: 'Photos', itemLabel: 'Photo', icon: <ImageIcon className="w-5 h-5" />, titleLabel: 'Title', descriptionLabel: 'Description', media: 'image', mediaRequired: true },
  VIDEO: { heading: 'Videos', itemLabel: 'Video', icon: <Video className="w-5 h-5" />, titleLabel: 'Title', descriptionLabel: 'Description', media: 'video', mediaRequired: true },
  PROGRAM: { heading: 'Educational Program', itemLabel: 'Program', icon: <GraduationCap className="w-5 h-5" />, titleLabel: 'Title', descriptionLabel: 'Description', descriptionRequired: true, media: 'image' },
  FAQ: { heading: "FAQ's", itemLabel: 'FAQ', icon: <HelpCircle className="w-5 h-5" />, titleLabel: 'Question', descriptionLabel: 'Answer', descriptionRequired: true },
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const emptyForm = () => ({ title: '', description: '', mediaUrl: '', linkUrl: '', sortOrder: '0', isActive: true });

const compressImage = (file: File): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = Math.min(MAX / width, MAX / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve('');
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });

// Turns a YouTube watch/share link into an embeddable URL for the preview.
const toEmbedUrl = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
};

const WebsiteItemsManager: React.FC<{ type: WebsiteItemType }> = ({ type }) => {
  const cfg = CONFIG[type];
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/website-items', { params: { type } });
      setItems(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch items', error);
      toast.error(`Failed to load ${cfg.heading.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description || '',
      mediaUrl: item.mediaUrl || '',
      linkUrl: item.linkUrl || '',
      sortOrder: String(item.sortOrder),
      isActive: item.isActive,
    });
    setFormOpen(true);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    const dataUrl = await compressImage(file);
    if (!dataUrl) { toast.error('Could not read that image'); return; }
    if (dataUrl.length > MAX_IMAGE_BYTES * 1.4) { toast.error('Image is too large — please use a smaller one'); return; }
    setForm((p) => ({ ...p, mediaUrl: dataUrl }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error(`${cfg.titleLabel} is required`); return; }
    if (cfg.descriptionRequired && !form.description.trim()) { toast.error(`${cfg.descriptionLabel} is required`); return; }
    if (cfg.mediaRequired && !form.mediaUrl.trim()) { toast.error(cfg.media === 'video' ? 'Video URL is required' : 'Image is required'); return; }
    if (cfg.media === 'video' && form.mediaUrl.trim() && !/^https?:\/\//i.test(form.mediaUrl.trim())) {
      toast.error('Enter a valid video URL starting with http:// or https://');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        mediaUrl: form.mediaUrl.trim() || null,
        linkUrl: form.linkUrl.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (editing) await apiClient.put(`/website-items/${editing.id}`, payload);
      else await apiClient.post('/website-items', { ...payload, type });
      toast.success(editing ? 'Updated successfully' : 'Saved successfully');
      setFormOpen(false);
      fetchItems();
    } catch (error: any) {
      console.error('Failed to save item', error);
      toast.error(error.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/website-items/${deleteTarget.id}`);
      toast.success('Deleted successfully');
      setDeleteTarget(null);
      fetchItems();
    } catch (error: any) {
      console.error('Failed to delete item', error);
      toast.error(error.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = items.filter((i) =>
    `${i.title} ${i.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const columns: Column<Item>[] = [
    {
      key: 'no', header: 'No.', sortable: false, width: '60px',
      render: (row) => <span className="text-slate-500 dark:text-slate-400">{filtered.findIndex((r) => r.id === row.id) + 1}</span>,
    },
    ...(cfg.media === 'image'
      ? [{
          key: 'image', header: 'Image', sortable: false,
          render: (row: Item) => row.mediaUrl
            ? <img src={row.mediaUrl} alt={row.title} className="w-16 h-10 rounded-md object-cover border border-slate-200 dark:border-white/10" />
            : <span className="text-slate-400">—</span>,
        } as Column<Item>]
      : []),
    { key: 'title', header: cfg.titleLabel, accessor: 'title' },
    ...(cfg.descriptionLabel
      ? [{ key: 'description', header: cfg.descriptionLabel, render: (row: Item) => <span className="line-clamp-2 max-w-md block">{row.description || '—'}</span> } as Column<Item>]
      : []),
    ...(cfg.media === 'video'
      ? [{
          key: 'video', header: 'Video', render: (row: Item) => row.mediaUrl
            ? <a href={row.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline truncate block max-w-xs">{row.mediaUrl}</a>
            : '—',
        } as Column<Item>]
      : []),
    { key: 'order', header: 'Order', render: (row) => row.sortOrder },
    { key: 'status', header: 'Status', render: (row) => <Badge variant={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Active' : 'Hidden'}</Badge> },
  ];

  const actions: RowAction<Item>[] = [
    { label: 'Edit', icon: 'edit', onClick: openEdit },
    { label: 'Delete', icon: 'delete', onClick: (row) => setDeleteTarget(row), variant: 'danger' },
  ];

  const embedUrl = cfg.media === 'video' ? toEmbedUrl(form.mediaUrl) : null;

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0">
            {cfg.icon}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{cfg.heading}</h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Shown on your school&apos;s public website.</p>
          </div>
        </div>
        <Button variant="gradient" onClick={openCreate}><Plus className="w-4 h-4" /> Create {cfg.itemLabel}</Button>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <DataTable
          data={filtered}
          columns={columns}
          actions={actions}
          isLoading={loading}
          searchPlaceholder="Search..."
          serverSearch
          onSearch={setSearch}
          emptyTitle={`No ${cfg.heading.toLowerCase()} yet`}
          emptyDescription={`Create one with the "Create ${cfg.itemLabel}" button.`}
        />
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} className="max-w-2xl space-y-5">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-white/5">
          {editing ? `Edit ${cfg.itemLabel}` : `Create ${cfg.itemLabel}`}
        </h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{cfg.titleLabel} <span className="text-rose-500">*</span></label>
            <input type="text" maxLength={200} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="input-field" />
          </div>

          {cfg.descriptionLabel && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {cfg.descriptionLabel} {cfg.descriptionRequired && <span className="text-rose-500">*</span>}
              </label>
              <textarea rows={4} maxLength={5000} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="input-field resize-none" />
            </div>
          )}

          {cfg.media === 'image' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Image {cfg.mediaRequired && <span className="text-rose-500">*</span>}
              </label>
              <div className="flex items-center gap-3">
                {form.mediaUrl && <img src={form.mediaUrl} alt="Preview" className="w-24 h-14 rounded-md object-cover border border-slate-200 dark:border-white/10" />}
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="px-5 py-2 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold">Upload</button>
                {form.mediaUrl && !cfg.mediaRequired && (
                  <button type="button" onClick={() => setForm((p) => ({ ...p, mediaUrl: '' }))} className="text-sm text-rose-600 hover:underline">Remove</button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </div>
            </div>
          )}

          {cfg.media === 'video' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Video URL <span className="text-rose-500">*</span></label>
              <input type="url" value={form.mediaUrl} onChange={(e) => setForm((p) => ({ ...p, mediaUrl: e.target.value }))} placeholder="https://www.youtube.com/watch?v=..." className="input-field" />
              {embedUrl && (
                <iframe src={embedUrl} title="Video preview" className="mt-3 w-full aspect-video rounded-xl border border-slate-200 dark:border-white/10"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              )}
            </div>
          )}

          {cfg.showLink && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link (optional)</label>
              <input type="text" maxLength={500} value={form.linkUrl} onChange={(e) => setForm((p) => ({ ...p, linkUrl: e.target.value }))} placeholder="https://..." className="input-field" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Display Order</label>
              <input type="number" min="0" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} className="input-field" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer mt-7">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 rounded-sm accent-primary-500 cursor-pointer" />
              Show on website
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" variant="gradient" isLoading={saving}>{saving ? 'Saving…' : 'Submit'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={`Delete this ${cfg.itemLabel.toLowerCase()}?`}
        message={`"${deleteTarget?.title}" will be removed from your website. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default WebsiteItemsManager;
