import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Copy, Link as LinkIcon, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Tabs } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DescriptionList } from '@/components/ui/Display';
import { formatDate } from '@/i18n';
import {
  institutionApplicationApi,
  type ApproveApplicationResult,
  type InstitutionApplication,
} from '@/api/institutionApplication.api';

const STATUS_TABS = [
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
];

export const InstitutionApplications: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [applications, setApplications] = useState<InstitutionApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailTarget, setDetailTarget] = useState<InstitutionApplication | null>(null);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<ApproveApplicationResult | null>(null);

  const [rejectTarget, setRejectTarget] = useState<InstitutionApplication | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string>();
  const [rejecting, setRejecting] = useState(false);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const data = await institutionApplicationApi.list(statusFilter);
      setApplications(data);
    } catch (err) {
      console.error('Failed to fetch institution applications', err);
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/apply`;
    navigator.clipboard.writeText(url);
    toast.success('Application link copied to clipboard!');
  };

  const handleApprove = async (application: InstitutionApplication) => {
    setApprovingId(application.id);
    try {
      const result = await institutionApplicationApi.approve(application.id);
      setApprovalResult(result);
      toast.success('Institution approved and Admin account created!');
      setDetailTarget(null);
      fetchApplications();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to approve application');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 5) {
      setRejectError('Please provide a reason of at least 5 characters');
      return;
    }
    setRejecting(true);
    try {
      await institutionApplicationApi.reject(rejectTarget.id, rejectReason.trim());
      toast.success('Application rejected');
      setRejectTarget(null);
      setRejectReason('');
      setDetailTarget(null);
      fetchApplications();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reject application');
    } finally {
      setRejecting(false);
    }
  };

  const columns: Column<InstitutionApplication>[] = [
    {
      key: 'institution',
      header: 'Institution',
      primary: true,
      render: (app) => (
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">{app.institutionName}</p>
            <p className="text-[11px] font-mono text-blue-600 dark:text-blue-400">EIIN: {app.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'applicant',
      header: 'Applicant',
      render: (app) => (
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-200">{app.applicantFirstName} {app.applicantLastName}</p>
          <p className="text-[11px] text-slate-500 font-mono">{app.applicantEmail}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (app) => (
        <div>
          <StatusBadge status={app.status} />
          {app.status === 'REJECTED' && app.rejectionReason && (
            <p className="text-[10px] text-rose-500 mt-1 max-w-[200px]">{app.rejectionReason}</p>
          )}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      hideOnMobile: true,
      render: (app) => <span className="text-slate-500 dark:text-slate-400 text-xs">{formatDate(app.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="Institution applications"
        description="Review self-service applications submitted through the public registration link."
        actions={
          <Button variant="gradient" onClick={handleCopyLink}>
            <LinkIcon className="w-4 h-4" /> Copy application link
          </Button>
        }
      />

      <Tabs tabs={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} variant="pills" label="Filter by status" idPrefix="app-status" />

      <DataTable
        data={applications}
        columns={columns}
        isLoading={loading}
        onRowClick={(app) => setDetailTarget(app)}
        emptyTitle={`No ${statusFilter.toLowerCase()} applications`}
        emptyDescription="Applications submitted through the public link will appear here."
        actions={
          statusFilter === 'PENDING'
            ? [
                {
                  label: 'Approve',
                  onClick: (app) => handleApprove(app),
                },
                {
                  label: 'Reject',
                  variant: 'danger',
                  onClick: (app) => { setRejectTarget(app); setRejectReason(''); setRejectError(undefined); },
                },
              ]
            : undefined
        }
      />

      {/* Detail drawer */}
      <Drawer
        isOpen={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        title={detailTarget?.institutionName}
        description={detailTarget ? `Submitted ${formatDate(detailTarget.createdAt)}` : undefined}
        footer={
          detailTarget?.status === 'PENDING' ? (
            <>
              <Button
                variant="danger-soft"
                onClick={() => { setRejectTarget(detailTarget); setRejectReason(''); setRejectError(undefined); }}
              >
                <XCircle className="w-4 h-4" /> Reject
              </Button>
              <Button
                variant="gradient"
                isLoading={approvingId === detailTarget?.id}
                onClick={() => detailTarget && handleApprove(detailTarget)}
              >
                <CheckCircle2 className="w-4 h-4" /> Approve
              </Button>
            </>
          ) : undefined
        }
      >
        {detailTarget && (
          <div className="space-y-5">
            <StatusBadge status={detailTarget.status} />
            <DescriptionList
              columns={1}
              items={[
                { label: 'Institution name', value: detailTarget.institutionName },
                { label: 'EIIN / code', value: <span className="font-mono">{detailTarget.slug}</span> },
                { label: 'Address', value: detailTarget.address },
                { label: 'Phone', value: detailTarget.phone },
                { label: 'Applicant', value: `${detailTarget.applicantFirstName} ${detailTarget.applicantLastName}` },
                { label: 'Applicant email', value: detailTarget.applicantEmail },
                { label: 'Applicant phone', value: detailTarget.applicantPhone },
                { label: 'Message', value: detailTarget.message },
                { label: 'Submitted', value: formatDate(detailTarget.createdAt) },
                ...(detailTarget.status !== 'PENDING'
                  ? [
                      {
                        label: 'Reviewed by',
                        value: detailTarget.reviewedBy
                          ? `${detailTarget.reviewedBy.firstName} ${detailTarget.reviewedBy.lastName} (${detailTarget.reviewedBy.email})`
                          : null,
                      },
                      { label: 'Reviewed on', value: detailTarget.reviewedAt ? formatDate(detailTarget.reviewedAt) : null },
                    ]
                  : []),
                ...(detailTarget.status === 'REJECTED'
                  ? [{ label: 'Rejection reason', value: detailTarget.rejectionReason }]
                  : []),
              ]}
            />
          </div>
        )}
      </Drawer>

      {/* Reject reason modal */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject application" size="md">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {rejectTarget?.institutionName} — {rejectTarget?.applicantEmail}
        </p>
        <Textarea
          label="Reason"
          required
          value={rejectReason}
          onChange={(e) => { setRejectReason(e.target.value); setRejectError(undefined); }}
          error={rejectError}
          placeholder="Explain why this application is being rejected…"
          rows={4}
        />
        <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-200 dark:border-white/5">
          <Button variant="ghost" onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button variant="danger" isLoading={rejecting} onClick={handleReject}>Confirm rejection</Button>
        </div>
      </Modal>

      {/* Approval credentials reveal modal */}
      <Modal isOpen={!!approvalResult} onClose={() => setApprovalResult(null)} title="Institution approved" size="lg">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex items-center gap-3 mb-5">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Save or copy these login credentials now — the password won't be shown again.
          </p>
        </div>

        {approvalResult && (
          <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Institution</span>
              <p className="text-base font-bold text-slate-900 dark:text-white">{approvalResult.institution.name}</p>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {approvalResult.institution.slug}</p>
            </div>

            <div className="border-t border-slate-200 dark:border-white/5 pt-3 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Admin login credentials</span>
              <div>
                <span className="text-xs text-slate-500 block">Email address:</span>
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{approvalResult.admin.email}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Password:</span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-sm border border-emerald-200 dark:border-emerald-500/20 inline-block">
                  {approvalResult.adminPassword}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-200 dark:border-white/5">
          <Button
            variant="gradient"
            onClick={() => {
              if (!approvalResult) return;
              const text = `Institution: ${approvalResult.institution.name}\nEIIN / Code: ${approvalResult.institution.slug}\nAdmin Email: ${approvalResult.admin.email}\nPassword: ${approvalResult.adminPassword}\nPortal Login URL: ${window.location.origin}/login`;
              navigator.clipboard.writeText(text);
              toast.success('Credentials copied to clipboard!');
            }}
          >
            <Copy className="w-4 h-4" /> Copy all credentials
          </Button>
          <Button variant="secondary" onClick={() => setApprovalResult(null)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
};

export default InstitutionApplications;
