import React from 'react';
import toast from 'react-hot-toast';
import { Download, FileText, Printer } from 'lucide-react';
import { Alert, Button, Card, ErrorState, Input, PageHeader, Select, SkeletonText } from '@/components/ui';
import { formatCurrency, formatNumber, useT } from '@/i18n';
import { StudentPicker } from '../StudentPicker';
import type { StudentSearchResult } from '../types';
import { apiErrorMessage, downloadReport, useFilterOptions, useReport, type ReportDoc } from './dues.api';
import { REPORT_DEFS, defaultRange, type ReportKey } from './dues.logic';
import { ClassSectionSearch, type ClassFilterValue } from './DuesFilters';

// =============================================================================
// /fees/reports — Fees → Reports: preview on screen, export Excel / PDF / CSV.
// =============================================================================

const PREVIEW_ROWS = 200;

const FeeReportsPage: React.FC = () => {
  const t = useT();
  const options = useFilterOptions();
  const tz = options.data?.timeZone ?? 'Asia/Dhaka';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const [key, setKey] = React.useState<ReportKey>('cash-book');
  const def = REPORT_DEFS.find((d) => d.key === key)!;
  const [range, setRange] = React.useState(defaultRange(def.range, today));
  const [cls, setCls] = React.useState<ClassFilterValue>({ classId: '', sectionId: '', search: '' });
  const [collectorId, setCollector] = React.useState('');
  const [method, setMethod] = React.useState('');
  const [student, setStudent] = React.useState<StudentSearchResult | null>(null);
  const [run, setRun] = React.useState<Record<string, string | undefined> | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const pick = (k: ReportKey) => {
    setKey(k);
    setRange(defaultRange(REPORT_DEFS.find((d) => d.key === k)!.range, today));
    setRun(null);
  };

  const params: Record<string, string | undefined> = {
    from: def.range === 'none' ? undefined : range.from,
    to: def.range === 'none' ? undefined : range.to,
    classId: def.filters.includes('class') ? cls.classId || undefined : undefined,
    sectionId: def.filters.includes('class') ? cls.sectionId || undefined : undefined,
    collectorId: def.filters.includes('collector') ? collectorId || undefined : undefined,
    method: def.filters.includes('method') ? method || undefined : undefined,
    studentId: def.filters.includes('student') ? student?.id : undefined,
  };
  const needsStudent = def.filters.includes('student') && !student;
  const report = useReport(key, run ?? {}, !!run);

  const exportAs = async (format: 'xlsx' | 'pdf' | 'csv') => {
    setBusy(format);
    try {
      await downloadReport(key, params, format);
    } catch (e) {
      toast.error(apiErrorMessage(e, t('Could not export the report')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('Fee reports')} breadcrumbs={[{ label: t('Fees'), to: '/fees' }, { label: t('Reports') }]} description={t('Collections, dues, concessions and statements — export to Excel, PDF or CSV.')} />
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <nav aria-label={t('Reports')}>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
            {REPORT_DEFS.map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  aria-current={key === d.key ? 'page' : undefined}
                  onClick={() => pick(d.key)}
                  className={`w-full text-left rounded-lg border px-3 py-2 min-h-[44px] ${key === d.key ? 'border-primary-500 bg-primary-50 text-slate-900 dark:bg-primary-500/15 dark:text-white' : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                >
                  <span className="block font-medium text-sm">{t(d.title)}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{t(d.description)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4 min-w-0">
          <Card className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {def.range !== 'none' && (
                <>
                  <Input id="rep-from" type={def.range === 'dates' ? 'date' : 'month'} label={t('From')} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
                  <Input id="rep-to" type={def.range === 'dates' ? 'date' : 'month'} label={t('To')} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
                </>
              )}
              {def.filters.includes('class') && <ClassSectionSearch idPrefix="rep" options={options.data} value={cls} onChange={setCls} hideSearch />}
              {def.filters.includes('collector') && (
                <Select id="rep-collector" label={t('Collected by')} value={collectorId} onChange={(e) => setCollector(e.target.value)}
                  options={[{ value: '', label: t('Everyone') }, ...(options.data?.collectors ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
              )}
              {def.filters.includes('method') && (
                <Select id="rep-method" label={t('Method')} value={method} onChange={(e) => setMethod(e.target.value)}
                  options={[{ value: '', label: t('All methods') }, ...(options.data?.methods ?? []).map((m) => ({ value: m, label: m }))]} />
              )}
            </div>
            {def.filters.includes('student') && (
              <div>
                <span className="field-label">{t('Student')}</span>
                <StudentPicker value={student} onChange={setStudent} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button leftIcon={<FileText className="w-4 h-4" />} disabled={needsStudent} onClick={() => setRun({ ...params })}>{t('Show report')}</Button>
              <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} disabled={needsStudent} isLoading={busy === 'xlsx'} onClick={() => exportAs('xlsx')}>Excel</Button>
              <Button variant="secondary" leftIcon={<Printer className="w-4 h-4" />} disabled={needsStudent} isLoading={busy === 'pdf'} onClick={() => exportAs('pdf')}>PDF</Button>
              <Button variant="secondary" leftIcon={<Download className="w-4 h-4" />} disabled={needsStudent} isLoading={busy === 'csv'} onClick={() => exportAs('csv')}>CSV</Button>
            </div>
            {needsStudent && <p className="text-xs text-slate-500">{t('Pick a student first.')}</p>}
          </Card>

          {run && (report.isLoading ? <SkeletonText lines={8} /> : report.isError || !report.data ? (
            <ErrorState title={apiErrorMessage(report.error, t('Could not build the report'))} onRetry={() => report.refetch()} />
          ) : <ReportView doc={report.data} />)}
        </div>
      </div>
    </div>
  );
};

const fmt = (v: unknown, type?: string) => {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'money' && typeof v === 'number') return formatCurrency(v);
  if (type === 'number' && typeof v === 'number') return formatNumber(v);
  return String(v);
};

export const ReportView: React.FC<{ doc: ReportDoc }> = ({ doc }) => {
  const t = useT();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t(doc.title)}</h2>
        <p className="text-xs text-slate-500">{doc.filters.map((f) => `${t(f.label)}: ${f.value}`).join(' · ')}</p>
      </div>
      {doc.tables.map((tb, i) => (
        <Card key={i} flush className="overflow-hidden">
          {tb.title && <h3 className="px-3 pt-3 font-semibold text-sm">{t(tb.title)}</h3>}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>{tb.columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 whitespace-nowrap ${c.type === 'money' || c.type === 'number' ? 'text-right' : 'text-left'}`}>{t(c.label)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {tb.rows.length === 0 && <tr><td colSpan={tb.columns.length} className="px-3 py-4 text-center text-slate-500">{t('No records')}</td></tr>}
                {tb.rows.slice(0, PREVIEW_ROWS).map((r, j) => (
                  <tr key={j}>{tb.columns.map((c) => <td key={c.key} className={`px-3 py-1.5 ${c.type === 'money' || c.type === 'number' ? 'text-right whitespace-nowrap' : ''}`}>{fmt(r[c.key], c.type)}</td>)}</tr>
                ))}
              </tbody>
              {tb.totals && (
                <tfoot className="bg-slate-50 dark:bg-slate-800 font-semibold">
                  <tr>{tb.columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.type === 'money' || c.type === 'number' ? 'text-right whitespace-nowrap' : ''}`}>{typeof tb.totals![c.key] === 'string' ? t(String(tb.totals![c.key])) : fmt(tb.totals![c.key], c.type)}</td>)}</tr>
                </tfoot>
              )}
            </table>
          </div>
          {tb.rows.length > PREVIEW_ROWS && <p className="px-3 py-2 text-xs text-slate-500">{t('Showing the first {n} rows — export for the full list.', { n: PREVIEW_ROWS })}</p>}
        </Card>
      ))}
      {(doc.notes ?? []).map((n, i) => <Alert key={i} tone="info">{t(n)}</Alert>)}
    </div>
  );
};

export default FeeReportsPage;
