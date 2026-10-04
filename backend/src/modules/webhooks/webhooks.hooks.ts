import { emitWebhook } from './webhooks.dispatcher';

// =============================================================================
// Thin, non-throwing adapters called from existing controllers AFTER the
// success response has been sent. They pick a minimal, stable payload from
// whatever the service returned (no PII beyond name + ids) and hand it to the
// fire-and-forget dispatcher. Any unexpected shape is tolerated.
// =============================================================================

type Loose = Record<string, unknown> | null | undefined;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v));
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(typeof v === 'object' ? String(v) : v);
  return Number.isFinite(n) ? n : null;
};
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : str(v));

export function studentCreatedPayload(student: Loose) {
  const s = (student ?? {}) as Record<string, unknown>;
  return {
    id: str(s.id),
    studentId: str(s.studentId),
    firstName: str(s.firstName),
    lastName: str(s.lastName),
    classId: str(s.classId),
    sectionId: str(s.sectionId),
    rollNumber: str(s.rollNumber),
    status: str(s.status),
    admissionDate: iso(s.admissionDate),
  };
}

export function paymentReceivedPayload(invoiceId: string, payment: Loose) {
  const p = (payment ?? {}) as Record<string, unknown>;
  return {
    id: str(p.id),
    invoiceId: str(p.invoiceId) ?? invoiceId,
    amount: num(p.amount),
    method: str(p.method),
    receiptNo: str(p.receiptNo),
    transactionRef: str(p.transactionRef),
    paidAt: iso(p.paidAt),
    status: str(p.status),
  };
}

export function emitStudentCreatedWebhook(institutionId: string | undefined, student: unknown): void {
  try {
    emitWebhook(institutionId, 'student.created', studentCreatedPayload(student as Loose));
  } catch {
    // never affect the caller
  }
}

export function emitPaymentReceivedWebhook(institutionId: string | undefined, invoiceId: string, payment: unknown): void {
  try {
    emitWebhook(institutionId, 'payment.received', paymentReceivedPayload(invoiceId, payment as Loose));
  } catch {
    // never affect the caller
  }
}
