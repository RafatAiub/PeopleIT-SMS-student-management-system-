import React, { useState } from 'react';
import { Plus, FileText, Layers } from 'lucide-react';
import { PageHeader, Button, Tabs, TabPanel } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { useFeeCategoriesList, useInvoiceDetail } from './hooks';
import { InvoicesTab } from './InvoicesTab';
import { CategoriesTab } from './CategoriesTab';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';
import { PrintInvoiceModal, PrintReceiptModal } from './PrintDocuments';
import type { InvoiceListItem, Payment } from './types';

// Fees & Billing — staff/accountant view. Students/guardians are routed to
// MyInvoices.tsx instead (see FeesRoute in App.tsx). SUPER_ADMIN can see this
// screen (routed the same way) but never gets create/manage actions here,
// matching the pre-existing behaviour of this page.
const InvoiceList: React.FC = () => {
  const { user } = useAuthStore();
  const canManage = user?.role !== 'SUPER_ADMIN';

  const [activeTab, setActiveTab] = useState<'invoices' | 'categories'>('invoices');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceListItem | null>(null);
  const [drawerInvoiceId, setDrawerInvoiceId] = useState<string | null>(null);
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);
  const [printReceipt, setPrintReceipt] = useState<{ invoiceId: string; payment: Payment } | null>(null);

  // includeInactive so the create-invoice modal's category dropdown always
  // has the full set to derive its active-only options from, without a
  // second network round trip when the Categories tab is opened.
  const { data: categoriesData } = useFeeCategoriesList(true);
  const { data: printInvoiceData } = useInvoiceDetail(printInvoiceId);
  const { data: printReceiptInvoiceData } = useInvoiceDetail(printReceipt?.invoiceId ?? null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & Billing"
        description="Manage invoice collections, payments, and fee structures."
        actions={
          canManage ? (
            activeTab === 'invoices' ? (
              <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setCreateModalOpen(true)}>
                Create invoice
              </Button>
            ) : null
          ) : null
        }
      />

      <Tabs
        tabs={[
          { id: 'invoices', label: 'Invoices', icon: <FileText /> },
          { id: 'categories', label: 'Fee categories', icon: <Layers /> },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as 'invoices' | 'categories')}
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

      {canManage && (
        <CreateInvoiceModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          categories={categoriesData?.data ?? []}
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
