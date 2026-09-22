import React, { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useLeaveTypes, useCreateLeaveType, useUpdateLeaveType, useDeleteLeaveType } from '@/hooks/useLeave';
import type { LeaveType } from '@/api/leave.api';

interface LeaveTypeFormState {
  name: string;
  description: string;
  isPaid: boolean;
  color: string;
  isActive: boolean;
}

const EMPTY_LEAVE_TYPE_FORM: LeaveTypeFormState = { name: '', description: '', isPaid: true, color: '', isActive: true };

export default function LeaveSettings() {
  const { data: leaveTypes = [] } = useLeaveTypes(true);
  const createLeaveTypeMutation = useCreateLeaveType();
  const updateLeaveTypeMutation = useUpdateLeaveType();
  const deleteLeaveTypeMutation = useDeleteLeaveType();

  const [isLeaveTypeModalOpen, setIsLeaveTypeModalOpen] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);
  const [leaveTypeForm, setLeaveTypeForm] = useState<LeaveTypeFormState>(EMPTY_LEAVE_TYPE_FORM);
  const [leaveTypeSubmitting, setLeaveTypeSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteLeaveTypeMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const openCreateLeaveTypeModal = () => {
    setEditingLeaveType(null);
    setLeaveTypeForm(EMPTY_LEAVE_TYPE_FORM);
    setIsLeaveTypeModalOpen(true);
  };

  const openEditLeaveTypeModal = (leaveType: LeaveType) => {
    setEditingLeaveType(leaveType);
    setLeaveTypeForm({
      name: leaveType.name,
      description: leaveType.description || '',
      isPaid: leaveType.isPaid,
      color: leaveType.color || '',
      isActive: leaveType.isActive,
    });
    setIsLeaveTypeModalOpen(true);
  };

  const handleLeaveTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveTypeForm.name.trim()) return;
    setLeaveTypeSubmitting(true);
    try {
      if (editingLeaveType) {
        await updateLeaveTypeMutation.mutateAsync({
          id: editingLeaveType.id,
          data: {
            name: leaveTypeForm.name.trim(),
            description: leaveTypeForm.description.trim() || undefined,
            isPaid: leaveTypeForm.isPaid,
            color: leaveTypeForm.color.trim() || undefined,
            isActive: leaveTypeForm.isActive,
          },
        });
      } else {
        await createLeaveTypeMutation.mutateAsync({
          name: leaveTypeForm.name.trim(),
          description: leaveTypeForm.description.trim() || undefined,
          isPaid: leaveTypeForm.isPaid,
          color: leaveTypeForm.color.trim() || undefined,
        });
      }
      setIsLeaveTypeModalOpen(false);
    } finally {
      setLeaveTypeSubmitting(false);
    }
  };

  const handleToggleActive = (leaveType: LeaveType) => {
    updateLeaveTypeMutation.mutate({ id: leaveType.id, data: { isActive: !leaveType.isActive } });
  };

  const leaveTypeColumns: Column<LeaveType>[] = [
    {
      key: 'name',
      header: 'Name',
      accessor: 'name',
      render: (t) => (
        <div className="flex items-center gap-2">
          {t.color && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />}
          <span className="font-semibold text-slate-900 dark:text-white">{t.name}</span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      sortable: false,
      render: (t) => <span className="text-xs text-slate-600 dark:text-slate-400">{t.description || '—'}</span>,
    },
    {
      key: 'isPaid',
      header: 'Paid / Unpaid',
      sortable: false,
      render: (t) => <Badge variant={t.isPaid ? 'success' : 'neutral'}>{t.isPaid ? 'Paid' : 'Unpaid'}</Badge>,
    },
    {
      key: 'isActive',
      header: 'Active',
      sortable: false,
      render: (t) => (
        <button
          onClick={() => handleToggleActive(t)}
          title={t.isActive ? 'Deactivate this leave type' : 'Activate this leave type'}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
            t.isActive
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
              : 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10'
          }`}
        >
          {t.isActive ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (t) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => openEditLeaveTypeModal(t)}
            title="Edit leave type"
            aria-label={`Edit ${t.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDeleteTarget(t)}
            title="Delete leave type"
            aria-label={`Delete ${t.name}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Leave Settings</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Manage the leave types staff and students can request against.</p>
        </div>
        <Button variant="gradient" onClick={openCreateLeaveTypeModal} className="px-4 py-2.5 text-sm self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          Add Leave Type
        </Button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 shadow-xs p-4">
        <DataTable
          data={leaveTypes}
          columns={leaveTypeColumns}
          emptyTitle="No leave types yet"
          emptyDescription="Add a leave type to let staff and students start requesting leave."
        />
      </div>

      {/* Create / Edit Leave Type modal */}
      <Modal isOpen={isLeaveTypeModalOpen} onClose={() => setIsLeaveTypeModalOpen(false)} className="max-w-lg p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 rounded-t-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {editingLeaveType ? `Edit ${editingLeaveType.name}` : 'Add Leave Type'}
          </h3>
        </div>
        <form onSubmit={handleLeaveTypeSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Name *</label>
            <input
              type="text"
              required
              value={leaveTypeForm.name}
              onChange={(e) => setLeaveTypeForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Casual Leave"
              className="input-field"
            />
          </div>
          <div>
            <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Description</label>
            <textarea
              rows={2}
              value={leaveTypeForm.description}
              onChange={(e) => setLeaveTypeForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description"
              className="input-field resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => setIsLeaveTypeModalOpen(false)} className="py-2 px-4 text-sm">
              Cancel
            </Button>
            <Button type="submit" variant="gradient" isLoading={leaveTypeSubmitting} className="py-2 px-5 text-sm">
              {editingLeaveType ? 'Save Changes' : 'Create Leave Type'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete leave type"
        message={
          deleteTarget
            ? `Permanently delete "${deleteTarget.name}"? This only works if no leave request has ever used it — if it's in use, deactivate it instead.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteLeaveTypeMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
