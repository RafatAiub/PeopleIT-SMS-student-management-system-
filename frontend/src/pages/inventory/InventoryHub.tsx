import React, { useState } from 'react';
import { Boxes, Package, Receipt, Wrench, BarChart3 } from 'lucide-react';
import { PageHeader, Tabs, Alert } from '../../components/ui';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { AssetsTab } from './AssetsTab';
import { StockTab } from './StockTab';
import { PurchasesTab } from './PurchasesTab';
import { MaintenanceTab } from './MaintenanceTab';
import { InventoryReportsTab } from './InventoryReportsTab';

type TabId = 'assets' | 'stock' | 'purchases' | 'maintenance' | 'reports';

/**
 * Route: /inventory — SUPER_ADMIN, ADMIN (manage) and ACCOUNTANT (read-only).
 * Mirrors backend/src/modules/inventory/inventory.routes.ts (MANAGE / READ).
 */
const InventoryHub: React.FC = () => {
  const t = useT();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const [tab, setTab] = useState<TabId>('assets');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Inventory & Assets')}
        description={t('Track fixed assets, consumable stock, purchases and maintenance.')}
      />

      {!canManage && (
        <Alert tone="info" title={t('Read-only access')}>
          {t('You can view inventory, reports and exports. Only administrators can make changes.')}
        </Alert>
      )}

      <Tabs
        variant="pills"
        label={t('Inventory sections')}
        idPrefix="inventory-tab"
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        tabs={[
          { id: 'assets', label: t('Assets'), icon: <Boxes className="w-4 h-4" /> },
          { id: 'stock', label: t('Stock'), icon: <Package className="w-4 h-4" /> },
          { id: 'purchases', label: t('Purchases'), icon: <Receipt className="w-4 h-4" /> },
          { id: 'maintenance', label: t('Maintenance'), icon: <Wrench className="w-4 h-4" /> },
          { id: 'reports', label: t('Reports'), icon: <BarChart3 className="w-4 h-4" /> },
        ]}
      />

      {tab === 'assets' && <AssetsTab canManage={canManage} />}
      {tab === 'stock' && <StockTab canManage={canManage} />}
      {tab === 'purchases' && <PurchasesTab canManage={canManage} />}
      {tab === 'maintenance' && <MaintenanceTab canManage={canManage} />}
      {tab === 'reports' && <InventoryReportsTab />}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t('Note: there is no dedicated store-keeper role yet — administrators manage inventory, accountants have read-only access.')}
      </p>
    </div>
  );
};

export default InventoryHub;
