// Response shapes for /reports/analytics/*, /reports/saved-views and
// /reports/schedules — see backend/src/modules/reports/analytics.service.ts,
// savedViews.service.ts and schedules.service.ts.

export type ReportKey = 'finance' | 'attendance' | 'academic' | 'admissions';
export type RangePreset = 'today' | 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

export interface ReportFilters {
  branchId?: string;
  academicYearId?: string;
  classId?: string;
  sectionId?: string;
  from?: string;
  to?: string;
  preset?: RangePreset;
  granularity?: 'day' | 'month';
  examId?: string;
  threshold?: number;
  minDays?: number;
}

export interface DateRange {
  from: string;
  to: string;
  days: number;
}

export interface FilterOptions {
  branches: { id: string; name: string }[];
  academicYears: { id: string; label: string; isCurrent: boolean; startDate: string; endDate: string }[];
  classes: { id: string; name: string; level: number; branchId: string; sections: { id: string; name: string }[] }[];
  exams: { id: string; name: string; startDate: string; endDate: string }[];
  teacherScoped: boolean;
}

export interface AgingBucket {
  bucket: 'current' | '0-30' | '31-60' | '61-90' | '90+';
  label: string;
  amount: number;
  count: number;
}

export interface FinanceAnalytics {
  range: DateRange;
  granularity: 'day' | 'month';
  kpis: {
    totalCollected: number;
    paymentsCount: number;
    billedDueInRange: number;
    collectedAgainstDue: number;
    outstandingDueInRange: number;
    invoicesDueInRange: number;
    collectionRate: number;
    totalOutstanding: number;
    totalOverdue: number;
    defaulterCount: number;
  };
  collections: { period: string; amount: number; count: number }[];
  byMethod: { method: string; amount: number; count: number }[];
  byFeeHead: { id: string; name: string; billed: number; collected: number }[];
  aging: { asOf: string; buckets: AgingBucket[]; totalOutstanding: number; totalOverdue: number };
}

export interface Paged<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number };
}

export interface Defaulter {
  id: string;
  studentId: string;
  studentCode: string | null;
  name: string;
  rollNumber: string | null;
  phone: string | null;
  className: string | null;
  sectionName: string | null;
  overdueAmount: number;
  overdueInvoices: number;
  oldestDueDate: string | null;
  daysOverdue: number;
}

export interface StatusCounts {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  total: number;
}

export interface AttendanceAnalytics {
  range: DateRange;
  kpis: {
    rate: number | null;
    records: number;
    present: number;
    absent: number;
    late: number;
    halfDay: number;
    studentsCounted: number;
    daysRecorded: number;
    chronicAbsentees: number;
    threshold: number;
    minDays: number;
  };
  trend: (StatusCounts & { date: string; rate: number | null })[];
  byClass: (StatusCounts & {
    id: string;
    classId: string | null;
    className: string;
    sectionId: string | null;
    sectionName: string | null;
    students: number;
    rate: number | null;
  })[];
  weekday: (StatusCounts & { weekday: number; label: string; days: number; rate: number | null })[];
}

export interface ChronicAbsentee extends StatusCounts {
  id: string;
  studentId: string;
  studentCode: string | null;
  name: string;
  rollNumber: string | null;
  className: string | null;
  sectionName: string | null;
  absenceRate: number;
  attendanceRate: number | null;
}

export interface AcademicAnalytics {
  exam: { id: string; name: string; startDate: string; endDate: string } | null;
  exams: { id: string; name: string; startDate: string }[];
  scale: { id: string | null; name: string; isFallback: boolean };
  overall: {
    studentsWithResults: number;
    passCount: number;
    failCount: number;
    passRate: number;
    averagePercent: number;
    highestPercent: number;
    lowestPercent: number;
    averageGpa: number;
  } | null;
  byClass: {
    id: string;
    className: string;
    sectionName: string | null;
    students: number;
    passCount: number;
    failCount: number;
    passRate: number;
    averagePercent: number;
    averageGpa: number;
    highestPercent: number;
  }[];
  subjects: {
    id: string;
    subject: string;
    entries: number;
    averagePercent: number;
    averageMarks: number;
    highestPercent: number;
    lowestPercent: number;
    passRate: number;
  }[];
  gradeDistribution: { grade: string; count: number }[];
  subjectGradeDistribution: { grade: string; count: number }[];
  trend: {
    examId: string;
    name: string;
    startDate: string;
    students: number;
    passRate: number | null;
    averagePercent: number | null;
    averageGpa: number | null;
  }[];
}

export interface SavedView {
  id: string;
  name: string;
  reportKey: ReportKey;
  filters: ReportFilters;
  isShared: boolean;
  userId: string;
  createdAt: string;
  ownerName: string;
  isOwner: boolean;
  scheduleCount: number;
}

export interface ReportSchedule {
  id: string;
  savedViewId: string;
  cron: string;
  recipients: string[];
  format: 'CSV';
  lastRunAt: string | null;
  isActive: boolean;
  createdAt: string;
  createdByUserId: string;
  createdByName: string;
  nextRunAt: string | null;
  savedView: { id: string; name: string; reportKey: ReportKey };
}

export interface ScheduleList extends Paged<ReportSchedule> {
  demo: boolean;
  timeZone: string;
}

export interface ScheduleRunResult {
  demo: boolean;
  sent: number;
  failed: number;
  skippedRecipients: number;
  rows: number;
  bytes: number;
  rangeLabel: string;
  lastRunAt: string;
}

export interface RecipientOption {
  id: string;
  name: string;
  email: string;
  role: string;
}
