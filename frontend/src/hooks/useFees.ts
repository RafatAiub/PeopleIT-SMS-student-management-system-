import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feesApi, type InvoiceFilters, type CreateInvoiceDto, type RecordPaymentDto } from '@/api/fees.api';
import toast from 'react-hot-toast';

export const FEE_CATEGORIES_KEY = 'fee-categories';
export const INVOICES_KEY = 'invoices';
export const PAYMENTS_KEY = 'payments';

export function useFeeCategories() {
  return useQuery({
    queryKey: [FEE_CATEGORIES_KEY],
    queryFn: feesApi.getCategories,
  });
}

export function useInvoices(filters: InvoiceFilters = {}) {
  return useQuery({
    queryKey: [INVOICES_KEY, filters],
    queryFn: () => feesApi.getInvoices(filters),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: [INVOICES_KEY, id],
    queryFn: () => feesApi.getInvoiceById(id),
    enabled: !!id,
  });
}

export function usePaymentsByInvoice(invoiceId: string) {
  return useQuery({
    queryKey: [PAYMENTS_KEY, invoiceId],
    queryFn: () => feesApi.getPaymentsByInvoice(invoiceId),
    enabled: !!invoiceId,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInvoiceDto) => feesApi.createInvoice(data),
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: [INVOICES_KEY] });
      toast.success(`Invoice ${invoice.invoiceNumber} created successfully!`);
    },
    onError: () => {
      toast.error('Failed to create invoice.');
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordPaymentDto) => feesApi.recordPayment(data),
    onSuccess: (payment) => {
      qc.invalidateQueries({ queryKey: [INVOICES_KEY] });
      qc.invalidateQueries({ queryKey: [PAYMENTS_KEY, payment.invoiceId] });
      toast.success(`Payment of ৳${payment.amount.toLocaleString()} recorded!`);
    },
    onError: () => {
      toast.error('Failed to record payment.');
    },
  });
}
