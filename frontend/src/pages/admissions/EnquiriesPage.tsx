import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Link2, Settings2 } from 'lucide-react';
import { PageHeader, Button, StatCard, Tabs, TabPanel, SkeletonStatGrid, ErrorState } from '@/components/ui';
import apiClient from '@/api/client';
import { useT, formatNumber } from '@/i18n';
import { useEnquiryFunnel, useCreateEnquiry, useUpdateEnquiry, useInstitutionSlug } from './enquiries.queries';
import { useTaskSummary, type CrmFilters } from './crm.api';
import StageBoard from './StageBoard';
import EnquiryList from './EnquiryList';
import EnquiryFormModal from './EnquiryFormModal';
import EnquiryDetailDrawer from './EnquiryDetailDrawer';
import CrmFilterBar from './CrmFilterBar';
import { TasksPanel } from './TaskList';
import ContactsPanel from './ContactsPanel';
import DuplicatesPanel from './DuplicatesPanel';
import ConversionReport from './ConversionReport';
import PipelineSettingsModal from './PipelineSettingsModal';
import type { Enquiry, EnquiryFormValues } from './enquiries.types';

type ViewTab = 'board' | 'list' | 'followups' | 'tasks' | 'contacts' | 'duplicates' | 'report';
const TABS: ViewTab[] = ['board', 'list', 'followups', 'tasks', 'contacts', 'duplicates', 'report'];

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Admissions CRM — funnel stats, then Board / List / Follow-ups / Tasks / Contacts / Duplicates / Report.
 * SUPER_ADMIN and ADMIN only, mirroring backend/src/modules/enquiries and /crm. */
export default function EnquiriesPage() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as ViewTab) || 'board';
  const [tab, setTabState] = useState<ViewTab>(TABS.includes(initialTab) ? initialTab : 'board');
  const setTab = (next: ViewTab) => {
    setTabState(next);
    setSearchParams((p) => {
      p.set('tab', next);
      return p;
    }, { replace: true });
  };
  const [filters, setFilters] = useState<CrmFilters>({});
  const debouncedFilters = useDebounced(filters);

  const [formOpen, setFormOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [editingEnquiry, setEditingEnquiry] = useState<Enquiry | null>(null);
  const [detailEnquiry, setDetailEnquiry] = useState<Enquiry | null>(null);

  const { data: institution } = useInstitutionSlug();
  const funnel = useEnquiryFunnel({});
  const taskSummary = useTaskSummary();

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
  const openById = async (id: string) => {
    try {
      const res = await apiClient.get(`/enquiries/${id}`);
      setDetailEnquiry(res.data.data);
    } catch {
      toast.error(t('Could not open the enquiry'));
    }
  };

  // Deep link from the daily digest / notifications: ?enquiry=<id>
  useEffect(() => {
    const id = searchParams.get('enquiry');
    if (id) void openById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormSubmit = (values: EnquiryFormValues) => {
    if (editingEnquiry) {
      updateMutation.mutate(
        { id: editingEnquiry.id, values },
        {
          onSuccess: (updated) => {
            setFormOpen(false);
            setDetailEnquiry((prev) => (prev && prev.id === updated.id ? updated : prev));
          },
        },
      );
    } else {
      createMutation.mutate(values, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/admission-enquiry${institution?.slug ? `?school=${encodeURIComponent(institution.slug)}` : ''}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('Public enquiry link copied to clipboard.'));
    } catch {
      toast.error(t('Could not copy the link — please copy it manually: {link}', { link }));
    }
  };

  const overdue = taskSummary.data?.overdue ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Admission enquiries')}
        description={t('Track prospective students from first contact through admission.')}
        actions={
          <>
            <Button variant="secondary" leftIcon={<Settings2 className="w-4 h-4" />} onClick={() => setPipelineOpen(true)}>
              {t('Pipeline stages')}
            </Button>
            <Button variant="secondary" leftIcon={<Link2 className="w-4 h-4" />} onClick={handleCopyLink}>
              {t('Copy public enquiry link')}
            </Button>
            <Button variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={openCreate}>
              {t('New enquiry')}
            </Button>
          </>
        }
      />

      {funnel.isError ? (
        <ErrorState compact message={t('Could not load funnel stats.')} onRetry={() => funnel.refetch()} />
      ) : funnel.isLoading ? (
        <SkeletonStatGrid count={4} />
      ) : funnel.data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t('Enquiries')} value={formatNumber(funnel.data.enquiries)} tone="primary" />
          <StatCard label={t('Open')} value={formatNumber(funnel.data.open)} tone="info" />
          <StatCard label={t('Admitted')} value={formatNumber(funnel.data.enrolled)} tone="success" />
          <StatCard label={t('Conversion rate')} value={`${formatNumber(funnel.data.conversionRate)}%`} tone="warning" />
        </div>
      ) : null}

      <Tabs
        label={t('Enquiry views')}
        variant="pills"
        tabs={[
          { id: 'board', label: t('Board') },
          { id: 'list', label: t('List') },
          { id: 'followups', label: t('Follow-ups due') },
          { id: 'tasks', label: t('Tasks'), count: overdue || undefined },
          { id: 'contacts', label: t('Contacts') },
          { id: 'duplicates', label: t('Duplicates') },
          { id: 'report', label: t('Report') },
        ]}
        value={tab}
        onChange={(id) => setTab(id as ViewTab)}
      />

      {(tab === 'board' || tab === 'list') && <CrmFilterBar value={filters} onChange={setFilters} showStage={tab === 'list'} />}

      <TabPanel id="board" value={tab}>
        <StageBoard filters={debouncedFilters} onOpen={setDetailEnquiry} />
      </TabPanel>
      <TabPanel id="list" value={tab}>
        <EnquiryList filters={debouncedFilters} onOpen={setDetailEnquiry} />
      </TabPanel>
      <TabPanel id="followups" value={tab}>
        <EnquiryList followUp="due" onOpen={setDetailEnquiry} />
      </TabPanel>
      <TabPanel id="tasks" value={tab}>
        <TasksPanel onOpenEnquiry={openById} />
      </TabPanel>
      <TabPanel id="contacts" value={tab}>
        <ContactsPanel />
      </TabPanel>
      <TabPanel id="duplicates" value={tab}>
        <DuplicatesPanel onOpen={openById} />
      </TabPanel>
      <TabPanel id="report" value={tab}>
        <ConversionReport />
      </TabPanel>

      <EnquiryFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        enquiry={editingEnquiry}
        onSubmit={handleFormSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onOpenExisting={(id) => {
          setFormOpen(false);
          void openById(id);
        }}
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
        onReplaced={(kept) => setDetailEnquiry(kept)}
      />

      <PipelineSettingsModal isOpen={pipelineOpen} onClose={() => setPipelineOpen(false)} />
    </div>
  );
}
