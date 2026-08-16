import React, { useEffect, useState } from 'react';
import {
  GraduationCap, Plus, Search, X, FileText, Video, Link2, Presentation,
  Edit2, Trash2, ExternalLink, BookOpen, Eye, MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { EmptyState } from '../../components/common/EmptyState';
import MaterialDetailModal from './MaterialDetailModal';

const CLASSES = [
  'KG', 'Nursery', 'Junior One',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
];
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const RESOURCE_TYPES = [
  { value: 'NOTE', label: 'Notes', icon: FileText, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  { value: 'SLIDE', label: 'Slides', icon: Presentation, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  { value: 'VIDEO', label: 'Video', icon: Video, color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' },
  { value: 'PDF', label: 'PDF', icon: FileText, color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
  { value: 'LINK', label: 'Link', icon: Link2, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
];

const resourceMeta = (type: string) => RESOURCE_TYPES.find((r) => r.value === type) || RESOURCE_TYPES[0];

interface LectureMaterial {
  id: string;
  className: string;
  sectionName: string;
  subject: string;
  title: string;
  description?: string | null;
  resourceType: string;
  fileUrl: string;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string; role: string };
  _count?: { comments: number };
}

const emptyForm = {
  branchId: '',
  className: 'Class 8',
  sectionName: 'A',
  subject: '',
  title: '',
  description: '',
  resourceType: 'NOTE',
  fileUrl: '',
};

export default function Lacture() {
  const { user } = useAuthStore();
  // Institution (Admin) is read-only here by design — only Teacher/Student may upload.
  const isReadOnly = user?.role === 'ADMIN';

  const [materials, setMaterials] = useState<LectureMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);

  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams(12);
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<LectureMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState<LectureMaterial | null>(null);

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch) queryParams.append('search', debouncedSearch);
      if (classFilter) queryParams.append('className', classFilter);
      if (sectionFilter) queryParams.append('sectionName', sectionFilter);

      const res = await apiClient.get(`/lectures?${queryParams.toString()}`);
      setMaterials(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (error: any) {
      console.error('Failed to fetch lecture materials', error);
      toast.error(error.response?.data?.message || 'Failed to load lecture materials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.page, params.pageSize, debouncedSearch, classFilter, sectionFilter]);

  useEffect(() => {
    if (isReadOnly) return;
    apiClient.get('/students/meta/classes')
      .then((res) => setBranchId(res.data.data?.[0]?.branchId ?? null))
      .catch(console.error);
  }, [isReadOnly]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, branchId: branchId || '' });
    setIsModalOpen(true);
  };

  const openEdit = (material: LectureMaterial) => {
    setEditingId(material.id);
    setForm({
      branchId: branchId || '',
      className: material.className,
      sectionName: material.sectionName,
      subject: material.subject,
      title: material.title,
      description: material.description || '',
      resourceType: material.resourceType,
      fileUrl: material.fileUrl,
    });
    setIsModalOpen(true);
  };

  const canManage = (material: LectureMaterial) => !isReadOnly && material.uploadedBy?.id === user?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) {
      toast.error('Could not resolve your branch. Please refresh and try again.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        branchId,
        className: form.className,
        sectionName: form.sectionName,
        subject: form.subject,
        title: form.title,
        description: form.description || undefined,
        resourceType: form.resourceType,
        fileUrl: form.fileUrl,
      };

      if (editingId) {
        await apiClient.put(`/lectures/${editingId}`, payload);
        toast.success('Lecture material updated');
      } else {
        await apiClient.post('/lectures', payload);
        toast.success('Lecture material added');
      }
      setIsModalOpen(false);
      fetchMaterials();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save lecture material');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/lectures/${toDelete.id}`);
      toast.success('Lecture material deleted');
      setToDelete(null);
      fetchMaterials();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete lecture material');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            Lecture Materials
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {isReadOnly
              ? 'Browse the notes, slides, videos, and links teachers and students have shared.'
              : 'Share notes, slides, videos, and resource links with your class.'}
          </p>
        </div>
        {isReadOnly ? (
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-2 rounded-xl">
            <Eye className="w-4 h-4" /> Read-only
          </span>
        ) : (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Add Material
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-4 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4.5 h-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, subject, or description..."
            className="input-field pl-10"
            value={params.search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="input-field w-auto min-w-[140px]">
          <option value="">All Classes</option>
          {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="input-field w-auto min-w-[120px]">
          <option value="">All Sections</option>
          {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center text-slate-500 py-10">Loading lecture materials...</div>
      ) : materials.length === 0 ? (
        <div className="glass-card p-8">
          <EmptyState
            title="No lecture materials yet"
            description={isReadOnly ? 'No teacher or student has shared any materials yet.' : 'Add notes, slides, videos, or resource links for your class.'}
            icon={<BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              !isReadOnly ? (
                <button
                  onClick={openAdd}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl transition-all text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" /> Add Material
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {materials.map((material) => {
              const meta = resourceMeta(material.resourceType);
              const Icon = meta.icon;
              return (
                <div
                  key={material.id}
                  onClick={() => setViewingMaterial(material)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setViewingMaterial(material)}
                  className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all group cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform ${meta.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">{material.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 line-clamp-2">{material.description || material.subject}</p>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-white/5">
                      <p className="text-xs text-slate-500 mb-1">Subject</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold truncate">{material.subject}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-white/5">
                      <p className="text-xs text-slate-500 mb-1">Class</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold truncate">{material.className} - {material.sectionName}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-white/10">
                    <span className="truncate max-w-[35%]" title={`${material.uploadedBy?.firstName || ''} ${material.uploadedBy?.lastName || ''}`}>
                      {material.uploadedBy?.firstName} {material.uploadedBy?.lastName}
                      {material.uploadedBy?.role === 'STUDENT' && <span className="ml-1 text-slate-400">(Student)</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="flex items-center gap-1 px-1.5 text-slate-400" title="Comments">
                        <MessageSquare className="w-3.5 h-3.5" /> {material._count?.comments ?? 0}
                      </span>
                      <a
                        href={material.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Open ${material.title}`}
                        title="Open material"
                        className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {canManage(material) && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); openEdit(material); }} aria-label={`Edit ${material.title}`} title="Edit material" className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setToDelete(material); }} aria-label={`Delete ${material.title}`} title="Delete material" className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination
            page={params.page}
            pageSize={params.pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden shadow-blue-500/10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                {editingId ? 'Edit Lecture Material' : 'Add Lecture Material'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Class</label>
                  <select value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} className="input-field">
                    {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Section</label>
                  <select value={form.sectionName} onChange={(e) => setForm({ ...form, sectionName: e.target.value })} className="input-field">
                    {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Subject</label>
                <input required type="text" placeholder="e.g. Mathematics" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Title</label>
                <input required type="text" placeholder="e.g. Chapter 4 - Algebra Basics" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Description (optional)</label>
                <textarea rows={2} placeholder="Short summary of this material" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Type</label>
                <select value={form.resourceType} onChange={(e) => setForm({ ...form, resourceType: e.target.value })} className="input-field">
                  {RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Resource Link</label>
                <input required type="url" placeholder="https://drive.google.com/... or https://youtube.com/..." value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
                <p className="text-xs text-slate-400 dark:text-slate-500">Paste a link to Google Drive, YouTube, OneDrive, or any hosted file.</p>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !branchId}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-[0.98]"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        title="Delete lecture material"
        message={`Are you sure you want to delete "${toDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setToDelete(null)}
      />

      {viewingMaterial && (
        <MaterialDetailModal
          material={viewingMaterial}
          currentUserId={user?.id}
          canComment={user?.role === 'TEACHER'}
          onClose={() => setViewingMaterial(null)}
        />
      )}
    </div>
  );
}
