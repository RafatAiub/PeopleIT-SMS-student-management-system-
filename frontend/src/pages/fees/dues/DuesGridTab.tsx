import React from 'react';
import { Users, Wallet, TrendingUp, AlertTriangle, PiggyBank } from 'lucide-react';
import { Card, ErrorState, Select, SkeletonText, StatCard } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatNumber, useLocale, useT } from '@/i18n';
import { useDuesGrid, type FilterOptions, type GridCell, type GridRow } from './dues.api';
import { CELL_STYLE, currentMonth, rateText, shortMonth, yearRange, type CellStatus } from './dues.logic';
import { ClassSectionSearch, Pager, useDebounced, type ClassFilterValue } from './DuesFilters';
import { StudentLedgerDrawer } from './StudentLedgerDrawer';

// =============================================================================
// Fees → Dues → Dashboard: month × student grid with totals.
// =============================================================================

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All students' },
  { value: 'DUE', label: 'With dues' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PARTIAL', label: 'Partly paid' },
  { value: 'PAID', label: 'Fully paid' },
  { value: 'NO_INVOICE', label: 'No invoice' },
];

export const DuesGridTab: React.FC<{ options?: FilterOptions }> = ({ options }) => {
  const t = useT();
  const { lang } = useLocale();
  const thisYear = Number(currentMonth(options?.timeZone).slice(0, 4));
  const [period, setPeriod] = React.useState<string>(`Y${thisYear}`);
  const [cls, setCls] = React.useState<ClassFilterValue>({ classId: '', sectionId: '', search: '' });
  const [feeCategoryId, setCategory] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [page, setPage] = React.useState(1);
  const [picked, setPicked] = React.useState<{ row: GridRow; cell: GridCell } | null>(null);
  const [ledger, setLedger] = React.useState<string | null>(null);
  const search = useDebounced(cls.search.trim());

  const range = React.useMemo(() => {
    if (period.startsWith('S:')) {
      const s = options?.sessions.find((x) => x.id === period.slice(2));
      if (s) return { from: s.fromMonth, to: s.toMonth };
    }
    return yearRange(Number(period.slice(1)) || thisYear);
  }, [period, options, thisYear]);

  React.useEffect(() => setPage(1), [range.from, range.to, cls.classId, cls.sectionId, feeCategoryId, status, search]);

  const q = useDuesGrid({ ...range, classId: cls.classId, sectionId: cls.sectionId, feeCategoryId, status, search, page, pageSize: 50 });
  const d = q.data;

  const periodOptions = [
    ...[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => ({ value: `Y${y}`, label: t('Year {y}', { y }) })),
    ...(options?.sessions ?? []).map((s) => ({ value: `S:${s.id}`, label: `${t('Session')} ${s.label}${s.isCurrent ? ` (${t('current')})` : ''}` })),
  ];

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <Select id="dues-period" label={t('Session / year')} value={period} onChange={(e) => setPeriod(e.target.value)} options={periodOptions} />
        <ClassSectionSearch idPrefix="dues" options={options} value={cls} onChange={setCls} />
        <Select
          id="dues-category"
          label={t('Fee category')}
          value={feeCategoryId}
          onChange={(e) => setCategory(e.target.value)}
          options={[{ value: '', label: t('All categories') }, ...(options?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Select id="dues-status" label={t('Status')} value={status} onChange={(e) => setStatus(e.target.value)} options={STATUS_FILTERS.map((s) => ({ value: s.value, label: t(s.label) }))} />
      </Card>

      {d && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label={t('Billed')} value={formatCurrency(d.summary.billed)} icon={<Wallet className="w-5 h-5" />} tone="info" />
          <StatCard label={t('Collected')} value={formatCurrency(d.summary.collected)} icon={<PiggyBank className="w-5 h-5" />} tone="success" />
          <StatCard label={t('Outstanding')} value={formatCurrency(d.summary.outstanding)} icon={<AlertTriangle className="w-5 h-5" />} tone="danger" hint={t('Overdue {amount}', { amount: formatCurrency(d.summary.overdue) })} />
          <StatCard label={t('Collection rate')} value={rateText(d.summary.collectionRate)} icon={<TrendingUp className="w-5 h-5" />} tone="accent" />
          <StatCard label={t('Students with dues')} value={`${formatNumber(d.summary.studentsWithDues)} / ${formatNumber(d.summary.students)}`} icon={<Users className="w-5 h-5" />} tone="warning" />
        </div>
      )}

      <Legend />

      {picked && (
        <div role="status" className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-2 text-sm flex flex-wrap gap-x-4 gap-y-1">
          <strong>{picked.row.name} · {shortMonth(picked.cell.month, lang)} {picked.cell.month.slice(0, 4)}</strong>
          <span>{t(CELL_STYLE[picked.cell.status].label)}</span>
          <span>{t('Billed')}: {formatCurrency(picked.cell.billed)}</span>
          <span>{t('Paid')}: {formatCurrency(picked.cell.paid)}</span>
          <span>{t('Due')}: {formatCurrency(picked.cell.due)}</span>
          <button type="button" className="underline text-primary-700 dark:text-primary-300" onClick={() => setLedger(picked.row.id)}>{t('Open ledger')}</button>
        </div>
      )}

      {q.isLoading ? (
        <SkeletonText lines={10} />
      ) : q.isError || !d ? (
        <ErrorState title={t('Could not load dues')} onRetry={() => q.refetch()} />
      ) : d.rows.length === 0 ? (
        <EmptyState title={t('No students match these filters')} />
      ) : (
        <Card flush className="overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="min-w-full text-xs border-separate border-spacing-0">
              <caption className="sr-only">{t('Fees paid and due per student per month')}</caption>
              <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th scope="col" className="sticky left-0 z-30 bg-slate-50 dark:bg-slate-800 text-left px-3 py-2 font-semibold min-w-[150px] border-b border-slate-200 dark:border-white/10">{t('Student')}</th>
                  {d.months.map((m) => (
                    <th key={m} scope="col" className="px-1 py-2 font-semibold text-center border-b border-slate-200 dark:border-white/10 min-w-[44px]">
                      {shortMonth(m, lang)}
                      <span className="block text-[10px] font-normal text-slate-500">{m.slice(2, 4)}</span>
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 text-right font-semibold border-b border-slate-200 dark:border-white/10">{t('Paid')}</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold border-b border-slate-200 dark:border-white/10">{t('Due')}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-white/5">
                    <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-slate-900 text-left px-3 py-1.5 font-normal border-b border-slate-100 dark:border-white/5">
                      <button type="button" onClick={() => setLedger(r.id)} className="text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded">
                        <span className="block font-medium text-slate-900 dark:text-white truncate max-w-[160px]">{r.name}</span>
                        <span className="block text-[11px] text-slate-500 truncate max-w-[160px]">
                          {[r.rollNumber && `${t('Roll')} ${r.rollNumber}`, [r.className, r.sectionName].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    </th>
                    {r.cells.map((c) => {
                      const s = CELL_STYLE[c.status as CellStatus];
                      const tip = `${r.name} · ${c.month}: ${t(s.label)}${c.invoices ? ` — ${t('Billed')} ${formatCurrency(c.billed)}, ${t('Paid')} ${formatCurrency(c.paid)}, ${t('Due')} ${formatCurrency(c.due)}` : ''}`;
                      return (
                        <td key={c.month} className="px-0.5 py-0.5 border-b border-slate-100 dark:border-white/5 text-center">
                          <button
                            type="button"
                            title={tip}
                            aria-label={tip}
                            onClick={() => setPicked({ row: r, cell: c })}
                            className={`w-10 h-8 rounded-md font-semibold ${s.cls} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${c.overdue ? 'ring-1 ring-rose-400' : ''}`}
                          >
                            {s.symbol}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right border-b border-slate-100 dark:border-white/5 whitespace-nowrap">{formatCurrency(r.totals.paid)}</td>
                    <td className={`px-2 py-1.5 text-right border-b border-slate-100 dark:border-white/5 whitespace-nowrap font-semibold ${r.totals.due > 0 ? 'text-rose-700 dark:text-rose-300' : ''}`}>{formatCurrency(r.totals.due)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-50 dark:bg-slate-800 text-[11px]">
                <tr>
                  <th scope="row" className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 text-left px-3 py-2 font-semibold">{t('Collected / billed')}</th>
                  {d.columns.map((c) => (
                    <td key={c.month} className="px-1 py-2 text-center whitespace-nowrap" title={`${t('Billed')} ${formatCurrency(c.billed)} · ${t('Paid')} ${formatCurrency(c.paid)} · ${t('Due')} ${formatCurrency(c.due)} · ${t('Students with dues')} ${c.studentsWithDues}`}>
                      <span className="block font-semibold">{rateText(c.collectionRate)}</span>
                      <span className="block text-slate-500">{c.due > 0 ? formatCurrency(c.due, { decimals: 0 }) : '—'}</span>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">{formatCurrency(d.summary.collected)}</td>
                  <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">{formatCurrency(d.summary.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-3 border-t border-slate-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{t('{n} students', { n: formatNumber(d.total) })} · {t('Footer: collection rate and amount still due per month (all pages).')}</span>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </div>
        </Card>
      )}

      <StudentLedgerDrawer studentId={ledger} range={range} onClose={() => setLedger(null)} />
    </div>
  );
};

const Legend: React.FC = () => {
  const t = useT();
  return (
    <ul className="flex flex-wrap gap-2 text-xs" aria-label={t('Legend')}>
      {(Object.keys(CELL_STYLE) as CellStatus[]).map((k) => (
        <li key={k} className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${CELL_STYLE[k].cls}`}>
          <span aria-hidden className="font-bold">{CELL_STYLE[k].symbol}</span>
          {t(CELL_STYLE[k].label)}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 ring-1 ring-rose-400 text-slate-700 dark:text-slate-200">{t('Red outline = overdue')}</li>
    </ul>
  );
};
