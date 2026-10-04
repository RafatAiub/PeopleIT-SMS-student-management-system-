import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Drawer, ErrorState, Select, Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/Pagination';
import { formatDate, formatNumber, useT } from '@/i18n';
import { errMsg, useWebhookDeliveries, useWebhookMutation, webhookApi, type WebhookDelivery, type WebhookEndpoint } from './developer.api';

const DeliveryRow: React.FC<{ d: WebhookDelivery }> = ({ d }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const redeliver = useWebhookMutation(webhookApi.redeliver);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        {d.success ? <Badge variant="success">{d.statusCode ?? 'OK'}</Badge> : <Badge variant="danger">{d.statusCode ?? t('No response')}</Badge>}
        <span className="font-mono text-sm text-slate-800 dark:text-slate-200">{d.event}</span>
        <span className="text-xs text-slate-500">
          {t('Attempt {n}', { n: d.attempt })} · {formatDate(d.createdAt, true)}
          {typeof d.payload?.durationMs === 'number' && ` · ${formatNumber(d.payload.durationMs)} ms`}
        </span>
        <div className="ml-auto flex gap-1">
          <Button size="xs" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t('Hide') : t('Details')}
          </Button>
          <Button
            size="xs"
            variant="outline"
            leftIcon={<RotateCw className="w-3 h-3" />}
            isLoading={redeliver.isPending}
            onClick={async () => {
              try {
                const r = await redeliver.mutateAsync(d.id);
                if (r.success) toast.success(t('Delivered (HTTP {code})', { code: r.statusCode ?? '' }));
                else toast.error(r.error ?? t('Delivery failed'));
              } catch (err) {
                toast.error(errMsg(err, t('Could not re-send')));
              }
            }}
          >
            {t('Redeliver')}
          </Button>
        </div>
      </div>
      {!d.success && d.payload?.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400 break-words">{d.payload.error}</p>}
      {open && (
        <div className="mt-2 space-y-2">
          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 dark:bg-white/5 p-3 text-xs">{JSON.stringify(d.payload?.envelope ?? null, null, 2)}</pre>
          {d.payload?.response && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">{t('Response body (first 500 bytes)')}</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-slate-100 dark:bg-white/5 p-3 text-xs whitespace-pre-wrap break-words">{d.payload.response}</pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
};

export const WebhookDeliveriesDrawer: React.FC<{ endpoint: WebhookEndpoint | null; onClose: () => void }> = ({ endpoint, onClose }) => {
  const t = useT();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filter, setFilter] = useState<'' | 'true' | 'false'>('');
  const query = useWebhookDeliveries(endpoint?.id ?? null, { page, pageSize, ...(filter ? { success: filter } : {}) });
  const total = query.data?.meta.total ?? 0;

  return (
    <Drawer isOpen={!!endpoint} onClose={onClose} title={t('Delivery log')} description={endpoint?.url} width="lg">
      <div className="space-y-3">
        <Select
          aria-label={t('Filter deliveries')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
          options={[
            { value: '', label: t('All attempts') },
            { value: 'true', label: t('Successful') },
            { value: 'false', label: t('Failed') },
          ]}
          containerClassName="w-48"
        />
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState message={errMsg(query.error, t('Could not load deliveries.'))} onRetry={() => query.refetch()} />
        ) : !query.data?.items.length ? (
          <EmptyState compact title={t('No deliveries yet')} description={t('Use "Send test" to try the endpoint.')} />
        ) : (
          <>
            <ul className="divide-y divide-slate-200 dark:divide-white/10">
              {query.data.items.map((d) => (
                <DeliveryRow key={d.id} d={d} />
              ))}
            </ul>
            {total > pageSize && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </div>
    </Drawer>
  );
};
