import React, { useEffect, useState } from 'react';
import {
  GraduationCap, Users, BookOpen, Plus, Megaphone, ClipboardList,
  Calendar, AlertCircle, Send, CheckCircle2, Edit2, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/Display';
import { Skeleton } from '../../components/ui/Skeleton';
import { useT } from '../../i18n';
import MaterialDetailModal from './MaterialDetailModal';
import MaterialCard from './MaterialCard';
import LectureMaterialFormModal, { type MaterialForm } from './LectureMaterialFormModal';
import SubmissionFormModal, { type SubmissionForm } from './SubmissionFormModal';
import {
  resourceMeta, dueDateStatus, emptyMaterialForm,
  type LectureMaterial, type Assignment, type Submission,
} from './lectureShared';

interface ChildSummary {
  id: string;
  firstName: string;
  lastName: string;
  class: { name: string } | null;
  section: { name: string } | null;
}

const emptySubmissionForm: SubmissionForm = {
  instructions: '',
  resourceType: 'LINK',
  fileUrl: '',
};

const MyLectureMaterials: React.FC = () => {
  const t = useT();
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
  const [form, setForm] = useState<MaterialForm>(emptyMaterialForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<LectureMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState<LectureMaterial | null>(null);

  // Classwork (Assignment) state — separate data set, never shown in Stream
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [assignmentError, setAssignmentError] = useState(false);

  // Submitting/editing a response to one specific Teacher assignment
  const [submittingFor, setSubmittingFor] = useState<Assignment | null>(null);
  const [submissionForm, setSubmissionForm] = useState<SubmissionForm>(emptySubmissionForm);
  const [savingSubmission, setSavingSubmission] = useState(false);
  const [submissionToDelete, setSubmissionToDelete] = useState<{ assignment: Assignment; submission: Submission } | null>(null);
  const [deletingSubmission, setDeletingSubmission] = useState(false);

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
        toast.error(t('Failed to load your children'));
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
      toast.error(err.response?.data?.message || t('Failed to load your lecture materials'));
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
      toast.error(err.response?.data?.message || t('Failed to load classwork'));
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
    setForm(emptyMaterialForm);
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

  // Opens the submit/edit modal scoped to one specific Teacher assignment —
  // prefilled from the existing submission if the student already has one.
  const openSubmitFor = (assignment: Assignment) => {
    setSubmittingFor(assignment);
    setSubmissionForm({
      instructions: assignment.mySubmission?.instructions || '',
      resourceType: assignment.mySubmission?.resourceType || 'LINK',
      fileUrl: assignment.mySubmission?.fileUrl || '',
    });
  };

  const handleSubmissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingFor) return;
    setSavingSubmission(true);
    try {
      const payload: any = {
        subject: submittingFor.subject,
        title: `Submission: ${submittingFor.title}`,
        instructions: submissionForm.instructions || undefined,
        resourceType: submissionForm.resourceType,
        fileUrl: submissionForm.fileUrl,
      };
      if (submittingFor.mySubmission) {
        await apiClient.put(`/assignments/${submittingFor.mySubmission.id}`, payload);
        toast.success(t('Submission updated'));
      } else {
        payload.parentAssignmentId = submittingFor.id;
        await apiClient.post('/assignments', payload);
        toast.success(t('Assignment submitted'));
      }
      setSubmittingFor(null);
      fetchAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to submit assignment'));
    } finally {
      setSavingSubmission(false);
    }
  };

  const handleConfirmDeleteSubmission = async () => {
    if (!submissionToDelete) return;
    setDeletingSubmission(true);
    try {
      await apiClient.delete(`/assignments/${submissionToDelete.submission.id}`);
      toast.success(t('Submission deleted'));
      setSubmissionToDelete(null);
      fetchAssignments();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('Failed to delete submission'));
    } finally {
      setDeletingSubmission(false);
    }
  };

  if (isGuardian && childrenLoading) {
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">{t('Loading your dashboard...')}</div>;
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title={t('No linked children found')}
          description={t("Contact your school administrator to link your account to your child's student profile.")}
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

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
            ? (isGuardian ? t("Notes, slides, and videos shared with your child's class.") : t('Notes, slides, and videos shared with your class.'))
            : (isGuardian ? t("Assignments and homework for your child's class.") : t('Assignments and homework for your class.'))
        }
        actions={canUpload && activeTab === 'stream' ? <Button onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />}>{t('Add Material')}</Button> : undefined}
      />

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

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

      <div className="glass-card p-5 rounded-2xl flex flex-wrap items-center gap-4 border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 shadow-sm">
        <input
          type="text"
          placeholder={t('Filter by subject...')}
          className="input-field flex-1 min-w-[200px]"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
        />
      </div>

      {activeTab === 'stream' ? (
        error ? (
          <div className="glass-card p-8">
            <EmptyState
              title={t('Failed to load lecture materials')}
              description={t('Something went wrong while fetching your lecture materials.')}
              icon={<BookOpen className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
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
              </div>
            ))}
          </div>
        ) : materials.length === 0 ? (
          <div className="glass-card p-8">
            <EmptyState
              title={t('No announcements yet')}
              description={canUpload ? t('Be the first to share a link, PDF, video, or image with your class.') : t("Your teachers haven't posted anything for this class yet.")}
              icon={<Megaphone className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
              action={canUpload ? <Button onClick={openAdd} leftIcon={<Plus className="w-4 h-4" />}>{t('New Announcement')}</Button> : undefined}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {materials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                onOpen={() => setViewingMaterial(material)}
                canManage={canManage(material)}
                onEdit={() => openEdit(material)}
                onDelete={() => setToDelete(material)}
                flagRole="TEACHER"
              />
            ))}
          </div>
        )
      ) : assignmentError ? (
        <div className="glass-card p-8">
          <EmptyState
            title={t('Failed to load classwork')}
            description={t('Something went wrong while fetching your classwork.')}
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
            description={t("Your teachers haven't assigned anything for this class yet.")}
            icon={<ClipboardList className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
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
                className="glass-card p-5 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white dark:bg-transparent shadow-sm hover:border-primary-500/50 dark:hover:border-primary-500/50 transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center border text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10 border-primary-200 dark:border-primary-500/20 group-hover:scale-110 transition-transform">
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
                        title={t('Open attachment')}
                        className="p-1 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Submission — only for classwork actually assigned by a Teacher.
                    A classwork item authored by a Student never gets a Submit
                    button — there's nothing to submit to. */}
                {canUpload && assignment.createdBy?.role === 'TEACHER' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                    {assignment.mySubmission ? (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" /> {t('Submitted')}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openSubmitFor(assignment)} aria-label={`Edit submission for ${assignment.title}`} title={t('Edit submission')} className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setSubmissionToDelete({ assignment, submission: assignment.mySubmission! })} aria-label={`Delete submission for ${assignment.title}`} title={t('Delete submission')} className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Button fullWidth onClick={() => openSubmitFor(assignment)} leftIcon={<Send className="w-4 h-4" />}>
                        {t('Submit Assignment')}
                      </Button>
                    )}
                  </div>
                )}

                {isGuardian && assignment.createdBy?.role === 'TEACHER' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
                    {assignment.mySubmission ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" /> {t('Submitted')}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{t('Not submitted yet')}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
        note={
          <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-white/5 rounded-xl px-3.5 py-2.5">
            {t('This will be shared with your own class automatically.')}
          </p>
        }
      />

      <SubmissionFormModal
        isOpen={!!submittingFor}
        assignment={submittingFor}
        onClose={() => setSubmittingFor(null)}
        form={submissionForm}
        onChange={(patch) => setSubmissionForm((prev) => ({ ...prev, ...patch }))}
        onSubmit={handleSubmissionSubmit}
        saving={savingSubmission}
        onDelete={
          submittingFor?.mySubmission
            ? () => {
                const submission = submittingFor.mySubmission!;
                setSubmissionToDelete({ assignment: submittingFor, submission });
                setSubmittingFor(null);
              }
            : undefined
        }
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
        isOpen={!!submissionToDelete}
        title={t('Delete submission')}
        message={t('Are you sure you want to delete your submission for "{title}"? This cannot be undone.', { title: submissionToDelete?.assignment.title || '' })}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={deletingSubmission}
        onConfirm={handleConfirmDeleteSubmission}
        onCancel={() => setSubmissionToDelete(null)}
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
