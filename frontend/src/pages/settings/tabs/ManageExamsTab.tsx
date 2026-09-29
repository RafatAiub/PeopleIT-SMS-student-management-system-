import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { GraduationCap, Plus, Save } from 'lucide-react';
import { Button, Badge, Modal, Input, Checkbox } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatDate } from '@/i18n';
import {
  useExams,
  useCreateExam,
  useUpdateExam,
  useDeleteExam,
  type Exam,
  type ExamFormValues,
} from '../settings.queries';

const toDateInputValue = (dateStr: string) => (dateStr ? dateStr.slice(0, 10) : '');
const EMPTY_FORM: ExamFormValues = { name: '', startDate: '', endDate: '', isActive: true };

const ManageExamsTab: React.FC = () => {
  const { data: exams, isLoading, isError, refetch } = useExams();
  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const deleteExam = useDeleteExam();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExamFormValues>(EMPTY_FORM);
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (exam: Exam) => {
    setEditingId(exam.id);
    setForm({
      name: exam.name,
      startDate: toDateInputValue(exam.startDate),
      endDate: toDateInputValue(exam.endDate),
      isActive: exam.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.startDate || !form.endDate) {
      toast.error('Please fill in exam name, start date, and end date.');
      return;
    }
    const onSuccess = () => {
      toast.success(editingId ? 'Exam updated successfully' : 'Exam created successfully');
      setModalOpen(false);
    };
    const onError = (err: any) => toast.error(err.response?.data?.message || 'Failed to save exam');

    if (editingId) {
      updateExam.mutate({ id: editingId, ...form }, { onSuccess, onError });
    } else {
      createExam.mutate(form, { onSuccess, onError });
    }
  };

  const handleConfirmDelete = () => {
    if (!examToDelete) return;
    deleteExam.mutate(examToDelete.id, {
      onSuccess: () => {
        toast.success('Exam deleted successfully');
        setExamToDelete(null);
      },
      onError: (err: any) =>
        toast.error(err.response?.data?.message || 'Failed to delete exam. It may already have results recorded.'),
    });
  };

  const columns: Column<Exam>[] = [
    { key: 'name', header: 'Name', accessor: 'name', primary: true },
    {
      key: 'startDate',
      header: 'Start Date',
      render: (e) => formatDate(e.startDate),
    },
    {
      key: 'endDate',
      header: 'End Date',
      render: (e) => formatDate(e.endDate),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (e) => <Badge variant={e.isActive ? 'success' : 'neutral'}>{e.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
  ];

  const saving = createExam.isPending || updateExam.isPending;

  if (isError) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          Manage Exams
        </h3>
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">Failed to load exams.</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          Manage Exams
        </h3>
        <Button variant="gradient" size="sm" onClick={openCreate} type="button">
          <Plus className="w-4 h-4" />
          New Exam
        </Button>
      </div>

      <DataTable
        data={exams ?? []}
        columns={columns}
        isLoading={isLoading}
        actions={[
          { label: 'Edit', icon: 'edit', onClick: openEdit },
          { label: 'Delete', icon: 'delete', variant: 'danger', onClick: setExamToDelete },
        ]}
        emptyTitle="No exams yet"
        emptyDescription="Create one to get started."
        emptyAction={
          <Button variant="secondary" size="sm" onClick={openCreate} type="button">
            <Plus className="w-4 h-4" /> New Exam
          </Button>
        }
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit Exam' : 'New Exam'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" type="button" onClick={handleSave} isLoading={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Exam'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Input
              id="exam-name"
              label="Exam Name"
              list="standard-exam-names"
              placeholder="e.g. Mid Term"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <datalist id="standard-exam-names">
              <option value="Mid Term" />
              <option value="Half Yearly" />
              <option value="Final Term" />
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="exam-startDate"
              type="date"
              label="Start Date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
            <Input
              id="exam-endDate"
              type="date"
              label="End Date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>

          <Checkbox
            id="exam-isActive"
            label="Active"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!examToDelete}
        title="Delete exam"
        message={`Delete exam "${examToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteExam.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setExamToDelete(null)}
      />
    </div>
  );
};

export default ManageExamsTab;
