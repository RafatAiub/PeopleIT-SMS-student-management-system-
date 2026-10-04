import { z } from 'zod';

export const CreateFeeCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  amount: z.number().positive('Amount must be positive'),
  frequency: z.enum(['MONTHLY', 'TERM', 'ONE_TIME', 'ANNUAL']),
});

export const UpdateFeeCategorySchema = CreateFeeCategorySchema.partial();

export const CreateInvoiceItemSchema = z.object({
  feeCategoryId: z.string().min(1, 'Fee Category ID is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
});

export const CreateInvoiceSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  dueDate: z.string().datetime('Invalid due date format'),
  notes: z.string().optional(),
  items: z.array(CreateInvoiceItemSchema).min(1, 'At least one item is required'),
  // Wave C: apply the student's active concessions as line discounts (default on).
  applyConcessions: z.boolean().optional(),
});

export const RecordPaymentSchema = z.object({
  amount: z.number().positive('Payment amount must be positive'),
  method: z.enum(['BKASH', 'NAGAD', 'SSLCOMMERZ', 'CASH', 'BANK_TRANSFER']),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
});

// Wave C — online payments. `method` and `callbackUrl` are the original
// fields; `amount` (partial payment, defaults to the full due) is new.
export const InitiateOnlinePaymentSchema = z.object({
  method: z.enum(['BKASH', 'NAGAD', 'SSLCOMMERZ']),
  callbackUrl: z.string().max(2000).optional(),
  amount: z.number().positive().optional(),
});

export const DemoConfirmSchema = z.object({
  outcome: z.enum(['success', 'failure']),
});

export const TxnIdParamSchema = z.object({ txnId: z.string().min(1) });
export const PaymentIdParamSchema = z.object({ paymentId: z.string().min(1) });
