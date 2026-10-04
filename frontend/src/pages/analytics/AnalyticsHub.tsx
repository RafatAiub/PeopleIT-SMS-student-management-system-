import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, CalendarClock, Download, Printer, Wallet, CalendarCheck, GraduationCap, UserPlus } from 'lucide-react';
import { Alert, Button, PageHeader, Tabs, TabPanel } from '@/components/ui';
import { PrintLayout } from '@/components/print/PrintLayout';
import { useAuthStore } from '../../store/authStore';
import { formatDate, useT } from '@/i18n';
import { allowedReportKeys, canManageSchedules, REPORT_LABELS } from './analytics.access';
import { apiError, downloadReportCsv, useFilterOptions } from './analytics.queries';
import { FilterBar } from './FilterBar';
import { SavedViewsMenu } from './SavedViewsMenu';
import { FinanceTab } from './FinanceTab';
import { AttendanceTab } from './AttendanceTab';
import { AcademicTab } from './AcademicTab';
import { AdmissionsTab } from './AdmissionsTab';
import { defaultFilters, effectiveRange } from './analyticsRange';
import type { ReportFilters, ReportKey, SavedView } from './analytics.types';

const TAB_ICONS: Record<ReportKey, React.ReactNode> = {
  finance: <Wallet className="w-4 h-4" />,
  attendance: <CalendarCheck className="w-4 h-4" />,
  academic: <GraduationCap className="w-4 h-4" />,
  admissions: <UserPlus className="w-4 h-4" />,
};

const SHARED_KEYS = ['branchId', 'academicYearId', 'classId', 'sectionId'] as const;

/** Analytics hub: Finance / Attendance / Academic / Admissions with shared filters, saved views, CSV/XLSX export and print. */
export default function AnalyticsHub() {
  const t = useT();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const tabsForRole = useMemo(() => allowedReportKeys(role), [role]);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as ReportKey | null;
  const tab: ReportKey = requested && tabsForRole.includes(requested) ? requested : tabsForRole[0] ?? 'finance';

  const [filtersByTab, setFiltersByTab] = useState<Record<ReportKey, ReportFilters>>(() => ({
    finance: defaultFilters('finance'),
    attendance: defaultFilters('attendance'),
    academic: defaultFilters('academic'),
    admissions: defaultFilters('admissions'),
  }));
  const [activeView, setActiveView] = useState<Partial<Record<ReportKey, string | null>>>({});
  const [printMode, setPrintMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const options = useFilterOptions();
  const filters = filtersByTab[tab];

  /** Updates this tab; branch/session/class/section carry over to the other tabs. */
  const changeFilters = (next: ReportFilters) => {
    setFiltersByTab((prev) => {
      const out = { ...prev, [tab]: next };
      for (const key of Object.keys(prev) as ReportKey[]) {
        if (key === tab || key === 'admissions') continue;
        const copy = { ...out[key] };
        for (const k of SHARED_KEYS) copy[k] = next[k];
        out[key] = copy;
      }
      return out;
    });
  };

  const applyView = (view: SavedView | null) => {
    setActiveView((prev) => ({ ...prev, [tab]: view?.id ?? null }));
    if (view) changeFilters({ ...defaultFilters(tab), ...view.filters });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadReportCsv(tab, filters);
    } catch (e) {
      toast.error(apiError(e, t('Could not export the report.')));
    } finally {
      setExporting(false);
    }
  };

  if (tabsForRole.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('Analytics')} />
        <Alert tone="warning" title={t('No reports available')}>{t('Your role does not have access to any analytics report.')}</Alert>
      </div>
    );
  }

  const TabBody = { finance: FinanceTab, attendance: AttendanceTab, academic: AcademicTab, admissions: AdmissionsTab }[tab];

  if (printMode) {
    const range = effectiveRange(filters);
    return (
      <div className="space-y-4">
        <div className="no-print">
          <Button type="button" variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => setPrintMode(false)}>
            {t('Back to analytics')}
          </Button>
        </div>
        <PrintLayout
          title={t('{name} report', { name: t(REPORT_LABELS[tab]) })}
          reference={range.from || range.to ? `${range.from ? formatDate(range.from) : '…'} – ${range.to ? formatDate(range.to) : '…'}` : undefined}
          footer={<p className="text-xs text-slate-500">{t('Computer-generated report.')}</p>}
        >
          <TabBody filters={filters} printMode />
        </PrintLayout>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Analytics')}
        description={t('Finance, attendance, academic and admissions insights with filters, saved views and exports.')}
        actions={
          <div className="flex flex-wrap gap-2">
            <SavedViewsMenu
              reportKey={tab}
              filters={filters}
              activeViewId={activeView[tab] ?? null}
              onApply={applyView}
              canDeleteAny={role === 'SUPER_ADMIN' || role === 'ADMIN'}
            />
            <Button type="button" variant="secondary" size="sm" leftIcon={<Download className="w-4 h-4" />} isLoading={exporting} onClick={exportCsv}>
              {t('Export CSV')}
            </Button>
            <Button type="button" variant="secondary" size="sm" leftIcon={<Printer className="w-4 h-4" />} onClick={() => setPrintMode(true)}>
              {t('Print')}
            </Button>
            {canManageSchedules(role) && (
              <Button type="button" variant="secondary" size="sm" leftIcon={<CalendarClock className="w-4 h-4" />} onClick={() => navigate('/analytics/schedules')}>
                {t('Scheduled emails')}
              </Button>
            )}
          </div>
        }
      />

      <Tabs
        idPrefix="analytics"
        label={t('Report')}
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        tabs={tabsForRole.map((k) => ({ id: k, label: t(REPORT_LABELS[k]), icon: TAB_ICONS[k] }))}
      />

      <FilterBar tab={tab} filters={filters} onChange={changeFilters} options={options.data} optionsLoading={options.isLoading} />
      {options.isError && (
        <Alert tone="warning" title={t('Filter lists unavailable')}>{t('Branch, class and exam lists could not be loaded; reports still work without them.')}</Alert>
      )}

      <TabPanel id={tab} value={tab} idPrefix="analytics">
        <TabBody filters={filters} />
      </TabPanel>
    </div>
  );
}
