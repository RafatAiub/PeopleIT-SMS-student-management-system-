import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Link2, Search } from 'lucide-react';
import { PageHeader, Button, StatCard, Tabs, TabPanel, SkeletonStatGrid, ErrorState, Select } from '@/components/ui';
import { useT, formatNumber } from '@/i18n';
import { useEnquiryFunnel, useEnquiryAssignees, useCreateEnquiry, useUpdateEnquiry, useInstitutionSlug } from './enquiries.queries';
import EnquiryBoard from './EnquiryBoard';
import EnquiryList from './EnquiryList';
import EnquiryFormModal from './EnquiryFormModal';
import EnquiryDetailDrawer from './EnquiryDetailDrawer';
import type { Enquiry, EnquiryFormValues } from './enquiries.types';

type ViewTab = 'board' | 'list' | 'followups';

/** Admission enquiries CRM — funnel stats, then Board / List / Follow-ups due.
 * SUPER_ADMIN and ADMIN only, mirroring backend/src/modules/enquiries. */
export default function EnquiriesPage() {
  const t = useT();
  const [tab, setTab] = useState<ViewTab>('board');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [boardSearch, setBoardSearch] = useState('');
  const [boardAssignee, setBoardAssignee] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingEnquiry, setEditingEnquiry] = useState<Enquiry | null>(null);
  const [detailEnquiry, setDetailEnquiry] = useState<Enquiry | null>(null);

  const { data: assignees = [] } = useEnquiryAssignees();
  const { data: institution } = useInstitutionSlug();
  const funnel = useEnquiryFunnel({ from: fromDate || undefined, to: toDate || undefined });

  const createMutation = useCreateEnquiry();
  const updateMutation = useUpdateEnquiry();

  const openCreate = () => {
    setEditingEnquiry(null);
    setFormOpen(true);
  };
  const openEdit = (enquiry: Enquiry) => {
    setEditingEnquiry(enquiry);
    setFormOpen(true);
  };
  const openDetail = (enquiry: Enquiry) => setDetailEnquiry(enquiry);

  const handleFormSubmit = (values: EnquiryFormValues) => {
    if (editingEnquiry) {
      updateMutation.mutate(
        { id: editingEnquiry.id, values },
        {
          onSuccess: (updated) => {
            setFormOpen(false);
            // Keep the drawer (if open on this same enquiry) showing fresh data.
            setDetailEnquiry((prev) => (prev && prev.id === updated.id ? updated : prev));
          },
        },
      );
    } else {
      createMutation.mutate(values, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleCopyLink = async () => {
    // ?school= preselects this institution on the public form.
    const link = `${window.location.origin}/admission-enquiry${institution?.slug ? `?school=${encodeURIComponent(institution.slug)}` : ''}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('Public enquiry link copied to clipboard.'));
    } catch {
      toast.error(t('Could not copy the link — please copy it manually: {link}', { link }));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Admission enquiries')}
        description={t('Track prospective students from first contact through enrollment.')}
        actions={
          <>
            <Button variant="secondary" leftIcon={<Link2 className="w-4 h-4" />} onClick={handleCopyLink}>
              {t('Copy public enquiry link')}
            </Button>
            <Button variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
              {t('New enquiry')}
            </Button>
          </>
        }
      />

      {/* Funnel stats */}
      <div className="glass-card p-4 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t('From')}
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-field mt-1 h-9" />
          </label>
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t('To')}
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-field mt-1 h-9" />
          </label>
          {(fromDate || toDate) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              {t('Clear range')}
            </Button>
          )}
        </div>

        {funnel.isError ? (
          <ErrorState compact message={t('Could not load funnel stats.')} onRetry={() => funnel.refetch()} />
        ) : funnel.isLoading ? (
          <SkeletonStatGrid count={5} />
        ) : funnel.data ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label={t('Enquiries')} value={formatNumber(funnel.data.enquiries)} tone="primary" />
            <StatCard label={t('Open')} value={formatNumber(funnel.data.open)} tone="info" />
            <StatCard
              label={t('Applications')}
              value={formatNumber(funnel.data.applications.fromEnquiries)}
              tone="accent"
              hint={t('{pending} pending overall', { pending: formatNumber(funnel.data.applications.pending) })}
            />
            <StatCard label={t('Enrolled')} value={formatNumber(funnel.data.enrolled)} tone="success" />
            <StatCard label={t('Conversion rate')} value={`${formatNumber(funnel.data.conversionRate)}%`} tone="warning" />
          </div>
        ) : null}
      </div>

      <Tabs
        label={t('Enquiry views')}
        variant="pills"
        tabs={[
          { id: 'board', label: t('Board') },
          { id: 'list', label: t('List') },
          { id: 'followups', label: t('Follow-ups due') },
        ]}
        value={tab}
        onChange={(id) => setTab(id as ViewTab)}
      />

      <TabPanel id="board" value={tab}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
              <input
                type="search"
                aria-label={t('Search the board')}
                placeholder={t('Search by name, guardian, phone...')}
                value={boardSearch}
                onChange={(e) => setBoardSearch(e.target.value)}
                className="input-field pl-9"
              />
            </div>
            <Select
              aria-label={t('Filter by assignee')}
              value={boardAssignee}
              onChange={(e) => setBoardAssignee(e.target.value)}
              className="w-auto min-w-40"
              placeholder={t('All assignees')}
              options={assignees.map((a) => ({ value: a.id, label: `${a.firstName} ${a.lastName}`.trim() }))}
            />
          </div>
          <EnquiryBoard search={boardSearch} assignedToUserId={boardAssignee} onOpen={openDetail} />
        </div>
      </TabPanel>

      <TabPanel id="list" value={tab}>
        <EnquiryList onOpen={openDetail} />
      </TabPanel>

      <TabPanel id="followups" value={tab}>
        <EnquiryList followUp="due" onOpen={openDetail} />
      </TabPanel>

      <EnquiryFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        enquiry={editingEnquiry}
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <EnquiryDetailDrawer
        isOpen={!!detailEnquiry}
        onClose={() => setDetailEnquiry(null)}
        enquiry={detailEnquiry}
        onEdit={(enquiry) => {
          setDetailEnquiry(null);
          openEdit(enquiry);
        }}
        onDeleted={() => setDetailEnquiry(null)}
      />
    </div>
  );
}
