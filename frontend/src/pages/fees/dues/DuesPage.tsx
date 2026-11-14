import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Settings2 } from 'lucide-react';
import { PageHeader, TabPanel, Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useFilterOptions } from './dues.api';
import { currentMonth, yearRange } from './dues.logic';
import { DuesGridTab } from './DuesGridTab';
import { DefaultersTab } from './DefaultersTab';
import { RestrictedTab } from './RestrictedTab';

// =============================================================================
// /fees/dues — Fees → Dues: grid, defaulters, restricted students.
// =============================================================================

type TabId = 'grid' | 'defaulters' | 'restricted';

const DuesPage: React.FC = () => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const [params, setParams] = useSearchParams();
  const tab = (['grid', 'defaulters', 'restricted'].includes(params.get('tab') ?? '') ? params.get('tab') : 'grid') as TabId;
  const options = useFilterOptions();
  const ledgerRange = yearRange(Number(currentMonth(options.data?.timeZone).slice(0, 4)));
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('Fee dues')}
        description={t('Who paid and who didn’t — by month, class and section.')}
        breadcrumbs={[{ label: t('Fees'), to: '/fees' }, { label: t('Dues') }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/fees/reports" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm font-medium min-h-[40px] hover:bg-slate-50 dark:hover:bg-white/5">
              <FileSpreadsheet className="w-4 h-4" aria-hidden /> {t('Fee reports')}
            </Link>
            {isAdmin && (
              <Link to="/fees/dues/settings" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-2 text-sm font-medium min-h-[40px] hover:bg-slate-50 dark:hover:bg-white/5">
                <Settings2 className="w-4 h-4" aria-hidden /> {t('Dues restrictions')}
              </Link>
            )}
          </div>
        }
      />
      <Tabs
        idPrefix="dues"
        label={t('Dues views')}
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        tabs={[
          { id: 'grid', label: t('Dashboard') },
          { id: 'defaulters', label: t('Defaulters') },
          { id: 'restricted', label: t('Restricted students') },
        ]}
      />
      <TabPanel idPrefix="dues" id={tab} value={tab}>
        {tab === 'grid' && <DuesGridTab options={options.data} />}
        {tab === 'defaulters' && <DefaultersTab options={options.data} ledgerRange={ledgerRange} />}
        {tab === 'restricted' && <RestrictedTab options={options.data} />}
      </TabPanel>
    </div>
  );
};

export default DuesPage;
