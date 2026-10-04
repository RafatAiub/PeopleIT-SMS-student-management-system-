import React, { useEffect, useState } from 'react';
import {
  GraduationCap, Plus, Search, Eye, Megaphone, ClipboardList,
  Calendar, AlertCircle, Users, Edit2, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useTableParams } from '../../hooks/useTableParams';
import { Pagination } from '../../components/Pagination';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { EmptyState } from '../../components/common/EmptyState';
import { Select } from '../../components/ui/Input';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/Display';
import { Skeleton } from '../../components/ui/Skeleton';
import { useT } from '../../i18n';
import MaterialDetailModal from './MaterialDetailModal';
import AssignmentSubmissionsModal from './AssignmentSubmissionsModal';
import LectureMaterialFormModal, { type MaterialForm } from './LectureMaterialFormModal';
import AssignmentFormModal, { type AssignmentForm } from './AssignmentFormModal';
import MaterialCard from './MaterialCard';
import { useClassSectionMeta } from '../../utils/classSections';
import {
  resourceMeta, dueDateStatus,
  emptyMaterialForm, emptyAssignmentForm,
  type LectureMaterial, type Assignment,
} from './lectureShared';

export default function Lacture() {
  const t = useT();
  const { user } = useAuthStore();
  // Institution (Admin) is read-only here by design — only Teacher/Student may upload.
  const isReadOnly = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'stream' | 'classwork'>('stream');
  const [branchId, setBranchId] = useState<string | null>(null);

  const { params, debouncedSearch, setPage, setPageSize, setSearch } = useTableParams(12);
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  // Real institution classes/sections (GET /students/meta/classes[+sections])
  // for the browse filter and the two create/edit forms below.
  const { classes: filterClasses, sections: filterSections } = useClassSectionMeta(classFilter);

  // Stream (LectureMaterial) state
  const [materials, setMaterials] = useState<LectureMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyMaterialForm);
  const [formClassName, setFormClassName] = useState('');
  const [formSectionName, setFormSectionName] = useState('');
  const { classes: formClasses, sections: formSections } = useClassSectionMeta(formClassName);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<LectureMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState<LectureMaterial | null>(null);

  // Classwork (Assignment) state — separate data set, never shown in Stream
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentTotal, setAssignmentTotal] = useState(0);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>(emptyAssignmentForm);
  const { classes: assignmentFormClasses, sections: assignmentFormSections } = useClassSectionMeta(assignmentForm.className);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<Assignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [viewingSubmissionsFor, setViewingSubmissionsFor] = useState<Assignment | null>(null);

  const fetchMaterials = async () => {
    setLoading(true);
    setMaterialsError(false);
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
      setMaterialsError(true);
      toast.error(error.response?.data?.message || t('Failed to load lecture materials'));
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignments = async () => {
    setAssignmentLoading(true);
    setAssignmentsError(false);
    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        pageSize: params.pageSize.toString(),
      });
      if (debouncedSearch) queryParams.append('search', debouncedSearch);
      if (classFilter) queryParams.append('className', classFilter);
      if (sectionFilter) queryParams.append('sectionName', sectionFilter);

      const res = await apiClient.get(`/assignments?${queryParams.toString()}`);
      setAssignments(res.data.data || []);
      setAssignmentTotal(res.data.meta?.total || 0);
    } catch (error: any) {
      console.error('Failed to fetch assignments', error);
      setAssignmentsError(true);
      toast.error(error.response?.data?.message || t('Failed to load classwork'));
    } finally {
      setAssignmentLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'stream') fetchMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, params.page, params.pageSize, debouncedSearch, classFilter, sectionFilter]);

  useEffect(() => {
    if (activeTab === 'classwork') fetchAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, params.page, params.pageSize, debouncedSearch, classFilter, sectionFilter]);

  useEffect(() => {
    if (isReadOnly) return;
    apiClient.get('/students/meta/classes')
      .then((res) => setBranchId(res.data.data?.[0]?.branchId ?? null))
      .catch(console.error);
  }, [isReadOnly]);

  // Default the create-material form to the institution's first real
  // class/section once loaded (openAdd() resets className/sectionName to '').
  useEffect(() => {
    if (!formClassName && formClasses.length > 0) setFormClassName(formClasses[0].name);
  }, [formClasses, formClassName]);

  useEffect(() => {
    if (formSections.length > 0 && !formSections.some((s) => s.name === formSectionName)) {
      setFormSectionName(formSections[0].name);
    }
  }, [formSections, formSectionName]);

  // Same defaulting for the create-assignment form.
  useEffect(() => {
    if (!assignmentForm.className && assignmentFormClasses.length > 0) {
      setAssignmentForm((prev) => ({ ...prev, className: assignmentFormClasses[0].name }));
    }
  }, [assignmentFormClasses, assignmentForm.className]);

  useEffect(() => {
    if (assignmentFormSections.length > 0 && !assignmentFormSections.some((s) => s.name === assignmentForm.sectionName)) {
      setAssignmentForm((prev) => ({ ...prev, sectionName: assignmentFormSections[0].name }));
    }
  }, [assignmentFormSections, assignmentForm.sectionName]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyMaterialForm);
    setFormClassName('');
    setFormSectionName('');
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
    setFormClassName(material.className);
    setFormSectionName(material.sectionName);
    setIsModalOpen(true);
  };

  const canManage = (material: LectureMaterial) => !isReadOnly && material.uploadedBy?.id === user?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) {
      toast.error(t('Could not resolve your branch. Please refresh and try again.'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        branchId,
        className: formClassName,
        sectionName: formSectionName,
        subject: form.subject,
        title: form.title,
        description: form.description || undefined,
        resourceType: form.resourceType,
        fileUrl: form.fileUrl,
      };

      if (editingId) {
        await apiClient.put(`/lectures/${editingId}`, payload);
        toast.success(t('Lecture material updated'));
      } else {
        await apiClient.post('/lectures', payload);
        toast.success(t('Lecture material added'));
      }
      setIsModalOpen(false);
      fetchMaterials();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to save lecture material'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/lectures/${toDelete.id}`);
      toast.success(t('Lecture material deleted'));
      setToDelete(null);
      fetchMaterials();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete lecture material'));
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
      className: assignment.className,
      sectionName: assignment.sectionName,
      subject: assignment.subject,
      title: assignment.title,
      instructions: assignment.instructions || '',
      resourceType: assignment.resourceType || '',
      fileUrl: assignment.fileUrl || '',
      dueDate: assignment.dueDate ? assignment.dueDate.slice(0, 10) : '',
    });
    setIsAssignmentModalOpen(true);
  };

  const canManageAssignment = (assignment: Assignment) => !isReadOnly && assignment.createdBy?.id === user?.id;

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) {
      toast.error(t('Could not resolve your branch. Please refresh and try again.'));
      return;
    }
    setSavingAssignment(true);
    try {
      const payload = {
        branchId,
        className: assignmentForm.className,
        sectionName: assignmentForm.sectionName,
        subject: assignmentForm.subject,
        title: assignmentForm.title,
        instructions: assignmentForm.instructions || undefined,
        resourceType: assignmentForm.resourceType || undefined,
        fileUrl: assignmentForm.fileUrl || undefined,
        dueDate: new Date(assignmentForm.dueDate).toISOString(),
      };

      if (editingAssignmentId) {
        await apiClient.put(`/assignments/${editingAssignmentId}`, payload);
        toast.success(t('Assignment updated'));
      } else {
        await apiClient.post('/assignments', payload);
        toast.success(t('Assignment created'));
      }
      setIsAssignmentModalOpen(false);
      fetchAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to save assignment'));
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleConfirmDeleteAssignment = async () => {
    if (!assignmentToDelete) return;
    setDeletingAssignment(true);
    try {
      await apiClient.delete(`/assignments/${assignmentToDelete.id}`);
      toast.success(t('Assignment deleted'));
      setAssignmentToDelete(null);
      fetchAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete assignment'));
    } finally {
      setDeletingAssignment(false);
    }
  };

  const materialClassSectionPicker = (
    <div className="grid grid-cols-2 gap-4">
      <Select label={t('Class')} value={formClassName} onChange={(e) => { setFormClassName(e.target.value); setFormSectionName(''); }}>
        {formClasses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      </Select>
      <Select label={t('Section')} value={formSectionName} onChange={(e) => setFormSectionName(e.target.value)}>
        {formSections.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
      </Select>
    </div>
  );

  const assignmentClassSectionPicker = (
    <div className="grid grid-cols-2 gap-4">
      <Select label={t('Class')} value={assignmentForm.className} onChange={(e) => setAssignmentForm({ ...assignmentForm, className: e.target.value, sectionName: '' })}>
        {assignmentFormClasses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      </Select>
      <Select label={t('Section')} value={assignmentForm.sectionName} onChange={(e) => setAssignmentForm({ ...assignmentForm, sectionName: e.target.value })}>
        {assignmentFormSections.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            {t('Lecture Materials')}
          </span>
        }
        description={
          activeTab === 'stream'
            ? (isReadOnly ? t('Browse the notes, slides, videos, and links teachers and students have shared.') : t('Share notes, slides, videos, and resource links with your class.'))
            : (isReadOnly ? t('Browse assignments and homework tasks.') : t('Assign homework and tasks to your class.'))
        }
        actions={
          isReadOnly ? (
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-2 rounded-xl">
              <Eye className="w-4 h-4" /> {t('Read-only')}
            </span>
          ) : activeTab === 'stream' ? (
            <Button onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />}>{t('Add Material')}</Button>
          ) : (
            <Button onClick={openAddAssignment} leftIcon={<Plus className="w-4 h-4" />}>{t('Add Assignment')}</Button>
          )
        }
      />

      {/* Stream / Classwork tabs — separate modules with separate data */}
      <Tabs
        variant="pills"
        label={t('Lecture materials view')}
        tabs={[
          { id: 'stream', label: t('Stream'), icon: <Megaphone className="w-4 h-4" /> },
          { id: 'classwork', label: t('Classwork'), icon: <ClipboardList className="w-4 h-4" /> },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as 'stream' | 'classwork')}
      />

      {/* Filters toolbar */}
      <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-4 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4.5 h-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={activeTab === 'stream' ? t('Search by title, subject, or description...') : t('Search by title, subject, or instructions...')}
            className="input-field pl-10"
            value={params.search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setSectionFilter(''); }} className="input-field w-auto min-w-[140px]">
          <option value="">{t('All Classes')}</option>
          {filterClasses.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="input-field w-auto min-w-[120px]" disabled={!classFilter}>
          <option value="">{t('All Sections')}</option>
          {filterSections.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </div>

      {activeTab === 'stream' ? (
        <div className="space-y-4">
          {materialsError ? (
            <div className="glass-card p-8">
              <EmptyState
                title={t('Failed to load lecture materials')}
                description={t('Something went wrong while fetching lecture materials.')}
                icon={<Megaphone className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
                action={<Button onClick={fetchMaterials}>{t('Retry')}</Button>}
              />
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass-card p-5 rounded-2xl space-y-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ))}
            </div>
          ) : materials.length === 0 ? (
            <div className="glass-card p-8">
              <EmptyState
                title={t('No announcements yet')}
                description={isReadOnly ? t('No teacher or student has posted anything yet.') : t('Share a link, PDF, video, or image with your class.')}
                icon={<Megaphone className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
                action={!isReadOnly ? <Button onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />}>{t('New Announcement')}</Button> : undefined}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {materials.map((material) => (
                  <MaterialCard
                    key={material.id}
                    material={material}
                    onOpen={() => setViewingMaterial(material)}
                    canManage={canManage(material)}
                    onEdit={() => openEdit(material)}
                    onDelete={() => setToDelete(material)}
                    flagRole="STUDENT"
                    showClassSection
                  />
                ))}
              </div>
              <Pagination page={params.page} pageSize={params.pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </div>
      ) : assignmentsError ? (
        <div className="glass-card p-8">
          <EmptyState
            title={t('Failed to load classwork')}
            description={t('Something went wrong while fetching classwork.')}
            icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={<Button onClick={fetchAssignments}>{t('Retry')}</Button>}
          />
        </div>
      ) : assignmentLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card p-5 rounded-2xl space-y-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <div className="glass-card p-8">
          <EmptyState
            title={t('No classwork yet')}
            description={isReadOnly ? t('No assignments have been posted yet.') : t('Assign homework or a task to your class.')}
            icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={!isReadOnly ? <Button onClick={openAddAssignment} leftIcon={<Plus className="w-4 h-4" />}>{t('Add Assignment')}</Button> : undefined}
          />
        </div>
      ) : (
        <div className="space-y-4">
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
                    {due ? (
                      <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${due.className}`}>
                        {due.label === 'Overdue' && <AlertCircle className="w-3 h-3" />}
                        {due.label === 'Due today' && <Calendar className="w-3 h-3" />}
                        {due.label}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold border text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20">
                        {t('Submission')}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">{assignment.title}</h3>
                  {assignment.instructions && (
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 line-clamp-3">{assignment.instructions}</p>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-white/5">
                      <p className="text-xs text-slate-500 mb-1">{t('Subject')}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold truncate">{assignment.subject}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-white/5">
                      <p className="text-xs text-slate-500 mb-1">{t('Class')}</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 font-semibold truncate">{assignment.className} - {assignment.sectionName}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100 dark:border-white/10">
                    <span className="truncate max-w-[40%]" title={`${assignment.createdBy?.firstName || ''} ${assignment.createdBy?.lastName || ''}`}>
                      {assignment.createdBy?.firstName} {assignment.createdBy?.lastName}
                      {assignment.createdBy?.role === 'STUDENT' && <span className="ml-1 text-slate-400">({t('Student')})</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      {assignment.fileUrl && meta && Icon && (
                        <a
                          href={assignment.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${assignment.title} attachment`}
                          title={t('Open attachment')}
                          className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <Icon className="w-4 h-4" />
                        </a>
                      )}
                      {canManageAssignment(assignment) && (
                        <>
                          <button onClick={() => openEditAssignment(assignment)} aria-label={`Edit ${assignment.title}`} title={t('Edit assignment')} className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setAssignmentToDelete(assignment)} aria-label={`Delete ${assignment.title}`} title={t('Delete assignment')} className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* View Submissions — scoped to this one assignment only, via parentAssignmentId */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setViewingSubmissionsFor(assignment)}
                      aria-label={`View submissions for ${assignment.title}`}
                      leftIcon={<Users className="w-4 h-4" />}
                    >
                      {t('View Submissions')}
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-600 text-white text-xs font-bold">
                        {assignment._count?.submissions ?? 0}
                      </span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={params.page} pageSize={params.pageSize} total={assignmentTotal} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}

      <LectureMaterialFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isEdit={!!editingId}
        form={form}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onSubmit={handleSubmit}
        saving={saving}
        disabled={!branchId}
        classSectionPicker={materialClassSectionPicker}
      />

      <AssignmentFormModal
        isOpen={isAssignmentModalOpen}
        onClose={() => setIsAssignmentModalOpen(false)}
        isEdit={!!editingAssignmentId}
        form={assignmentForm}
        onChange={(patch) => setAssignmentForm((prev) => ({ ...prev, ...patch }))}
        onSubmit={handleAssignmentSubmit}
        saving={savingAssignment}
        disabled={!branchId}
        classSectionPicker={assignmentClassSectionPicker}
      />

      <ConfirmModal
        isOpen={!!toDelete}
        title={t('Delete lecture material')}
        message={t('Are you sure you want to delete "{title}"? This cannot be undone.', { title: toDelete?.title || '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <ConfirmModal
        isOpen={!!assignmentToDelete}
        title={t('Delete assignment')}
        message={t('Are you sure you want to delete "{title}"? This cannot be undone.', { title: assignmentToDelete?.title || '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deletingAssignment}
        onConfirm={handleConfirmDeleteAssignment}
        onCancel={() => setAssignmentToDelete(null)}
      />

      {viewingMaterial && (
        <MaterialDetailModal
          material={viewingMaterial}
          currentUserId={user?.id}
          canComment={user?.role === 'TEACHER'}
          onClose={() => setViewingMaterial(null)}
        />
      )}

      {viewingSubmissionsFor && (
        <AssignmentSubmissionsModal
          assignment={viewingSubmissionsFor}
          onClose={() => setViewingSubmissionsFor(null)}
        />
      )}
    </div>
  );
}
