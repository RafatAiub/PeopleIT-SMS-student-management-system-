import apiClient from './client';

export interface FeeCategory {
  id: string;
  name: string;
  description?: string;
  amount: number;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME';
  institutionId: string;
}

export interface InvoiceLineItem {
  id: string;
  feeCategoryId: string;
  feeCategoryName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  studentSection: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'CANCELLED';
  dueDate: string;
  issuedDate: string;
  notes?: string;
  institutionId: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'SSL_COMMERZ' | 'BANK_TRANSFER';
  transactionId?: string;
  paidAt: string;
  notes?: string;
  recordedBy: string;
}

export interface CreateInvoiceDto {
  studentId: string;
  lineItems: Array<{
    feeCategoryId: string;
    description?: string;
    quantity: number;
    unitPrice: number;
  }>;
  discountAmount?: number;
  dueDate: string;
  notes?: string;
}

export interface RecordPaymentDto {
  invoiceId: string;
  amount: number;
  method: 'CASH' | 'BKASH' | 'NAGAD' | 'SSL_COMMERZ' | 'BANK_TRANSFER';
  transactionId?: string;
  notes?: string;
}

export interface InvoiceFilters {
  status?: string;
  studentId?: string;
  className?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedInvoices {
  data: Invoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const feesApi = {
  getCategories: async (): Promise<FeeCategory[]> => {
    const { data } = await apiClient.get<FeeCategory[]>('/fees/categories');
    return data;
  },

  createCategory: async (category: Omit<FeeCategory, 'id' | 'institutionId'>): Promise<FeeCategory> => {
    const { data } = await apiClient.post<FeeCategory>('/fees/categories', category);
    return data;
  },

  getInvoices: async (filters: InvoiceFilters = {}): Promise<PaginatedInvoices> => {
    const { data } = await apiClient.get<PaginatedInvoices>('/fees/invoices', { params: filters });
    return data;
  },

  getInvoiceById: async (id: string): Promise<Invoice> => {
    const { data } = await apiClient.get<Invoice>(`/fees/invoices/${id}`);
    return data;
  },

  createInvoice: async (invoice: CreateInvoiceDto): Promise<Invoice> => {
    const { data } = await apiClient.post<Invoice>('/fees/invoices', invoice);
    return data;
  },

  recordPayment: async (payment: RecordPaymentDto): Promise<Payment> => {
    const { data } = await apiClient.post<Payment>('/fees/payments', payment);
    return data;
  },

  getPaymentsByInvoice: async (invoiceId: string): Promise<Payment[]> => {
    const { data } = await apiClient.get<Payment[]>(`/fees/invoices/${invoiceId}/payments`);
    return data;
  },
};
