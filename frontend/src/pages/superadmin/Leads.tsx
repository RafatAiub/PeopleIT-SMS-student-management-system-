import React, { useEffect, useState } from 'react';
import { Megaphone, ShieldCheck, Phone, Mail, Building2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { leadApi, type Lead, type LeadStatus } from '../../api/lead.api';
import { authorizedEmailApi } from '../../api/authorizedEmail.api';

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'DISMISSED', label: 'Dismissed' },
];

const STATUS_BADGE: Record<LeadStatus, string> = {
  NEW: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
  CONTACTED: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  CONVERTED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  DISMISSED: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10',
};

export const Leads: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [authorizeTarget, setAuthorizeTarget] = useState<Lead | null>(null);
  const [authorizeEmail, setAuthorizeEmail] = useState('');
  const [authorizing, setAuthorizing] = useState(false);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const data = await leadApi.list(statusFilter || undefined);
      setLeads(data);
    } catch (err) {
      console.error('Failed to fetch leads', err);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const openAuthorize = (lead: Lead) => {
    setAuthorizeTarget(lead);
    setAuthorizeEmail(lead.email || '');
  };

  const handleAuthorize = async () => {
    if (!authorizeTarget) return;
    const email = authorizeEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }

    setAuthorizing(true);
    try {
      const note = `Converted from lead #${authorizeTarget.id} — ${authorizeTarget.institutionName || 'N/A'}`;
      const authorizedEmail = await authorizedEmailApi.add({ email, note });
      await leadApi.update(authorizeTarget.id, {
        status: 'CONVERTED',
        email,
        authorizedEmailId: authorizedEmail.id,
      });
      toast.success('Email authorized and lead marked converted!');
      setAuthorizeTarget(null);
      setAuthorizeEmail('');
      fetchLeads();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to authorize this lead');
    } finally {
      setAuthorizing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl">
            <Megaphone className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Leads</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Contacts captured from the public request-demo form. Qualify and authorize them to let them submit the
              real institution application.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs + Table */}
      <div className="glass-card p-6 space-y-6">
        <div className="flex items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[36px] ${
                statusFilter === tab.value
                  ? 'bg-primary-600 text-white border-primary-600'
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
                <th className="p-4 pl-6">Contact</th>
                <th className="p-4">Institution</th>
                <th className="p-4">Source</th>
                <th className="p-4">Status</th>
                <th className="p-4">Received</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5 text-xs text-slate-700 dark:text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500" />
                      <span>Loading leads...</span>
                    </div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500 italic">
                    No leads found.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="p-4 pl-6">
                      <p className="font-bold text-slate-900 dark:text-white">{lead.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {lead.phone}
                      </p>
                      {lead.email && (
                        <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {lead.email}
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      {lead.institutionName ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{lead.institutionName}</p>
                            {lead.institutionType && <p className="text-[10px] text-slate-500">{lead.institutionType}</p>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not specified</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500">{lead.source || 'Direct'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase font-mono border ${STATUS_BADGE[lead.status]}`}>
                        {lead.status}
                      </span>
                      {lead.authorizedEmail && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {lead.authorizedEmail.email}
                        </p>
                      )}
                    </td>
                    <td className="p-4 font-mono text-slate-500 text-[11px]">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      {(lead.status === 'NEW' || lead.status === 'CONTACTED') && (
                        <button
                          onClick={() => openAuthorize(lead)}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-xl text-[11px] min-h-[36px] ml-auto"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Authorize
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Authorize Modal — prompts for email when the lead has none */}
      <Modal isOpen={!!authorizeTarget} onClose={() => setAuthorizeTarget(null)} className="max-w-md">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-full border flex items-center justify-center flex-shrink-0 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20">
            <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Authorize this lead</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
              {authorizeTarget?.name} ({authorizeTarget?.phone}) will be allowed to submit the institution
              application with this email.
            </p>
          </div>
        </div>

        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email *</label>
        <input
          type="email"
          value={authorizeEmail}
          onChange={(e) => setAuthorizeEmail(e.target.value)}
          placeholder="applicant@example.com"
          className="input-field"
          disabled={!!authorizeTarget?.email}
        />
        {authorizeTarget?.email && (
          <p className="text-[11px] text-slate-500 mt-1">This lead already provided an email — reuse it as-is.</p>
        )}

        <div className="flex gap-3 mt-6 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setAuthorizeTarget(null)} disabled={authorizing}>
            Cancel
          </Button>
          <button
            onClick={handleAuthorize}
            disabled={authorizing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
          >
            {authorizing ? 'Authorizing…' : 'Authorize & Convert'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Leads;
