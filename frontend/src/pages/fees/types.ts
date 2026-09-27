// Shared types for the fees module screens. Kept in sync with the verified
// backend contract in backend/src/modules/fees (fee.dto.ts / fee.repository.ts
// / fee.controller.ts) — do not rename fields to match older/stale client
// shapes elsewhere in the repo.

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type FeeFrequency = 'MONTHLY' | 'TERM' | 'ONE_TIME' | 'ANNUAL';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'BKASH' | 'NAGAD' | 'SSLCOMMERZ';

export interface StudentRef {
  id: string;
  firstName: string;
  lastName: string;
  studentId?: string;
  rollNumber?: string;
}

export interface InvoiceListItem {
  id: string;
  invoiceNo: string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueAmount: number | string;
  dueDate: string;
  status: InvoiceStatus;
  createdAt: string;
  student?: StudentRef;
}

export interface InvoiceItem {
  id: string;
  feeCategoryId: string;
  description: string;
  amount: number | string;
  discount: number | string;
  netAmount: number | string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number | string;
  method: PaymentMethod;
  transactionRef?: string | null;
  notes?: string | null;
  recordedBy: string;
  status: string;
  /** Legacy field name used by older screens; the API returns `paidAt`. */
  createdAt?: string;
  paidAt?: string;
  /** Wave C: tenant-prefixed receipt number (null on payments recorded before it existed). */
  receiptNo?: string | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  items: InvoiceItem[];
  payments: Payment[];
  notes?: string | null;
}

export interface InvoiceSummary {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  overdueCount: number;
}

export interface FeeCategory {
  id: string;
  name: string;
  description?: string | null;
  amount: number | string;
  frequency: FeeFrequency;
  isActive: boolean;
  linkedInvoiceCount?: number;
  revenueCollected?: number;
}

export interface CategorySummary {
  totalCategories: number;
  activeCount: number;
  revenuePotential: number;
}

export interface StudentSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
}

// ── Wave C ──────────────────────────────────────────────────────────────────

export type OnlineGateway = 'BKASH' | 'NAGAD' | 'SSLCOMMERZ';
export type FeeTxnStatus = 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface GatewayMode {
  gateway: OnlineGateway;
  label: string;
  live: boolean;
  demo: boolean;
  /** false when demo payments are switched off server-side and no real keys exist. */
  available?: boolean;
}

export interface InitiateOnlineResult {
  success: boolean;
  message: string;
  paymentUrl?: string;
  transactionId?: string;
  txnId?: string;
  demo?: boolean;
  checkoutPath?: string;
  gateway?: OnlineGateway;
  amount?: number;
  invoiceNo?: string;
}

export interface OnlineTransaction {
  id: string;
  transactionId: string;
  gateway: OnlineGateway;
  amount: number;
  currency: string;
  status: FeeTxnStatus;
  isDemo: boolean;
  demo: boolean;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNo: string;
    totalAmount: number;
    dueAmount: number;
    status: InvoiceStatus;
    student?: { firstName: string; lastName: string; studentId?: string } | null;
  };
  payment: { id: string; receiptNo: string | null; amount: number; paidAt: string } | null;
}

export interface DemoConfirmResult {
  status: FeeTxnStatus;
  demo: boolean;
  paymentId: string | null;
  receiptNo: string | null;
  invoiceId: string;
  alreadyProcessed?: boolean;
}

export type ConcessionType = 'PERCENT' | 'FIXED';

export interface Concession {
  id: string;
  name: string;
  type: ConcessionType;
  value: number;
  feeCategoryId: string | null;
  feeCategory?: { id: string; name: string } | null;
  isActive: boolean;
  description?: string | null;
  assignedCount?: number;
  createdAt: string;
}

export interface ConcessionAssignment {
  id: string;
  studentId: string;
  concessionId: string;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  createdAt: string;
  isCurrentlyActive: boolean;
  concession: Pick<Concession, 'id' | 'name' | 'type' | 'value' | 'feeCategoryId' | 'isActive'> & { feeCategory?: { id: string; name: string } | null };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    studentId: string;
    class?: { name: string } | null;
    section?: { name: string } | null;
  };
}

export interface ActiveConcessionRule {
  id: string;
  name: string;
  type: ConcessionType;
  value: number;
  feeCategoryId: string | null;
}

export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

export interface BulkInvoicePayload {
  classId: string;
  sectionId?: string | null;
  period: string;
  dueDate: string;
  items?: { feeCategoryId: string; amount: number; description?: string }[];
  useFeeSchedule?: boolean;
  applyConcessions?: boolean;
  notes?: string;
}

export interface BulkPreview {
  classId: string;
  className: string;
  sectionName: string | null;
  period: string;
  items: { feeCategoryId: string; categoryName: string; amount: number; description: string | null }[];
  studentCount: number;
  invoiceCount: number;
  skippedStudentCount: number;
  skippedItemCount: number;
  grossAmount: number;
  concessionAmount: number;
  totalAmount: number;
}

export interface BulkResult {
  batchId: string;
  label: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  studentCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  totalAmount: number;
}

export type ReconciliationFlag = 'AMOUNT_MISMATCH' | 'SUCCESS_WITHOUT_PAYMENT' | 'PAYMENT_WITHOUT_SUCCESS' | 'STALE_PENDING';

export interface ReconciliationRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  gateway: OnlineGateway;
  status: FeeTxnStatus;
  amount: number;
  currency: string;
  isDemo: boolean;
  gatewayTransactionId: string;
  gatewayPaymentId: string | null;
  gatewayValId: string | null;
  invoice: { id: string; invoiceNo: string; status: string };
  student: { id: string; firstName: string; lastName: string; studentId: string } | null;
  payment: { id: string; amount: number; receiptNo: string | null; paidAt: string; method: string } | null;
  initiatedBy: string | null;
  flags: ReconciliationFlag[];
}

export interface ReconciliationSummary {
  total: number;
  successCount: number;
  successAmount: number;
  failedCount: number;
  pendingCount: number;
  cancelledCount: number;
  demoCount: number;
  issuesOnPage: number;
}
