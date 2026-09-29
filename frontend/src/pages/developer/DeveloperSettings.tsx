import React, { useState } from 'react';
import { KeyRound, Webhook } from 'lucide-react';
import { Card, PageHeader, TabPanel, Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import { ApiKeysTab } from './ApiKeysTab';
import { WebhooksTab } from './WebhooksTab';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';

/**
 * API keys + webhooks for integrators. Route: /developer
 * (SUPER_ADMIN, ADMIN — mirrors /api/v1/api-keys and /api/v1/webhooks).
 */
const DeveloperSettings: React.FC = () => {
  const t = useT();
  const [tab, setTab] = useState('keys');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('API & webhooks')}
        description={t('Connect other systems to your school data: read-only API keys and signed event webhooks.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('API & webhooks') }]}
      />
      <Tabs
        idPrefix="developer"
        label={t('Developer settings')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'keys', label: t('API keys'), icon: <KeyRound className="w-4 h-4" /> },
          { id: 'webhooks', label: t('Webhooks'), icon: <Webhook className="w-4 h-4" /> },
        ]}
      />
      <TabPanel idPrefix="developer" id="keys" value={tab}>
        <div className="space-y-4">
          <ApiKeysTab />
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('Using the public API')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              {t('All endpoints are read-only, scoped to this institution, and limited per key per minute.')}
            </p>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 text-slate-100 p-3 text-xs leading-relaxed">
{`curl -H "X-API-Key: psk_…" \\
  "${API_BASE}/public-api/students?page=1&pageSize=50"

GET ${API_BASE}/public-api/students            (students:read)
GET ${API_BASE}/public-api/attendance/summary  (attendance:read) ?from=YYYY-MM-DD&to=YYYY-MM-DD
GET ${API_BASE}/public-api/invoices            (fees:read) ?status=UNPAID`}
            </pre>
          </Card>
        </div>
      </TabPanel>
      <TabPanel idPrefix="developer" id="webhooks" value={tab}>
        <WebhooksTab />
      </TabPanel>
    </div>
  );
};

export default DeveloperSettings;
