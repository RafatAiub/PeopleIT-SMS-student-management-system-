import React, { useState } from 'react';
import { CalendarPlus, X as XIcon } from 'lucide-react';
import { useTableParams } from '@/hooks/useTableParams';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/common/EmptyState';
import {
  useLeaveTypes,
  useMyLeaveRequests,
  useCreateLeaveRequest,
  useCancelLeaveRequest,
} from '@/hooks/useLeave';
import type { LeaveRequest, LeaveAudience } from '@/api/leave.api';

interface ApplyFormState {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

const EMPTY_FORM: ApplyFormState = { leaveTypeId: '', startDate: '', endDate: '', reason: '' };

interface MyLeaveRequestsProps {
  /** STUDENT requests have no leave-type concept — the type field is hidden
   *  and never sent. Defaults to STAFF for any existing caller. */
  audience?: LeaveAudience;
}

export default function MyLeaveRequests({ audience = 'STAFF' }: MyLeaveRequestsProps) {
  const isStudent = audience === 'STUDENT';
  const { data: leaveTypes = [] } = useLeaveTypes(false, !isStudent);
  const { params, setPage } = useTableParams();
  const { data: requestsData, isLoading } = useMyLeaveRequests({ page: params.page, pageSize: params.pageSize });

  const createMutation = useCreateLeaveRequest();
  const cancelMutation = useCancelLeaveRequest();

  const [form, setForm] = useState<ApplyFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);

  const validate = (state: ApplyFormState): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!isStudent && !state.leaveTypeId) next.leaveTypeId = 'Select a leave type';
    if (!state.startDate) next.startDate = 'Start date is required';
    if (!state.endDate) next.endDate = 'End date is required';
    if (state.startDate && state.endDate && state.endDate < state.startDate) {
      next.endDate = 'End date must be on or after the start date';
    }
    const trimmedReason = state.reason.trim();
    if (!trimmedReason) next.reason = 'Reason is required';
    else if (trimmedReason.length < 10) next.reason = 'Reason must be at least 10 characters';
    return next;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    createMutation.mutate(
      {
        ...(isStudent ? {} : { leaveTypeId: form.leaveTypeId }),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
      },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM);
          setErrors({});
        },
      }
    );
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget) return;
    cancelMutation.mutate(cancelTarget.id, { onSuccess: () => setCancelTarget(null) });
  };

  const requests = requestsData?.data || [];
  const total = requestsData?.meta?.total || 0;
  const totalPages = requestsData?.meta?.totalPages || 1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">My Leave Requests</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Apply for leave and track the status of your requests.</p>
      </div>

      {/* Apply for Leave form */}
      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-xs p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarPlus className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Apply for Leave</h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={`grid grid-cols-1 gap-4 ${isStudent ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {!isStudent && (
              <div>
                <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Leave Type *</label>
                <select
                  value={form.leaveTypeId}
                  onChange={(e) => setForm((prev) => ({ ...prev, leaveTypeId: e.target.value }))}
                  className={`input-field ${errors.leaveTypeId ? 'border-rose-500 focus:ring-rose-500' : ''}`}
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.isPaid ? 'Paid' : 'Unpaid'})</option>
                  ))}
                </select>
                {errors.leaveTypeId && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errors.leaveTypeId}</p>}
              </div>
            )}
            <div>
              <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Start Date *</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                className={`input-field ${errors.startDate ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {errors.startDate && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">End Date *</label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                className={`input-field ${errors.endDate ? 'border-rose-500 focus:ring-rose-500' : ''}`}
              />
              {errors.endDate && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errors.endDate}</p>}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-700 dark:text-slate-400 font-medium mb-1 block">Reason *</label>
            <textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Briefly explain the reason for your leave (min 10 characters)..."
              className={`input-field resize-none ${errors.reason ? 'border-rose-500 focus:ring-rose-500' : ''}`}
            />
            {errors.reason && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{errors.reason}</p>}
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="gradient" isLoading={createMutation.isPending} className="py-2.5 px-5 text-sm">
              Submit Request
            </Button>
          </div>
        </form>
      </div>

      {/* My requests list */}
      <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-xs">
        <div className="p-4 border-b border-slate-200/50 dark:border-white/5">
          <h3 className="text-md font-semibold text-slate-900 dark:text-white">Request History</h3>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">Loading your leave requests...</div>
        ) : requests.length === 0 ? (
          <EmptyState title="No leave requests yet" description="Requests you submit will show up here." />
        ) : (
          <>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {requests.map((r) => (
                <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-white">{r.leaveType?.name ?? 'Leave'}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()} · {r.totalDays} day{r.totalDays === 1 ? '' : 's'}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">{r.reason}</p>
                    {(r.status === 'APPROVED' || r.status === 'REJECTED') && r.reviewerComment && (
                      <div className="text-xs mt-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {r.reviewedBy ? `${r.reviewedBy.firstName} ${r.reviewedBy.lastName}` : 'Reviewer'} said:
                        </span>{' '}
                        {r.reviewerComment}
                      </div>
                    )}
                  </div>
                  {r.status === 'PENDING' && (
                    <button
                      onClick={() => setCancelTarget(r)}
                      className="inline-flex items-center gap-1.5 self-start sm:self-center bg-rose-50 dark:bg-rose-600/20 hover:bg-rose-100 dark:hover:bg-rose-600/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-white/5 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Page {params.page} of {totalPages} · {total} total request{total === 1 ? '' : 's'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={params.page <= 1}
                    onClick={() => setPage(params.page - 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    disabled={params.page >= totalPages}
                    onClick={() => setPage(params.page + 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={!!cancelTarget}
        title="Cancel leave request"
        message={
          cancelTarget
            ? `Cancel your ${cancelTarget.leaveType?.name ?? 'leave'} request for ${new Date(cancelTarget.startDate).toLocaleDateString()} – ${new Date(cancelTarget.endDate).toLocaleDateString()}? This cannot be undone.`
            : ''
        }
        confirmLabel="Cancel Request"
        cancelLabel="Keep Request"
        variant="danger"
        isLoading={cancelMutation.isPending}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
