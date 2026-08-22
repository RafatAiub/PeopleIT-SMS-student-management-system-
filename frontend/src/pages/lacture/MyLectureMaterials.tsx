import React, { useEffect, useState } from 'react';
import {
  GraduationCap, Users, FileText, Video, Link2, Presentation, Image as ImageIcon,
  BookOpen, Plus, X, Edit2, Trash2, MessageSquare, Megaphone, ClipboardList, Calendar, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import MaterialDetailModal from './MaterialDetailModal';

const RESOURCE_TYPES = [
  { value: 'NOTE', label: 'Notes', icon: FileText, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20' },
  { value: 'SLIDE', label: 'Slides', icon: Presentation, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' },
  { value: 'VIDEO', label: 'Video', icon: Video, color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' },
  { value: 'PDF', label: 'PDF', icon: FileText, color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' },
  { value: 'LINK', label: 'Link', icon: Link2, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' },
  { value: 'IMAGE', label: 'Image', icon: ImageIcon, color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20' },
];
const resourceMeta = (type: string) => RESOURCE_TYPES.find((r) => r.value === type) || RESOURCE_TYPES[0];

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const initials = (firstName?: string, lastName?: string) =>
  `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';

const dueDateStatus = (iso: string) => {
  const due = new Date(iso);
  const now = new Date();
  const diffDays = Math.ceil((due.setHours(23, 59, 59, 999) - now.getTime()) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', className: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20' };
  if (diffDays === 0) return { label: 'Due today', className: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' };
  return { label: `Due ${new Date(iso).toLocaleDateString()}`, className: 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10' };
};

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

interface Assignment {
  id: string;
  className: string;
  sectionName: string;
  subject: string;
  title: string;
  instructions?: string | null;
  resourceType?: string | null;
  fileUrl?: string | null;
  dueDate: string;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string; role: string };
}

interface ChildSummary {
  id: string;
  firstName: string;
  lastName: string;
  class: { name: string } | null;
  section: { name: string } | null;
}

const emptyForm = {
  subject: '',
  title: '',
  description: '',
  resourceType: 'NOTE',
  fileUrl: '',
};

const emptyAssignmentForm = {
  subject: '',
  title: '',
  instructions: '',
  resourceType: '',
  fileUrl: '',
  dueDate: '',
};

const MyLectureMaterials: React.FC = () => {
  const { user } = useAuthStore();
  const isGuardian = user?.role === 'GUARDIAN';
  // Students may contribute materials/classwork for their own class; guardians are read-only.
  const canUpload = user?.role === 'STUDENT';

  const [activeTab, setActiveTab] = useState<'stream' | 'classwork'>('stream');

  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);

  const [subjectFilter, setSubjectFilter] = useState('');

  // Stream (LectureMaterial) state
  const [materials, setMaterials] = useState<LectureMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<LectureMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState<LectureMaterial | null>(null);

  // Classwork (Assignment) state — separate data set, never shown in Stream
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignmentError, setAssignmentError] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);

  useEffect(() => {
    if (!isGuardian) return;
    const fetchChildren = async () => {
      try {
        const res = await apiClient.get('/guardians/me/students');
        const list: ChildSummary[] = res.data.data || [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      } catch (err) {
        console.error('Failed to load linked children', err);
        toast.error('Failed to load your children');
      } finally {
        setChildrenLoading(false);
      }
    };
    fetchChildren();
  }, [isGuardian]);

  const fetchMaterials = async () => {
    if (isGuardian && !selectedChildId) return;
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, any> = { pageSize: 100 };
      if (subjectFilter) params.subject = subjectFilter;
      if (isGuardian && selectedChildId) params.studentId = selectedChildId;
      const res = await apiClient.get('/lectures/me', { params });
      setMaterials(res.data.data || []);
    } catch (err: any) {
      console.error('Failed to load lecture materials', err);
      setError(true);
      toast.error(err.response?.data?.message || 'Failed to load your lecture materials');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    if (isGuardian && !selectedChildId) return;
    setAssignmentLoading(true);
    setAssignmentError(false);
    try {
      const params: Record<string, any> = { pageSize: 100 };
      if (subjectFilter) params.subject = subjectFilter;
      if (isGuardian && selectedChildId) params.studentId = selectedChildId;
      const res = await apiClient.get('/assignments/me', { params });
      setAssignments(res.data.data || []);
    } catch (err: any) {
      console.error('Failed to load assignments', err);
      setAssignmentError(true);
      toast.error(err.response?.data?.message || 'Failed to load classwork');
    } finally {
      setAssignmentLoading(false);
    }
  };

  useEffect(() => {
    if (isGuardian && childrenLoading) return;
    if (isGuardian && children.length === 0) {
      setLoading(false);
      return;
    }
    if (activeTab === 'stream') fetchMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, subjectFilter, selectedChildId, childrenLoading]);

  useEffect(() => {
    if (isGuardian && childrenLoading) return;
    if (isGuardian && children.length === 0) {
      setAssignmentLoading(false);
      return;
    }
    if (activeTab === 'classwork') fetchAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, subjectFilter, selectedChildId, childrenLoading]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (material: LectureMaterial) => {
    setEditingId(material.id);
    setForm({
      subject: material.subject,
      title: material.title,
      description: material.description || '',
      resourceType: material.resourceType,
      fileUrl: material.fileUrl,
    });
    setIsModalOpen(true);
  };

  const canManage = (material: LectureMaterial) => canUpload && material.uploadedBy?.id === user?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
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

  const openAddAssignment = () => {
    setEditingAssignmentId(null);
    setAssignmentForm(emptyAssignmentForm);
    setIsAssignmentModalOpen(true);
  };

  const openEditAssignment = (assignment: Assignment) => {
    setEditingAssignmentId(assignment.id);
    setAssignmentForm({
      subject: assignment.subject,
      title: assignment.title,
      instructions: assignment.instructions || '',
      resourceType: assignment.resourceType || '',
      fileUrl: assignment.fileUrl || '',
      dueDate: assignment.dueDate ? assignment.dueDate.slice(0, 10) : '',
    });
    setIsAssignmentModalOpen(true);
  };

  const canManageAssignment = (assignment: Assignment) => canUpload && assignment.createdBy?.id === user?.id;

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAssignment(true);
    try {
      const payload = {
        subject: assignmentForm.subject,
        title: assignmentForm.title,
        instructions: assignmentForm.instructions || undefined,
        resourceType: assignmentForm.resourceType || undefined,
        fileUrl: assignmentForm.fileUrl || undefined,
        dueDate: new Date(assignmentForm.dueDate).toISOString(),
      };
      if (editingAssignmentId) {
        await apiClient.put(`/assignments/${editingAssignmentId}`, payload);
        toast.success('Assignment updated');
      } else {
        await apiClient.post('/assignments', payload);
        toast.success('Assignment created');
      }
      setIsAssignmentModalOpen(false);
      fetchAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save assignment');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleConfirmDeleteAssignment = async () => {
    if (!assignmentToDelete) return;
    setDeletingAssignment(true);
    try {
      await apiClient.delete(`/assignments/${assignmentToDelete.id}`);
      toast.success('Assignment deleted');
      setAssignmentToDelete(null);
      fetchAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete assignment');
    } finally {
      setDeletingAssignment(false);
    }
  };

  if (isGuardian && childrenLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your dashboard...</div>;
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title="No linked children found"
          description="Contact your school administrator to link your account to your child's student profile."
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            Lecture Materials
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {activeTab === 'stream'
              ? (isGuardian ? "Notes, slides, and videos shared with your child's class." : 'Notes, slides, and videos shared with your class.')
              : (isGuardian ? "Assignments and homework for your child's class." : 'Assignments and homework for your class.')}
          </p>
        </div>
        {canUpload && (
          activeTab === 'stream' ? (
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              Add Material
            </button>
          ) : (
            <button
              onClick={openAddAssignment}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              Add Assignment
            </button>
          )
        )}
      </div>

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      {/* Stream / Classwork tabs — separate modules with separate data */}
      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 flex overflow-hidden bg-slate-50 dark:bg-slate-900/30 p-1 gap-1">
        <button
          onClick={() => setActiveTab('stream')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'stream'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Megaphone className="w-4 h-4" /> Stream
        </button>
        <button
          onClick={() => setActiveTab('classwork')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'classwork'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
              : 'text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" /> Classwork
        </button>
      </div>

      <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-4 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
        <input
          type="text"
          placeholder="Filter by subject..."
          className="input-field flex-1 min-w-[200px]"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
        />
      </div>

      {activeTab === 'stream' ? (
        <div className="space-y-4">
          {canUpload && (
            <button
              onClick={openAdd}
              className="w-full flex items-center gap-3 glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm hover:border-blue-400 dark:hover:border-blue-500/50 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {initials(user?.firstName, user?.lastName)}
              </div>
              <span className="text-sm text-slate-400 dark:text-slate-500 flex-1">Share an announcement with your class...</span>
              <Megaphone className="w-4 h-4 text-slate-400 flex-shrink-0" />
            </button>
          )}

          {error ? (
            <div className="glass-card p-8">
              <EmptyState
                title="Failed to load lecture materials"
                description="Something went wrong while fetching your lecture materials."
                icon={<BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
                action={
                  <button
                    onClick={fetchMaterials}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
                  >
                    Retry
                  </button>
                }
              />
            </div>
          ) : loading ? (
            <div className="text-center text-slate-500 py-10">Loading announcements...</div>
          ) : materials.length === 0 ? (
            <div className="glass-card p-8">
              <EmptyState
                title="No announcements yet"
                description={canUpload ? 'Be the first to share a link, PDF, video, or image with your class.' : "Your teachers haven't posted anything for this class yet."}
                icon={<Megaphone className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
                action={
                  canUpload ? (
                    <button
                      onClick={openAdd}
                      className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl transition-all text-sm font-semibold"
                    >
                      <Plus className="w-4 h-4" /> New Announcement
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
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
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {initials(material.uploadedBy?.firstName, material.uploadedBy?.lastName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-white">{material.uploadedBy?.firstName} {material.uploadedBy?.lastName}</span>
                          {material.uploadedBy?.role === 'TEACHER' && <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded-full">Teacher</span>}
                          <span>shared {meta.label.toLowerCase()}</span>
                          <span>· {timeAgo(material.createdAt)}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5 line-clamp-1">{material.title}</h3>
                        {material.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{material.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                          <a
                            href={material.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${meta.color}`}
                          >
                            <Icon className="w-3.5 h-3.5" /> Open {meta.label}
                          </a>
                          <span className="flex items-center gap-1 text-xs text-slate-400" title="Comments">
                            <MessageSquare className="w-3.5 h-3.5" /> {material._count?.comments ?? 0} comment{material._count?.comments === 1 ? '' : 's'}
                          </span>
                          {canManage(material) && (
                            <div className="flex items-center gap-1 ml-auto">
                              <button onClick={(e) => { e.stopPropagation(); openEdit(material); }} aria-label={`Edit ${material.title}`} title="Edit" className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setToDelete(material); }} aria-label={`Delete ${material.title}`} title="Delete" className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : assignmentError ? (
        <div className="glass-card p-8">
          <EmptyState
            title="Failed to load classwork"
            description="Something went wrong while fetching your classwork."
            icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              <button
                onClick={fetchAssignments}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Retry
              </button>
            }
          />
        </div>
      ) : assignmentLoading ? (
        <div className="text-center text-slate-500 py-10">Loading classwork...</div>
      ) : assignments.length === 0 ? (
        <div className="glass-card p-8">
          <EmptyState
            title="No classwork yet"
            description={canUpload ? 'Be the first to assign homework or a task to your class.' : "Your teachers haven't assigned anything for this class yet."}
            icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              canUpload ? (
                <button
                  onClick={openAddAssignment}
                  className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl transition-all text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" /> Add Assignment
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map((assignment) => {
            const due = dueDateStatus(assignment.dueDate);
            const meta = assignment.resourceType ? resourceMeta(assignment.resourceType) : null;
            const Icon = meta?.icon;
            return (
              <div
                key={assignment.id}
                className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm hover:border-blue-500/50 dark:hover:border-blue-500/50 transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center border text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 group-hover:scale-110 transition-transform">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${due.className}`}>
                    {due.label === 'Overdue' && <AlertCircle className="w-3 h-3" />}
                    {due.label === 'Due today' && <Calendar className="w-3 h-3" />}
                    {due.label}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">{assignment.title}</h3>
                {assignment.instructions && (
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 line-clamp-3">{assignment.instructions}</p>
                )}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-white/10">
                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[40%]">{assignment.subject}</span>
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[110px]" title={`${assignment.createdBy?.firstName || ''} ${assignment.createdBy?.lastName || ''}`}>
                      {assignment.createdBy?.firstName} {assignment.createdBy?.lastName}
                    </span>
                    {assignment.fileUrl && meta && Icon && (
                      <a
                        href={assignment.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${assignment.title} attachment`}
                        title="Open attachment"
                        className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {canManageAssignment(assignment) && (
                      <>
                        <button onClick={() => openEditAssignment(assignment)} aria-label={`Edit ${assignment.title}`} title="Edit assignment" className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setAssignmentToDelete(assignment)} aria-label={`Delete ${assignment.title}`} title="Delete assignment" className="p-1 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Lecture Material Modal (Stream, Student only) */}
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
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-white/5 rounded-xl px-3.5 py-2.5">
                This will be shared with your own class automatically.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Subject</label>
                <input required type="text" placeholder="e.g. Mathematics" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Title</label>
                <input required type="text" placeholder="e.g. My revision notes for Chapter 4" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
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
                  disabled={saving}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-[0.98]"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Assignment Modal (Classwork, Student only) */}
      {isAssignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden shadow-blue-500/10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                {editingAssignmentId ? 'Edit Assignment' : 'Add Assignment'}
              </h3>
              <button
                onClick={() => setIsAssignmentModalOpen(false)}
                aria-label="Close"
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignmentSubmit} className="p-6 space-y-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-white/5 rounded-xl px-3.5 py-2.5">
                This will be shared with your own class automatically.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Subject</label>
                <input required type="text" placeholder="e.g. Mathematics" value={assignmentForm.subject} onChange={(e) => setAssignmentForm({ ...assignmentForm, subject: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Title</label>
                <input required type="text" placeholder="e.g. Worksheet 3 - Fractions" value={assignmentForm.title} onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Instructions (optional)</label>
                <textarea rows={3} placeholder="What should be done for this assignment?" value={assignmentForm.instructions} onChange={(e) => setAssignmentForm({ ...assignmentForm, instructions: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Due Date</label>
                <input required type="date" value={assignmentForm.dueDate} onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })} className="input-field" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Attachment Type (optional)</label>
                <select value={assignmentForm.resourceType} onChange={(e) => setAssignmentForm({ ...assignmentForm, resourceType: e.target.value })} className="input-field">
                  <option value="">No attachment</option>
                  {RESOURCE_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {assignmentForm.resourceType && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Attachment Link</label>
                  <input type="url" placeholder="https://drive.google.com/... or https://youtube.com/..." value={assignmentForm.fileUrl} onChange={(e) => setAssignmentForm({ ...assignmentForm, fileUrl: e.target.value })} className="input-field placeholder:text-slate-400 dark:placeholder:text-slate-600" />
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-white/5">
                <button
                  type="button"
                  onClick={() => setIsAssignmentModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAssignment}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 active:scale-[0.98]"
                >
                  {savingAssignment ? 'Saving...' : editingAssignmentId ? 'Save Changes' : 'Add Assignment'}
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

      <ConfirmModal
        isOpen={!!assignmentToDelete}
        title="Delete assignment"
        message={`Are you sure you want to delete "${assignmentToDelete?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletingAssignment}
        onConfirm={handleConfirmDeleteAssignment}
        onCancel={() => setAssignmentToDelete(null)}
      />

      {viewingMaterial && (
        <MaterialDetailModal
          material={viewingMaterial}
          currentUserId={user?.id}
          canComment={canUpload}
          guardianStudentId={isGuardian ? selectedChildId ?? undefined : undefined}
          onClose={() => setViewingMaterial(null)}
        />
      )}
    </div>
  );
};

export default MyLectureMaterials;
