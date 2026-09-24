import React, { useState } from 'react';
import { Check, X as XIcon, Trash2 } from 'lucide-react';
import { useTableParams } from '@/hooks/useTableParams';
import { DataTable, Column } from '@/components/DataTable/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  useAllLeaveRequests,
  useLeaveTypes,
  useApproveLeaveRequest,
  useRejectLeaveRequest,
  useDeleteLeaveRequest,
} from '@/hooks/useLeave';
import type { LeaveRequest, LeaveRequestFilters, LeaveRequestStatus, LeaveAudience } from '@/api/leave.api';
import { ApplicantFilter, type UserOption } from './ApplicantFilter';

interface LeaveRequestManagementProps {
  audience: LeaveAudience;
}

const COPY: Record<LeaveAudience, { title: string; subtitle: string; placeholder: string; emptyTitle: string }> = {
  STAFF: {
    title: 'Leave Request',
    subtitle: 'Review and act on staff leave requests.',
    placeholder: 'Filter by staff member...',
    emptyTitle: 'No staff leave requests found',
  },
  STUDENT: {
    title: 'Student Leave',
    subtitle: 'Review and act on student leave requests.',
    placeholder: 'Filter by student...',
    emptyTitle: 'No student leave requests found',
  },
};

export default function LeaveRequestManagement({ audience }: LeaveRequestManagementProps) {
  const copy = COPY[audience];
  // Student Leave has no leave-type concept — no type filter, no type column.
  const showLeaveType = audience === 'STAFF';
  const { params, setPage, setPageSize, setFilter } = useTableParams();
  const [applicantFilter, setApplicantFilter] = useState<UserOption | null>(null);

  const requestFilters: LeaveRequestFilters = {
    page: params.page,
    pageSize: params.pageSize,
    audience,
    ...(params.filters.status ? { status: params.filters.status as LeaveRequestStatus } : {}),
    ...(showLeaveType && params.filters.leaveTypeId ? { leaveTypeId: params.filters.leaveTypeId } : {}),
    ...(applicantFilter ? { applicantUserId: applicantFilter.id } : {}),
    ...(params.filters.dateFrom ? { dateFrom: params.filters.dateFrom } : {}),
    ...(params.filters.dateTo ? { dateTo: params.filters.dateTo } : {}),
  };

  const { data: requestsData, isLoading: requestsLoading } = useAllLeaveRequests(requestFilters);
  const { data: leaveTypes = [] } = useLeaveTypes(true, showLeaveType);

  const approveMutation = useApproveLeaveRequest();
  const rejectMutation = useRejectLeaveRequest();
  const deleteMutation = useDeleteLeaveRequest();

  const [approveTarget, setApproveTarget] = useState<LeaveRequest | null>(null);
  const [approveComment, setApproveComment] = useState('');
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<LeaveRequest | null>(null);

  const handleApplicantFilterChange = (u: UserOption | null) => {
    setApplicantFilter(u);
    setPage(1);
  };

  const handleApproveConfirm = () => {
    if (!approveTarget) return;
    approveMutation.mutate(
      { id: approveTarget.id, comment: approveComment.trim() || undefined },
      { onSuccess: () => { setApproveTarget(null); setApproveComment(''); } }
    );
  };

  const handleRejectConfirm = () => {
    if (!rejectTarget) return;
    const trimmed = rejectComment.trim();
    if (trimmed.length < 3) {
      setRejectError('A rejection reason is required (min 3 characters).');
      return;
    }
    rejectMutation.mutate(
      { id: rejectTarget.id, comment: trimmed },
      { onSuccess: () => { setRejectTarget(null); setRejectComment(''); setRejectError(''); } }
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const requestColumns: Column<LeaveRequest>[] = [
    {
      key: 'applicant',
      header: audience === 'STUDENT' ? 'Student' : 'Applicant',
      sortable: false,
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">{r.applicant.firstName} {r.applicant.lastName}</div>
          <div className="text-xs text-slate-500">{r.applicant.email}</div>
        </div>
      ),
    },
    ...(showLeaveType ? [{
      key: 'leaveType',
      header: 'Leave Type',
      sortable: false,
      render: (r: LeaveRequest) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800 dark:text-slate-200">{r.leaveType?.name ?? '—'}</span>
          {r.leaveType && (
            <Badge variant={r.leaveType.isPaid ? 'success' : 'neutral'}>{r.leaveType.isPaid ? 'Paid' : 'Unpaid'}</Badge>
          )}
        </div>
      ),
    } as Column<LeaveRequest>] : []),
    {
      key: 'dates',
      header: 'Dates',
      sortable: false,
      render: (r) => (
        <div className="text-xs text-slate-700 dark:text-slate-300">
          {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}
          <div className="text-slate-500">{r.totalDays} day{r.totalDays === 1 ? '' : 's'}</div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      sortable: false,
      render: (r) => (
        <span className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 max-w-xs block" title={r.reason}>
          {r.reason}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (r) => (
        <div>
          <StatusBadge status={r.status} />
          {r.status !== 'PENDING' && r.reviewerComment && (
            <div className="text-[11px] text-slate-500 mt-1 max-w-[10rem] truncate" title={r.reviewerComment}>
              &ldquo;{r.reviewerComment}&rdquo;
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {r.status === 'PENDING' && (
            <>
              <button
                onClick={() => setApproveTarget(r)}
                className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-100 dark:hover:bg-emerald-600/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
              >
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                onClick={() => setRejectTarget(r)}
                className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-600/20 hover:bg-rose-100 dark:hover:bg-rose-600/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
              >
                <XIcon className="w-3.5 h-3.5" /> Reject
              </button>
            </>
          )}
          <button
            onClick={() => setDeleteTarget(r)}
            title="Delete leave request"
            className="inline-flex items-center gap-1 bg-slate-50 dark:bg-white/5 hover:bg-rose-100 dark:hover:bg-rose-600/30 text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-400 border border-slate-200 dark:border-white/10 hover:border-rose-200 dark:hover:border-rose-500/30 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{copy.title}</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">{copy.subtitle}</p>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/50 dark:border-white/5 shadow-xs">
        <div className="p-4 border-b border-slate-200/50 dark:border-white/5 flex flex-wrap items-center gap-3">
          <select
            value={params.filters.status || ''}
            onChange={(e) => setFilter('status', e.target.value)}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 cursor-pointer transition-colors"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          {showLeaveType && (
            <select
              value={params.filters.leaveTypeId || ''}
              onChange={(e) => setFilter('leaveTypeId', e.target.value)}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 cursor-pointer transition-colors"
            >
              <option value="">All Leave Types</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <ApplicantFilter
            value={applicantFilter}
            onChange={handleApplicantFilterChange}
            role={audience === 'STUDENT' ? 'STUDENT' : undefined}
            placeholder={copy.placeholder}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">From</label>
            <input
              type="date"
              value={params.filters.dateFrom || ''}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <label className="text-xs text-slate-500 dark:text-slate-400">To</label>
            <input
              type="date"
              value={params.filters.dateTo || ''}
              onChange={(e) => setFilter('dateTo', e.target.value)}
              className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          </div>
        </div>

        <div className="p-4">
          <DataTable
            data={requestsData?.data || []}
            columns={requestColumns}
            isLoading={requestsLoading}
            serverPagination
            totalCount={requestsData?.meta?.total || 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            emptyTitle={copy.emptyTitle}
            emptyDescription="Try adjusting your filters."
          />
        </div>
      </div>

      {/* Approve modal */}
      <Modal isOpen={!!approveTarget} onClose={() => { setApproveTarget(null); setApproveComment(''); }} className="max-w-md p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 rounded-t-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Approve Leave Request</h3>
        </div>
        <div className="p-6 space-y-4">
          {approveTarget && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Approve {approveTarget.applicant.firstName} {approveTarget.applicant.lastName}'s {approveTarget.leaveType?.name ?? 'leave'} request
              ({new Date(approveTarget.startDate).toLocaleDateString()} – {new Date(approveTarget.endDate).toLocaleDateString()})?
            </p>
          )}
          <div>
            <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Comment (optional)</label>
            <textarea
              rows={3}
              value={approveComment}
              onChange={(e) => setApproveComment(e.target.value)}
              placeholder="Add an optional note for the applicant..."
              className="input-field resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => { setApproveTarget(null); setApproveComment(''); }} className="py-2 px-4 text-sm">
              Cancel
            </Button>
            <Button
              type="button"
              variant="gradient"
              isLoading={approveMutation.isPending}
              onClick={handleApproveConfirm}
              className="py-2 px-5 text-sm"
            >
              Approve
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal isOpen={!!rejectTarget} onClose={() => { setRejectTarget(null); setRejectComment(''); setRejectError(''); }} className="max-w-md p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 rounded-t-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Reject Leave Request</h3>
        </div>
        <div className="p-6 space-y-4">
          {rejectTarget && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Reject {rejectTarget.applicant.firstName} {rejectTarget.applicant.lastName}'s {rejectTarget.leaveType?.name ?? 'leave'} request?
            </p>
          )}
          <div>
            <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Reason *</label>
            <textarea
              rows={3}
              value={rejectComment}
              onChange={(e) => { setRejectComment(e.target.value); if (rejectError) setRejectError(''); }}
              placeholder="Explain why this request is being rejected (min 3 characters)..."
              className={`input-field resize-none ${rejectError ? 'border-rose-500 focus:ring-rose-500' : ''}`}
            />
            {rejectError && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{rejectError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
            <Button type="button" variant="secondary" onClick={() => { setRejectTarget(null); setRejectComment(''); setRejectError(''); }} className="py-2 px-4 text-sm">
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={rejectMutation.isPending}
              onClick={handleRejectConfirm}
              className="py-2 px-5 text-sm"
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete leave request"
        message={
          deleteTarget
            ? `Permanently delete ${deleteTarget.applicant.firstName} ${deleteTarget.applicant.lastName}'s ${deleteTarget.leaveType?.name ?? 'leave'} request? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
