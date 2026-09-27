import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageHeader, Skeleton, ErrorState } from '../../components/ui';
import { PaymentReturnBanner } from './PaymentReturnBanner';
import { EmptyState } from '../../components/common/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../i18n';
import { useLinkedChildren, useMyInvoicesList, useInvoiceDetail } from './hooks';
import { ChildSwitcher } from './ChildSwitcher';
import { InvoiceCard } from './InvoiceCard';
import { PayOnlineModal } from './PayOnlineModal';
import { PrintReceiptModal } from './PrintDocuments';
import type { InvoiceListItem, Payment } from './types';

const MyInvoices: React.FC = () => {
  const { user } = useAuthStore();
  const isGuardian = user?.role === 'GUARDIAN';
  // Set by the backend's gateway redirect: /fees?payment=success|failed|cancelled|pending&txn=<id>
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentReturn = searchParams.get('payment');

  const { data: children = [], isLoading: childrenLoading } = useLinkedChildren(isGuardian);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0] ?? null;

  const { data: allInvoices = [], isLoading, isError, refetch } = useMyInvoicesList();

  // See the note on useMyInvoicesList: the backend returns every linked
  // child's invoices for a GUARDIAN caller, so a single child's invoices are
  // isolated here by matching the school-issued studentId shown in the child
  // switcher (the list endpoint doesn't project the student's internal id).
  const invoices: InvoiceListItem[] = useMemo(() => {
    if (!isGuardian) return allInvoices;
    if (!selectedChild) return [];
    return allInvoices.filter((inv) => inv.student?.studentId === selectedChild.studentId);
  }, [allInvoices, isGuardian, selectedChild]);

  const [payInvoice, setPayInvoice] = useState<InvoiceListItem | null>(null);
  const [receipt, setReceipt] = useState<{ invoiceId: string; payment: Payment } | null>(null);
  const { data: receiptInvoiceDetail } = useInvoiceDetail(receipt?.invoiceId ?? null);

  const totalDue = invoices.reduce((sum, inv) => sum + Number(inv.dueAmount || 0), 0);

  if (isGuardian && childrenLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title="No linked children found"
          description="Contact your school administrator to link your account to your child's student profile."
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isGuardian ? "My Children's Fees" : 'My Fees & Billing'}
        description="View your invoices and pay online."
        actions={
          totalDue > 0 ? (
            <div className="glass-card px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/5">
              <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold uppercase">
                Total due: {formatCurrency(totalDue)}
              </span>
            </div>
          ) : undefined
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

      {isGuardian && (
        <ChildSwitcher
          items={children}
          selectedId={selectedChild?.id ?? null}
          onSelect={setSelectedChildId}
        />
      )}

      {isError ? (
        <ErrorState onRetry={() => refetch()} message="Failed to load your invoices." />
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="glass-card">
          <EmptyState title="No invoices found" description="You have no invoices yet." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {invoices.map((invoice) => (
            <InvoiceCard
              key={invoice.id}
              invoice={invoice}
              onPayOnline={setPayInvoice}
              onPrintReceipt={(payment) => setReceipt({ invoiceId: invoice.id, payment })}
            />
          ))}
        </div>
      )}

      <PayOnlineModal invoice={payInvoice} onClose={() => setPayInvoice(null)} />
      <PrintReceiptModal
        invoice={receiptInvoiceDetail ?? null}
        payment={receipt?.payment ?? null}
        onClose={() => setReceipt(null)}
      />
    </div>
  );
};

export default MyInvoices;
