import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, ReceiptText, Settings as SettingsIcon, Users } from 'lucide-react';
import { Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import type { SiteMeResponse } from '../sites.types';
import { ProductsView } from './shop/ProductsView';
import { OrdersView } from './shop/OrdersView';
import { CustomersView } from './shop/CustomersView';
import { ShopSettingsView } from './shop/ShopSettingsView';

const VIEWS = ['products', 'orders', 'customers', 'settings'] as const;
type ShopView = (typeof VIEWS)[number];

/** Shop sub-tabs: Products, Orders, Customers, Settings (WEBSITE_V2_BRIEF.md §5). */
export const ShopTab: React.FC<{ me: SiteMeResponse }> = ({ me }) => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const requested = params.get('shopView') as ShopView | null;
  const view: ShopView = requested && VIEWS.includes(requested) ? requested : 'products';
  const setView = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('shopView', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs
        variant="pills"
        idPrefix="shop-view"
        label={t('Shop sections')}
        value={view}
        onChange={setView}
        tabs={[
          { id: 'products', label: t('Products'), icon: <Package /> },
          { id: 'orders', label: t('Orders'), icon: <ReceiptText /> },
          { id: 'customers', label: t('Customers'), icon: <Users /> },
          { id: 'settings', label: t('Settings'), icon: <SettingsIcon /> },
        ]}
      />
      {view === 'products' && <ProductsView />}
      {view === 'orders' && <OrdersView />}
      {view === 'customers' && <CustomersView />}
      {view === 'settings' && <ShopSettingsView me={me} />}
    </div>
  );
};
