import apiClient from './client';

// =============================================================================
// P1 platform billing API (PeopleNIT bills each school monthly). Mirrors
// backend/src/modules/platformBilling/platformBilling.routes.ts.
//   school:      /billing/platform/*
//   super-admin: /billing/platform-admin/*
// =============================================================================

export type AccessLevel = 'ACTIVE' | 'RESTRICTED' | 'DISABLED';
export type AccessReason = 'SUBSCRIPTION' | 'PLATFORM_BILLING' | 'SUSPENDED';
export type InvoiceStatus = 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED' | 'CANCELLED';
export type PricingModel = 'FLAT' | 'PER_STUDENT';
export type OnlineGateway = 'BKASH' | 'SSLCOMMERZ';
export type ManualMethod = 'CASH' | 'BANK_TRANSFER' | 'BKASH_PERSONAL' | 'NAGAD_PERSONAL' | 'OTHER';
export type PaymentMethod = OnlineGateway | ManualMethod;
export type CallOutcome = 'REACHED' | 'NO_ANSWER' | 'PROMISED' | 'REFUSED' | 'WRONG_NUMBER';

export interface InvoiceLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PlatformInvoice {
  id: string;
  institutionId: string;
  invoiceNumber: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  studentCount: number | null;
  pricingModel: PricingModel;
  rate: number | null;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  waivedAmount: number;
  amountDue: number;
  daysOverdue: number;
  status: InvoiceStatus;
  statusReason: string | null;
  paidAt: string | null;
  institution?: { id: string; name: string; slug: string; address?: string | null; phone?: string | null; email?: string | null; contactEmail?: string | null; contactPhone?: string | null };
}

export interface InvoicePaymentRow {
  id: string;
  receiptNumber: string | null;
  method: PaymentMethod;
  amount: number;
  paymentTotal: number;
  paidAt: string | null;
  reference: string | null;
  isDemo: boolean;
}

export interface PlatformInvoiceDetail extends PlatformInvoice {
  payments: InvoicePaymentRow[];
}

export interface PlatformPaymentRow {
  id: string;
  receiptNumber: string | null;
  method: PaymentMethod;
  amount: number;
  paidAt: string | null;
  isDemo: boolean;
  invoices: Array<{ id: string; invoiceNumber: string; period: string; amount: number }>;
}

export interface PlatformStatus {
  hasProfile: boolean;
  accessLevel: AccessLevel;
  reason: AccessReason | null;
  source: 'OVERRIDE' | 'AUTO' | 'NONE';
  isAdmin: boolean;
  overrideReason?: string | null;
  summary: null | {
    unpaidCount: number;
    totalDue: number;
    overdueCount: number;
    maxDaysOverdue: number | null;
    current: null | { id: string; invoiceNumber: string; period: string; amountDue: number; dueDate: string; status: InvoiceStatus; daysOverdue: number };
  };
}

export interface GatewayMode {
  gateway: OnlineGateway;
  label: string;
  live: boolean;
  demo: boolean;
  available: boolean;
}

export interface CheckoutResult {
  paymentId: string;
  amount: number;
  gateway: OnlineGateway;
  demo: boolean;
  message: string;
  paymentUrl: string;
  checkoutPath?: string;
}

export interface MyPayment {
  id: string;
  method: PaymentMethod;
  status: 'INITIATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  amount: number;
  isDemo: boolean;
  receiptNumber: string | null;
  paidAt: string | null;
  demoAllowed: boolean;
  invoices: Array<{ id: string; invoiceNumber: string; period: string; amount: number }>;
}

export interface BillingProfile {
  id: string;
  institutionId: string;
  isActive: boolean;
  pricingModel: PricingModel;
  flatAmount: string | null;
  perStudentRate: string | null;
  minimumCharge: string;
  discountType: 'PERCENT' | 'FIXED' | null;
  discountValue: string | null;
  discountNote: string | null;
  dueDay: number;
  billingStartMonth: string;
  serviceStartDate: string | null;
  firstMonthMode: 'PRORATE' | 'FREE' | 'FULL';
  freeMonths: number;
  remindSms: boolean;
  remindEmail: boolean;
  smsLanguage: 'bn' | 'en';
  autoRestrictAfterDays: number | null;
  billingPhone: string | null;
  billingEmail: string | null;
  accessOverride: AccessLevel | null;
  overrideReason: string | null;
  overrideKeep: boolean;
  overrideSetAt: string | null;
  notes: string | null;
}

export interface ProfileView {
  institution: { id: string; name: string; slug: string; isActive: boolean; phone: string | null; contactPhone: string | null };
  profile: BillingProfile | null;
  defaults: { phones: string[]; emails: string[] };
  activeStudents: number;
  access: { hasProfile: boolean; level: AccessLevel; source: string; maxDaysOverdue: number | null };
  preview: null | { period: string; lines: InvoiceLine[]; total: number; free: boolean };
}

export type ProfileInput = Omit<
  BillingProfile,
  'id' | 'institutionId' | 'flatAmount' | 'perStudentRate' | 'minimumCharge' | 'discountValue' | 'accessOverride' | 'overrideReason' | 'overrideKeep' | 'overrideSetAt'
> & {
  flatAmount: number | null;
  perStudentRate: number | null;
  minimumCharge: number;
  discountValue: number | null;
  reason?: string;
};

export interface Dashboard {
  period: string;
  thisMonth: { billed: number; collected: number; collectionRate: number | null };
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  schoolsBilled: number;
  schoolsWithProfile: number;
  months: Array<{ period: string; billed: number; collected: number }>;
  topOverdue: Array<{ institutionId: string; name: string; slug: string; amountDue: number; maxDaysOverdue: number; invoices: number }>;
}

export interface BoardRow {
  id: string;
  institutionId: string;
  name: string;
  slug: string;
  amountDue: number;
  unpaidInvoices: number;
  daysOverdue: number;
  oldestDueDate: string | null;
  lastContactAt: string | null;
  lastContactType: string | null;
  nextFollowUpAt: string | null;
  promiseDate: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  accessLevel: AccessLevel;
  accessSource: string;
  billingActive: boolean;
}

export interface TimelineEntry {
  id: string;
  kind: 'ACTIVITY' | 'REMINDER';
  type: string;
  at: string;
  body: string | null;
  callOutcome?: CallOutcome | null;
  promiseDate?: string | null;
  nextFollowUpAt?: string | null;
  actorName?: string | null;
  channel?: 'SMS' | 'EMAIL';
  result?: 'SENT' | 'SKIPPED' | 'FAILED';
  recipient?: string;
  providerResponse?: string | null;
  invoiceNumber?: string | null;
}

export interface SchoolCollections {
  institution: { id: string; name: string; slug: string; isActive: boolean; phone: string | null };
  profile: BillingProfile | null;
  assigneeName: string | null;
  invoices: PlatformInvoice[];
  timeline: TimelineEntry[];
}

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface InvoiceListQuery {
  status?: string;
  period?: string;
  institutionId?: string;
  q?: string;
  overdueOnly?: 'true' | 'false';
  page?: number;
  pageSize?: number;
}

const data = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

async function download(url: string, params: Record<string, unknown> | undefined, fallbackName: string) {
  const res = await apiClient.get(url, { params, responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export const platformBillingApi = {
  // ── School ──
  status: () => data<PlatformStatus>(apiClient.get('/billing/platform/status')),
  myInvoices: () => data<PlatformInvoice[]>(apiClient.get('/billing/platform/invoices')),
  myInvoice: (id: string) => data<PlatformInvoiceDetail>(apiClient.get(`/billing/platform/invoices/${id}`)),
  myPayments: () => data<PlatformPaymentRow[]>(apiClient.get('/billing/platform/payments')),
  myPayment: (id: string) => data<MyPayment>(apiClient.get(`/billing/platform/payments/${id}`)),
  gateways: () => data<GatewayMode[]>(apiClient.get('/billing/platform/gateways')),
  checkout: (body: { gateway: OnlineGateway; invoiceId?: string; payAll?: boolean }) =>
    data<CheckoutResult>(apiClient.post('/billing/platform/checkout', body)),
  demoConfirm: (id: string, outcome: 'success' | 'failure') =>
    data<{ status: string; receiptNumber: string | null; alreadyProcessed?: boolean }>(apiClient.post(`/billing/platform/payments/${id}/demo-confirm`, { outcome })),
  resolvePayLink: (token: string) => data<{ invoiceId: string }>(apiClient.get(`/billing/platform/pay-link/${encodeURIComponent(token)}`)),
  downloadMyInvoicePdf: (id: string, number: string) => download(`/billing/platform/invoices/${id}/pdf`, undefined, `${number}.pdf`),
  downloadMyReceiptPdf: (id: string, number: string | null) => download(`/billing/platform/payments/${id}/receipt.pdf`, undefined, `${number ?? 'receipt'}.pdf`),

  // ── Super-admin ──
  dashboard: () => data<Dashboard>(apiClient.get('/billing/platform-admin/dashboard')),
  profile: (institutionId: string) => data<ProfileView>(apiClient.get(`/billing/platform-admin/profiles/${institutionId}`)),
  saveProfile: (institutionId: string, body: ProfileInput) => data<BillingProfile>(apiClient.put(`/billing/platform-admin/profiles/${institutionId}`, body)),
  setOverride: (institutionId: string, body: { level: AccessLevel | null; reason?: string; keep?: boolean }) =>
    data<BillingProfile>(apiClient.put(`/billing/platform-admin/profiles/${institutionId}/override`, body)),
  generate: (body: { institutionId?: string; period?: string }) =>
    data<{ status?: string; created?: number; existing?: number; skipped?: number; reason?: string }>(apiClient.post('/billing/platform-admin/invoices/generate', body)),
  invoices: (params: InvoiceListQuery) =>
    apiClient
      .get('/billing/platform-admin/invoices', { params })
      .then((r) => ({ data: r.data.data as PlatformInvoice[], meta: r.data.meta as { total: number; page: number; pageSize: number; totalPages: number } })),
  exportInvoices: (params: InvoiceListQuery, format: 'csv' | 'xlsx') =>
    download('/billing/platform-admin/invoices/export', { ...params, format, page: undefined, pageSize: undefined }, `platform-invoices.${format}`),
  invoice: (id: string) => data<PlatformInvoiceDetail>(apiClient.get(`/billing/platform-admin/invoices/${id}`)),
  editLines: (id: string, body: { lines: Array<{ description: string; quantity: number; unitPrice: number }>; dueDate?: string; reason: string }) =>
    data<PlatformInvoice>(apiClient.patch(`/billing/platform-admin/invoices/${id}/lines`, body)),
  waive: (id: string, reason: string) => data<PlatformInvoice>(apiClient.post(`/billing/platform-admin/invoices/${id}/waive`, { reason })),
  cancel: (id: string, reason: string) => data<PlatformInvoice>(apiClient.post(`/billing/platform-admin/invoices/${id}/cancel`, { reason })),
  recordPayment: (id: string, body: { method: ManualMethod; amount: number; reference?: string; note?: string; paidAt?: string; notify?: boolean }) =>
    data<{ id: string; receiptNumber: string; amount: number }>(apiClient.post(`/billing/platform-admin/invoices/${id}/payments`, body)),
  remindNow: (id: string) => data<{ sent: number; skipped: number; failed: number; duplicates: number }>(apiClient.post(`/billing/platform-admin/invoices/${id}/remind`)),
  downloadInvoicePdf: (id: string, number: string) => download(`/billing/platform-admin/invoices/${id}/pdf`, undefined, `${number}.pdf`),
  downloadReceiptPdf: (id: string, number: string | null) => download(`/billing/platform-admin/payments/${id}/receipt.pdf`, undefined, `${number ?? 'receipt'}.pdf`),
  collections: (params: { q?: string; assignee?: string; accessLevel?: AccessLevel; overdueOnly?: 'true' | 'false'; sort?: string }) =>
    data<{ rows: BoardRow[]; totals: { schools: number; amountDue: number; overdueSchools: number } }>(apiClient.get('/billing/platform-admin/collections', { params })),
  schoolCollections: (institutionId: string) => data<SchoolCollections>(apiClient.get(`/billing/platform-admin/collections/${institutionId}`)),
  addActivity: (
    institutionId: string,
    body: { type: 'CALL' | 'NOTE' | 'PROMISE_TO_PAY'; callOutcome?: CallOutcome; body?: string; promiseDate?: string; nextFollowUpAt?: string | null; assigneeUserId?: string | null; invoiceId?: string },
  ) => data<unknown>(apiClient.post(`/billing/platform-admin/collections/${institutionId}/activities`, body)),
  staff: () => data<StaffMember[]>(apiClient.get('/billing/platform-admin/staff')),
};
