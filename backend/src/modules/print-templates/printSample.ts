import type { PrintDocType } from './printTemplate.settings';
import type { PrintInstitution, PrintSource } from './printDocument.model';

// Sample invoice/receipt for the designer preview when the school has no
// invoice yet. Clearly fictional (student "Sample Student", INV-SAMPLE).
export function sampleSource(docType: PrintDocType, institution: PrintInstitution, now = new Date()): PrintSource {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const due = new Date(now.getTime() + 10 * 86_400_000);
  const items = [
    { description: 'Tuition fee', amount: 1200, discount: 200, netAmount: 1000 },
    { description: 'Exam fee', amount: 300, discount: 0, netAmount: 300 },
  ];
  return {
    docType,
    institution,
    student: {
      name: 'Sample Student',
      studentId: 'STU-0001',
      roll: '12',
      className: 'Class 6',
      sectionName: 'A',
      guardianName: 'Sample Guardian',
      photoUrl: null,
    },
    invoice: {
      id: 'sample',
      invoiceNo: 'INV-SAMPLE-0001',
      createdAt: now,
      dueDate: due,
      status: docType === 'RECEIPT' ? 'PARTIAL' : 'UNPAID',
      month,
      totalAmount: 1300,
      paidAmount: docType === 'RECEIPT' ? 1000 : 0,
      dueAmount: docType === 'RECEIPT' ? 300 : 1300,
      previousDues: 500,
      items,
      payments: docType === 'RECEIPT' ? [{ paidAt: now, method: 'CASH', receiptNo: 'RCP-SAMPLE-000001', amount: 1000 }] : [],
      notes: null,
    },
    payment:
      docType === 'RECEIPT'
        ? { receiptNo: 'RCP-SAMPLE-000001', amount: 1000, method: 'CASH', transactionRef: null, paidAt: now, collector: 'Accounts Office', notes: null }
        : null,
  };
}
