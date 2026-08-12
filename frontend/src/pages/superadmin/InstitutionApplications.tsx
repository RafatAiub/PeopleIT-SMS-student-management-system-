import React, { useEffect, useState } from 'react';
import { FileText, CheckCircle2, XCircle, Clock, Copy, Link as LinkIcon, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import {
  institutionApplicationApi,
  type ApproveApplicationResult,
  type InstitutionApplication,
} from '../../api/institutionApplication.api';

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20',
};

export const InstitutionApplications: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [applications, setApplications] = useState<InstitutionApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<ApproveApplicationResult | null>(null);

  const [rejectTarget, setRejectTarget] = useState<InstitutionApplication | null>(null);
  const [rejectReason, setRejectReason] = useState('');
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
      toast.error('Please provide a reason (at least 5 characters)');
      return;
    }
    setRejecting(true);
    try {
      await institutionApplicationApi.reject(rejectTarget.id, rejectReason.trim());
      toast.success('Application rejected');
      setRejectTarget(null);
      setRejectReason('');
      fetchApplications();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reject application');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="glass-card p-6 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-primary-500 to-accent-400" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Institution Applications</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Review self-service applications submitted through the public registration link.
              </p>
            </div>
          </div>

          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md min-h-[44px]"
          >
            <LinkIcon className="w-4 h-4" /> Copy Application Link
          </button>
        </div>
      </div>

      {/* Filter Tabs + Table */}
      <div className="glass-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl space-y-6">
        <div className="flex items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[36px] ${
                statusFilter === tab.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-transparent text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-white/10 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-white/5">
                <th className="p-4 pl-6">Institution</th>
                <th className="p-4">Applicant</th>
                <th className="p-4">Status</th>
                <th className="p-4">Submitted</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
                      <span>Loading applications...</span>
                    </div>
                  </td>
                </tr>
              ) : applications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500 italic">
                    No {statusFilter.toLowerCase()} applications found.
                  </td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{app.institutionName}</p>
                          <p className="text-[10px] font-mono text-blue-600 dark:text-blue-400">EIIN: {app.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {app.applicantFirstName} {app.applicantLastName}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">{app.applicantEmail}</p>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase font-mono border ${STATUS_BADGE[app.status]}`}>
                        {app.status}
                      </span>
                      {app.status === 'REJECTED' && app.rejectionReason && (
                        <p className="text-[10px] text-rose-500 mt-1 max-w-[200px]">{app.rejectionReason}</p>
                      )}
                    </td>
                    <td className="p-4 font-mono text-slate-500 text-[11px]">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 pr-6">
                      {app.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(app)}
                            disabled={approvingId === app.id}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-xl text-[11px] disabled:opacity-50 min-h-[36px]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {approvingId === app.id ? 'Approving…' : 'Approve'}
                          </button>
                          <button
                            onClick={() => {
                              setRejectTarget(app);
                              setRejectReason('');
                            }}
                            className="flex items-center gap-1 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20 font-bold px-3 py-2 rounded-xl text-[11px] min-h-[36px]"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      )}
                      {app.status !== 'PENDING' && (
                        <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400">
                          <Clock className="w-3 h-3" />
                          {app.reviewedAt ? new Date(app.reviewedAt).toLocaleDateString() : '—'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Reason Modal */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} className="max-w-md">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Reject Application</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          {rejectTarget?.institutionName} — {rejectTarget?.applicantEmail}
        </p>
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason *</label>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Explain why this application is being rejected..."
          rows={4}
          className="input-field resize-none"
        />
        <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-200 dark:border-white/5">
          <button
            onClick={() => setRejectTarget(null)}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            disabled={rejecting}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs disabled:opacity-50 min-h-[44px]"
          >
            {rejecting ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
        </div>
      </Modal>

      {/* Approval Credentials Reveal Modal */}
      <Modal isOpen={!!approvalResult} onClose={() => setApprovalResult(null)} className="max-w-lg">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex items-center gap-3 mb-5">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Institution Approved!</h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Save or copy these login credentials now — the password won't be shown again.
            </p>
          </div>
        </div>

        {approvalResult && (
          <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Institution</span>
              <p className="text-base font-bold text-slate-900 dark:text-white">{approvalResult.institution.name}</p>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {approvalResult.institution.slug}</p>
            </div>

            <div className="border-t border-slate-200 dark:border-white/5 pt-3 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Admin Login Credentials</span>
              <div>
                <span className="text-xs text-slate-500 block">Email Address:</span>
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
          <button
            onClick={() => {
              if (!approvalResult) return;
              const text = `Institution: ${approvalResult.institution.name}\nEIIN / Code: ${approvalResult.institution.slug}\nAdmin Email: ${approvalResult.admin.email}\nPassword: ${approvalResult.adminPassword}\nPortal Login URL: ${window.location.origin}/login`;
              navigator.clipboard.writeText(text);
              toast.success('Credentials copied to clipboard!');
            }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md min-h-[44px]"
          >
            <Copy className="w-4 h-4" /> Copy All Credentials
          </button>
          <button
            onClick={() => setApprovalResult(null)}
            className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs min-h-[44px]"
          >
            Done
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default InstitutionApplications;
