import React, { useEffect, useState } from 'react';
import { ShieldCheck, Phone, Mail, Building2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/ui/Display';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { DescriptionList } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { formatDate } from '@/i18n';
import { leadApi, type Lead, type LeadStatus } from '@/api/lead.api';
import { authorizedEmailApi } from '@/api/authorizedEmail.api';

const STATUS_TABS: Array<{ id: string; label: string }> = [
  { id: '', label: 'All' },
  { id: 'NEW', label: 'New' },
  { id: 'CONTACTED', label: 'Contacted' },
  { id: 'CONVERTED', label: 'Converted' },
  { id: 'DISMISSED', label: 'Dismissed' },
];

const STATUS_VARIANT: Record<LeadStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  NEW: 'info',
  CONTACTED: 'warning',
  CONVERTED: 'success',
  DISMISSED: 'neutral',
};

export const Leads: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailTarget, setDetailTarget] = useState<Lead | null>(null);
  const [authorizeTarget, setAuthorizeTarget] = useState<Lead | null>(null);
  const [authorizeEmail, setAuthorizeEmail] = useState('');
  const [authorizeError, setAuthorizeError] = useState<string>();
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
    setAuthorizeError(undefined);
  };

  const handleAuthorize = async () => {
    if (!authorizeTarget) return;
    const email = authorizeEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthorizeError('Enter a valid email address');
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
      setDetailTarget(null);
      fetchLeads();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to authorize this lead');
    } finally {
      setAuthorizing(false);
    }
  };

  const columns: Column<Lead>[] = [
    {
      key: 'contact',
      header: 'Contact',
      primary: true,
      render: (lead) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{lead.name}</p>
          <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
            <Phone className="w-3 h-3" /> {lead.phone}
          </p>
          {lead.email && (
            <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
              <Mail className="w-3 h-3" /> {lead.email}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'institution',
      header: 'Institution',
      render: (lead) =>
        lead.institutionName ? (
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-200">{lead.institutionName}</p>
              {lead.institutionType && <p className="text-[10px] text-slate-500">{lead.institutionType}</p>}
            </div>
          </div>
        ) : (
          <span className="text-slate-400 italic">Not specified</span>
        ),
    },
    {
      key: 'source',
      header: 'Source',
      hideOnMobile: true,
      render: (lead) => <span className="text-slate-500 dark:text-slate-400">{lead.source || 'Direct'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (lead) => (
        <div>
          <Badge variant={STATUS_VARIANT[lead.status]}>{lead.status}</Badge>
          {lead.authorizedEmail && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {lead.authorizedEmail.email}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'received',
      header: 'Received',
      hideOnMobile: true,
      render: (lead) => <span className="text-slate-500 dark:text-slate-400 text-xs">{formatDate(lead.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="Leads"
        description="Contacts captured from the public request-demo form. Qualify and authorize them to let them submit the real institution application."
      />

      <Tabs tabs={STATUS_TABS} value={statusFilter} onChange={setStatusFilter} variant="pills" label="Filter by status" idPrefix="lead-status" />

      <DataTable
        data={leads}
        columns={columns}
        isLoading={loading}
        onRowClick={(lead) => setDetailTarget(lead)}
        emptyTitle="No leads found"
        emptyDescription="Leads submitted through the public request-demo form will appear here."
        actions={[
          {
            label: 'Authorize',
            onClick: (lead) => openAuthorize(lead),
          },
        ]}
      />

      {/* Detail drawer */}
      <Drawer isOpen={!!detailTarget} onClose={() => setDetailTarget(null)} title={detailTarget?.name} width="md">
        {detailTarget && (
          <div className="space-y-5">
            <Badge variant={STATUS_VARIANT[detailTarget.status]}>{detailTarget.status}</Badge>
            <DescriptionList
              columns={1}
              items={[
                { label: 'Phone', value: detailTarget.phone },
                { label: 'Email', value: detailTarget.email },
                { label: 'Institution', value: detailTarget.institutionName },
                { label: 'Institution type', value: detailTarget.institutionType },
                { label: 'Source', value: detailTarget.source || 'Direct' },
                { label: 'Message', value: detailTarget.message },
                { label: 'Received', value: formatDate(detailTarget.createdAt) },
                { label: 'Authorized email', value: detailTarget.authorizedEmail?.email },
              ]}
            />
            {(detailTarget.status === 'NEW' || detailTarget.status === 'CONTACTED') && (
              <Button variant="gradient" fullWidth onClick={() => openAuthorize(detailTarget)}>
                <ShieldCheck className="w-4 h-4" /> Authorize &amp; convert
              </Button>
            )}
          </div>
        )}
      </Drawer>

      {/* Authorize modal — prompts for email when the lead has none */}
      <Modal isOpen={!!authorizeTarget} onClose={() => setAuthorizeTarget(null)} title="Authorize this lead" size="md">
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
          {authorizeTarget?.name} ({authorizeTarget?.phone}) will be allowed to submit the institution application with this email.
        </p>

        <Input
          label="Email"
          required
          type="email"
          value={authorizeEmail}
          onChange={(e) => { setAuthorizeEmail(e.target.value); setAuthorizeError(undefined); }}
          error={authorizeError}
          placeholder="applicant@example.com"
          disabled={!!authorizeTarget?.email}
          helperText={authorizeTarget?.email && !authorizeError ? 'This lead already provided an email — reuse it as-is.' : undefined}
        />

        <div className="flex gap-3 mt-6 justify-end">
          <Button variant="secondary" onClick={() => setAuthorizeTarget(null)} disabled={authorizing}>Cancel</Button>
          <Button variant="gradient" isLoading={authorizing} onClick={handleAuthorize}>Authorize &amp; convert</Button>
        </div>
      </Modal>
    </div>
  );
};

export default Leads;
