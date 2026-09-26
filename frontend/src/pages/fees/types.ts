// Shared types for the fees module screens. Kept in sync with the verified
// backend contract in backend/src/modules/fees (fee.dto.ts / fee.repository.ts
// / fee.controller.ts) — do not rename fields to match older/stale client
// shapes elsewhere in the repo.

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

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
  createdAt: string;
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
