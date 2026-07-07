import type { Student } from '@/api/students.api';
import type { Invoice, FeeCategory, Payment } from '@/api/fees.api';

export const MOCK_STUDENTS: Student[] = [
  {
    id: '1', studentId: 'SMS-2024-001', firstName: 'Mohammad', lastName: 'Rahim',
    dateOfBirth: '2010-03-15', gender: 'MALE', religion: 'Islam', bloodGroup: 'B+',
    address: 'Mirpur-10, Dhaka', className: 'Class 8', section: 'A', rollNumber: '01',
    admissionDate: '2024-01-10', status: 'ACTIVE',
    guardianName: 'Abdur Rahim', guardianPhone: '01711-234567',
    guardianEmail: 'abdur.rahim@gmail.com', guardianRelation: 'Father',
    guardianOccupation: 'Business', institutionId: 'inst-1',
    phone: '01811-234567', email: 'rahim@student.sms.com',
  },
  {
    id: '2', studentId: 'SMS-2024-002', firstName: 'Fatema', lastName: 'Begum',
    dateOfBirth: '2009-07-22', gender: 'FEMALE', religion: 'Islam', bloodGroup: 'A+',
    address: 'Dhanmondi, Dhaka', className: 'Class 9', section: 'B', rollNumber: '03',
    admissionDate: '2024-01-12', status: 'ACTIVE',
    guardianName: 'Kamal Hossain', guardianPhone: '01812-345678',
    guardianRelation: 'Father', guardianOccupation: 'Service',
    institutionId: 'inst-1',
  },
  {
    id: '3', studentId: 'SMS-2024-003', firstName: 'Arif', lastName: 'Hossain',
    dateOfBirth: '2011-11-05', gender: 'MALE', religion: 'Islam', bloodGroup: 'O+',
    address: 'Uttara, Dhaka', className: 'Class 7', section: 'A', rollNumber: '05',
    admissionDate: '2024-01-15', status: 'ACTIVE',
    guardianName: 'Nurul Hossain', guardianPhone: '01911-456789',
    guardianRelation: 'Father', institutionId: 'inst-1',
  },
  {
    id: '4', studentId: 'SMS-2024-004', firstName: 'Sumaiya', lastName: 'Khanam',
    dateOfBirth: '2008-04-18', gender: 'FEMALE', religion: 'Islam', bloodGroup: 'AB+',
    address: 'Banani, Dhaka', className: 'Class 10', section: 'A', rollNumber: '02',
    admissionDate: '2023-01-08', status: 'ACTIVE',
    guardianName: 'Rafiqul Islam', guardianPhone: '01611-567890',
    guardianRelation: 'Father', guardianOccupation: 'Engineer',
    institutionId: 'inst-1',
  },
  {
    id: '5', studentId: 'SMS-2024-005', firstName: 'Tanvir', lastName: 'Ahmed',
    dateOfBirth: '2010-09-30', gender: 'MALE', religion: 'Islam', bloodGroup: 'B-',
    address: 'Motijheel, Dhaka', className: 'Class 8', section: 'B', rollNumber: '07',
    admissionDate: '2024-02-01', status: 'ACTIVE',
    guardianName: 'Shahabuddin Ahmed', guardianPhone: '01511-678901',
    guardianRelation: 'Father', institutionId: 'inst-1',
  },
  {
    id: '6', studentId: 'SMS-2024-006', firstName: 'Nusrat', lastName: 'Jahan',
    dateOfBirth: '2009-02-14', gender: 'FEMALE', religion: 'Islam', bloodGroup: 'A-',
    address: 'Gulshan, Dhaka', className: 'Class 9', section: 'A', rollNumber: '04',
    admissionDate: '2023-06-15', status: 'ACTIVE',
    guardianName: 'Mahbubur Rahman', guardianPhone: '01311-789012',
    guardianRelation: 'Father', guardianOccupation: 'Doctor',
    institutionId: 'inst-1',
  },
  {
    id: '7', studentId: 'SMS-2024-007', firstName: 'Rifat', lastName: 'Karim',
    dateOfBirth: '2012-06-10', gender: 'MALE', religion: 'Islam', bloodGroup: 'O-',
    address: 'Rampura, Dhaka', className: 'Class 6', section: 'B', rollNumber: '11',
    admissionDate: '2024-01-20', status: 'INACTIVE',
    guardianName: 'Abdul Karim', guardianPhone: '01411-890123',
    guardianRelation: 'Father', institutionId: 'inst-1',
  },
  {
    id: '8', studentId: 'SMS-2024-008', firstName: 'Nasrin', lastName: 'Akter',
    dateOfBirth: '2008-12-25', gender: 'FEMALE', religion: 'Islam', bloodGroup: 'B+',
    address: 'Wari, Dhaka', className: 'Class 10', section: 'B', rollNumber: '06',
    admissionDate: '2022-01-05', status: 'ACTIVE',
    guardianName: 'Sirajul Islam', guardianPhone: '01211-901234',
    guardianRelation: 'Father', guardianOccupation: 'Teacher',
    institutionId: 'inst-1',
  },
  {
    id: '9', studentId: 'SMS-2024-009', firstName: 'Imran', lastName: 'Khan',
    dateOfBirth: '2011-03-20', gender: 'MALE', religion: 'Islam', bloodGroup: 'A+',
    address: 'Badda, Dhaka', className: 'Class 7', section: 'B', rollNumber: '09',
    admissionDate: '2024-03-01', status: 'ACTIVE',
    guardianName: 'Shahidullah Khan', guardianPhone: '01711-012345',
    guardianRelation: 'Father', institutionId: 'inst-1',
  },
  {
    id: '10', studentId: 'SMS-2024-010', firstName: 'Rabeya', lastName: 'Sultana',
    dateOfBirth: '2009-08-08', gender: 'FEMALE', religion: 'Islam', bloodGroup: 'AB-',
    address: 'Shyamoli, Dhaka', className: 'Class 9', section: 'C', rollNumber: '02',
    admissionDate: '2023-01-12', status: 'ACTIVE',
    guardianName: 'Nurul Amin', guardianPhone: '01811-123456',
    guardianRelation: 'Father', guardianOccupation: 'Business',
    institutionId: 'inst-1',
  },
  {
    id: '11', studentId: 'SMS-2024-011', firstName: 'Shahriar', lastName: 'Hasan',
    dateOfBirth: '2010-05-12', gender: 'MALE', religion: 'Islam', bloodGroup: 'B+',
    address: 'Khilgaon, Dhaka', className: 'Class 8', section: 'A', rollNumber: '12',
    admissionDate: '2024-01-25', status: 'ACTIVE',
    guardianName: 'Mizanur Rahman', guardianPhone: '01911-234567',
    guardianRelation: 'Father', institutionId: 'inst-1',
  },
  {
    id: '12', studentId: 'SMS-2024-012', firstName: 'Maliha', lastName: 'Rahman',
    dateOfBirth: '2007-11-30', gender: 'FEMALE', religion: 'Islam', bloodGroup: 'O+',
    address: 'Tejgaon, Dhaka', className: 'Class 11', section: 'Science', rollNumber: '03',
    admissionDate: '2022-06-01', status: 'ACTIVE',
    guardianName: 'Anisur Rahman', guardianPhone: '01611-345678',
    guardianRelation: 'Father', guardianOccupation: 'Banker',
    institutionId: 'inst-1',
  },
];

export const MOCK_FEE_CATEGORIES: FeeCategory[] = [
  { id: 'fc1', name: 'মাসিক বেতন (Tuition Fee)', amount: 2500, frequency: 'MONTHLY', institutionId: 'inst-1' },
  { id: 'fc2', name: 'পরীক্ষা ফি (Exam Fee)', amount: 1500, frequency: 'QUARTERLY', institutionId: 'inst-1' },
  { id: 'fc3', name: 'ভর্তি ফি (Admission Fee)', amount: 5000, frequency: 'ONE_TIME', institutionId: 'inst-1' },
  { id: 'fc4', name: 'লাইব্রেরি ফি (Library Fee)', amount: 500, frequency: 'YEARLY', institutionId: 'inst-1' },
  { id: 'fc5', name: 'কম্পিউটার ফি (Computer Fee)', amount: 800, frequency: 'MONTHLY', institutionId: 'inst-1' },
  { id: 'fc6', name: 'স্পোর্টস ফি (Sports Fee)', amount: 300, frequency: 'MONTHLY', institutionId: 'inst-1' },
];

export const MOCK_INVOICES: Invoice[] = [
  {
    id: 'inv1', invoiceNumber: 'INV-2026-0001', studentId: '1',
    studentName: 'Mohammad Rahim', studentClass: 'Class 8', studentSection: 'A',
    lineItems: [
      { id: 'li1', feeCategoryId: 'fc1', feeCategoryName: 'মাসিক বেতন', quantity: 1, unitPrice: 2500, subtotal: 2500 },
      { id: 'li2', feeCategoryId: 'fc5', feeCategoryName: 'কম্পিউটার ফি', quantity: 1, unitPrice: 800, subtotal: 800 },
    ],
    subtotal: 3300, discountAmount: 0, taxAmount: 0, totalAmount: 3300,
    paidAmount: 3300, dueAmount: 0,
    status: 'PAID', dueDate: '2026-06-30', issuedDate: '2026-06-01', institutionId: 'inst-1',
  },
  {
    id: 'inv2', invoiceNumber: 'INV-2026-0002', studentId: '2',
    studentName: 'Fatema Begum', studentClass: 'Class 9', studentSection: 'B',
    lineItems: [
      { id: 'li3', feeCategoryId: 'fc1', feeCategoryName: 'মাসিক বেতন', quantity: 1, unitPrice: 2500, subtotal: 2500 },
      { id: 'li4', feeCategoryId: 'fc6', feeCategoryName: 'স্পোর্টস ফি', quantity: 1, unitPrice: 300, subtotal: 300 },
    ],
    subtotal: 2800, discountAmount: 200, taxAmount: 0, totalAmount: 2600,
    paidAmount: 0, dueAmount: 2600,
    status: 'OVERDUE', dueDate: '2026-05-31', issuedDate: '2026-05-01', institutionId: 'inst-1',
  },
  {
    id: 'inv3', invoiceNumber: 'INV-2026-0003', studentId: '3',
    studentName: 'Arif Hossain', studentClass: 'Class 7', studentSection: 'A',
    lineItems: [
      { id: 'li5', feeCategoryId: 'fc1', feeCategoryName: 'মাসিক বেতন', quantity: 1, unitPrice: 2500, subtotal: 2500 },
      { id: 'li6', feeCategoryId: 'fc2', feeCategoryName: 'পরীক্ষা ফি', quantity: 1, unitPrice: 1500, subtotal: 1500 },
    ],
    subtotal: 4000, discountAmount: 0, taxAmount: 0, totalAmount: 4000,
    paidAmount: 2000, dueAmount: 2000,
    status: 'PARTIAL', dueDate: '2026-06-30', issuedDate: '2026-06-01', institutionId: 'inst-1',
  },
  {
    id: 'inv4', invoiceNumber: 'INV-2026-0004', studentId: '4',
    studentName: 'Sumaiya Khanam', studentClass: 'Class 10', studentSection: 'A',
    lineItems: [
      { id: 'li7', feeCategoryId: 'fc1', feeCategoryName: 'মাসিক বেতন', quantity: 1, unitPrice: 2500, subtotal: 2500 },
    ],
    subtotal: 2500, discountAmount: 0, taxAmount: 0, totalAmount: 2500,
    paidAmount: 0, dueAmount: 2500,
    status: 'SENT', dueDate: '2026-07-15', issuedDate: '2026-07-01', institutionId: 'inst-1',
  },
  {
    id: 'inv5', invoiceNumber: 'INV-2026-0005', studentId: '5',
    studentName: 'Tanvir Ahmed', studentClass: 'Class 8', studentSection: 'B',
    lineItems: [
      { id: 'li8', feeCategoryId: 'fc1', feeCategoryName: 'মাসিক বেতন', quantity: 1, unitPrice: 2500, subtotal: 2500 },
      { id: 'li9', feeCategoryId: 'fc5', feeCategoryName: 'কম্পিউটার ফি', quantity: 1, unitPrice: 800, subtotal: 800 },
      { id: 'li10', feeCategoryId: 'fc6', feeCategoryName: 'স্পোর্টস ফি', quantity: 1, unitPrice: 300, subtotal: 300 },
    ],
    subtotal: 3600, discountAmount: 100, taxAmount: 0, totalAmount: 3500,
    paidAmount: 3500, dueAmount: 0,
    status: 'PAID', dueDate: '2026-06-30', issuedDate: '2026-06-01', institutionId: 'inst-1',
  },
  {
    id: 'inv6', invoiceNumber: 'INV-2026-0006', studentId: '6',
    studentName: 'Nusrat Jahan', studentClass: 'Class 9', studentSection: 'A',
    lineItems: [
      { id: 'li11', feeCategoryId: 'fc1', feeCategoryName: 'মাসিক বেতন', quantity: 1, unitPrice: 2500, subtotal: 2500 },
      { id: 'li12', feeCategoryId: 'fc3', feeCategoryName: 'ভর্তি ফি', quantity: 1, unitPrice: 5000, subtotal: 5000 },
    ],
    subtotal: 7500, discountAmount: 0, taxAmount: 0, totalAmount: 7500,
    paidAmount: 0, dueAmount: 7500,
    status: 'OVERDUE', dueDate: '2026-05-15', issuedDate: '2026-05-01', institutionId: 'inst-1',
  },
];

export const MOCK_PAYMENTS: Payment[] = [
  {
    id: 'pay1', invoiceId: 'inv1', amount: 3300, method: 'BKASH',
    transactionId: 'BK2026060101', paidAt: '2026-06-15T10:30:00Z',
    notes: 'Paid via bKash', recordedBy: 'Admin',
  },
  {
    id: 'pay2', invoiceId: 'inv3', amount: 2000, method: 'CASH',
    paidAt: '2026-06-20T14:00:00Z', notes: 'Partial cash payment', recordedBy: 'Admin',
  },
  {
    id: 'pay3', invoiceId: 'inv5', amount: 3500, method: 'NAGAD',
    transactionId: 'NG2026063001', paidAt: '2026-06-30T09:15:00Z',
    notes: 'Paid via Nagad', recordedBy: 'Admin',
  },
];

export const MONTHLY_FEE_DATA = [
  { month: 'জানুয়ারি', amount: 385000 },
  { month: 'ফেব্রুয়ারি', amount: 412000 },
  { month: 'মার্চ', amount: 398000 },
  { month: 'এপ্রিল', amount: 445000 },
  { month: 'মে', amount: 461000 },
  { month: 'জুন', amount: 482500 },
];

export const ATTENDANCE_DATA = [
  { name: 'উপস্থিত', value: 87, color: '#0D9488' },
  { name: 'অনুপস্থিত', value: 9, color: '#EF4444' },
  { name: 'বিলম্বিত', value: 4, color: '#F59E0B' },
];

export const RECENT_ADMISSIONS = [
  { id: '9', name: 'Imran Khan', className: 'Class 7-B', admissionDate: '2026-03-01', status: 'ACTIVE' },
  { id: '10', name: 'Rabeya Sultana', className: 'Class 9-C', admissionDate: '2026-02-20', status: 'ACTIVE' },
  { id: '11', name: 'Shahriar Hasan', className: 'Class 8-A', admissionDate: '2026-01-25', status: 'ACTIVE' },
  { id: '5', name: 'Tanvir Ahmed', className: 'Class 8-B', admissionDate: '2026-02-01', status: 'ACTIVE' },
  { id: '12', name: 'Maliha Rahman', className: 'Class 11-Science', admissionDate: '2026-06-01', status: 'ACTIVE' },
];

export const RECENT_PAYMENTS_MOCK = [
  { id: 'pay1', studentName: 'Mohammad Rahim', amount: 3300, method: 'bKash', date: '2026-06-15', status: 'PAID' },
  { id: 'pay3', studentName: 'Tanvir Ahmed', amount: 3500, method: 'Nagad', date: '2026-06-30', status: 'PAID' },
  { id: 'pay4', studentName: 'Nasrin Akter', amount: 2500, method: 'Cash', date: '2026-06-28', status: 'PAID' },
  { id: 'pay5', studentName: 'Nusrat Jahan', amount: 5000, method: 'bKash', date: '2026-06-10', status: 'PAID' },
  { id: 'pay2', studentName: 'Arif Hossain', amount: 2000, method: 'Cash', date: '2026-06-20', status: 'PARTIAL' },
];

export const ATTENDANCE_TREND_DATA = [
  { week: 'সপ্তাহ ১', present: 89, absent: 7, late: 4 },
  { week: 'সপ্তাহ ২', present: 85, absent: 10, late: 5 },
  { week: 'সপ্তাহ ৩', present: 91, absent: 6, late: 3 },
  { week: 'সপ্তাহ ৪', present: 87, absent: 9, late: 4 },
];

export const CLASSES = [
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  'Class 11', 'Class 12',
];

export const SECTIONS = ['A', 'B', 'C', 'D', 'Science', 'Commerce', 'Arts'];
