import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, FileText, Layers, BadgePercent, Scale, Users, CalendarClock } from 'lucide-react';
import { PageHeader, Button, Tabs, TabPanel } from '../../components/ui';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { useAuthStore } from '../../store/authStore';
import { useFeeCategoriesList, useInvoiceDetail } from './hooks';
import { useMarkOverdue } from './feeExtras.queries';
import { InvoicesTab } from './InvoicesTab';
import { CategoriesTab } from './CategoriesTab';
import { ConcessionsTab } from './ConcessionsTab';
import { ReconciliationTab } from './ReconciliationTab';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { BulkInvoiceWizard } from './BulkInvoiceWizard';
import { RecordPaymentModal } from './RecordPaymentModal';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';
import { PaymentReturnBanner } from './PaymentReturnBanner';
import { PrintInvoiceModal, PrintReceiptModal } from './PrintDocuments';
import type { InvoiceListItem, Payment } from './types';

type TabId = 'invoices' | 'categories' | 'concessions' | 'reconciliation';

// Fees & Billing — staff/accountant view. Students/guardians are routed to
// MyInvoices.tsx instead (see FeesRoute in App.tsx). SUPER_ADMIN can see this
// screen (routed the same way) but never gets create/manage actions here,
// matching the pre-existing behaviour of this page.
const InvoiceList: React.FC<{ initialTab?: TabId }> = ({ initialTab = 'invoices' }) => {
  const { user } = useAuthStore();
  const canManage = user?.role !== 'SUPER_ADMIN';
  // Backend: concessions write + mark-overdue are SUPER_ADMIN/ADMIN only; this
  // screen never gives SUPER_ADMIN manage actions, so ADMIN it is.
  const isAdmin = user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [overdueConfirm, setOverdueConfirm] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceListItem | null>(null);
  const [drawerInvoiceId, setDrawerInvoiceId] = useState<string | null>(null);
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);
  const [printReceipt, setPrintReceipt] = useState<{ invoiceId: string; payment: Payment } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentReturn = searchParams.get('payment');

  // includeInactive so the create-invoice modal's category dropdown always
  // has the full set to derive its active-only options from, without a
  // second network round trip when the Categories tab is opened.
  const { data: categoriesData } = useFeeCategoriesList(true);
  const { data: printInvoiceData } = useInvoiceDetail(printInvoiceId);
  const { data: printReceiptInvoiceData } = useInvoiceDetail(printReceipt?.invoiceId ?? null);
  const markOverdue = useMarkOverdue();

  const runMarkOverdue = async () => {
    try {
      const res = await markOverdue.mutateAsync();
      toast.success(res.updated > 0 ? `${res.updated} invoice(s) marked overdue` : 'No invoices are past due');
      setOverdueConfirm(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to mark overdue invoices');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & Billing"
        description="Manage invoice collections, payments, and fee structures."
        actions={
          canManage && activeTab === 'invoices' ? (
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <Button variant="ghost" leftIcon={<CalendarClock className="w-4 h-4" />} onClick={() => setOverdueConfirm(true)}>
                  Mark overdue
                </Button>
              )}
              <Button variant="outline" leftIcon={<Users className="w-4 h-4" />} onClick={() => setBulkOpen(true)}>
                Bulk generate
              </Button>
              <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateModalOpen(true)}>
                Create invoice
              </Button>
            </div>
          ) : null
        }
      />

      {paymentReturn && (
        <PaymentReturnBanner
          status={paymentReturn}
          txnId={searchParams.get('txn')}
          onDismiss={() => {
            const next = new URLSearchParams(searchParams);
            next.delete('payment');
            next.delete('txn');
            setSearchParams(next, { replace: true });
          }}
        />
      )}

      <Tabs
        tabs={[
          { id: 'invoices', label: 'Invoices', icon: <FileText /> },
          { id: 'categories', label: 'Fee categories', icon: <Layers /> },
          { id: 'concessions', label: 'Concessions', icon: <BadgePercent /> },
          { id: 'reconciliation', label: 'Reconciliation', icon: <Scale /> },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        label="Fees sections"
      />

      <TabPanel id="invoices" value={activeTab}>
        <InvoicesTab
          canRecordPayment={canManage}
          onRowClick={(invoice) => setDrawerInvoiceId(invoice.id)}
          onRecordPayment={(invoice) => setPaymentInvoice(invoice)}
        />
      </TabPanel>

      <TabPanel id="categories" value={activeTab}>
        <CategoriesTab canManage={canManage} />
      </TabPanel>

      <TabPanel id="concessions" value={activeTab}>
        {activeTab === 'concessions' && <ConcessionsTab canManage={isAdmin} />}
      </TabPanel>

      <TabPanel id="reconciliation" value={activeTab}>
        {activeTab === 'reconciliation' && <ReconciliationTab />}
      </TabPanel>

      {canManage && (
        <CreateInvoiceModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          categories={categoriesData?.data ?? []}
          canAssignConcession={isAdmin}
        />
      )}

      {canManage && (
        <BulkInvoiceWizard isOpen={bulkOpen} onClose={() => setBulkOpen(false)} categories={categoriesData?.data ?? []} />
      )}

      {isAdmin && (
        <ConfirmModal
          isOpen={overdueConfirm}
          title="Mark overdue invoices?"
          message="All unpaid and partially paid invoices whose due date has passed will be marked OVERDUE. This also runs automatically every day."
          confirmLabel="Mark overdue"
          onConfirm={runMarkOverdue}
          onCancel={() => setOverdueConfirm(false)}
          isLoading={markOverdue.isPending}
          variant="warning"
        />
      )}

      {canManage && (
        <RecordPaymentModal invoice={paymentInvoice} onClose={() => setPaymentInvoice(null)} />
      )}

      <InvoiceDetailDrawer
        invoiceId={drawerInvoiceId}
        onClose={() => setDrawerInvoiceId(null)}
        canRecordPayment={canManage}
        onRecordPayment={(invoice) => setPaymentInvoice(invoice)}
        onPrintInvoice={() => drawerInvoiceId && setPrintInvoiceId(drawerInvoiceId)}
        onPrintReceipt={(payment) => drawerInvoiceId && setPrintReceipt({ invoiceId: drawerInvoiceId, payment })}
      />

      <PrintInvoiceModal invoice={printInvoiceData ?? null} onClose={() => setPrintInvoiceId(null)} />
      <PrintReceiptModal
        invoice={printReceiptInvoiceData ?? null}
        payment={printReceipt?.payment ?? null}
        onClose={() => setPrintReceipt(null)}
      />
    </div>
  );
};

export default InvoiceList;
