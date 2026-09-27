import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge, Button, Dropdown, ErrorState } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable/DataTable';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { formatDate, useT } from '@/i18n';
import { useTableParams } from '@/hooks/useTableParams';
import { errMsg, useWebhookMeta, useWebhookMutation, useWebhooks, webhookApi, type WebhookEndpoint } from './developer.api';
import { WebhookFormModal } from './WebhookFormModal';
import { WebhookDeliveriesDrawer } from './WebhookDeliveriesDrawer';
import { SecretRevealModal } from './SecretRevealModal';

export const WebhooksTab: React.FC = () => {
  const t = useT();
  const tp = useTableParams(10);
  const query = useWebhooks({ page: tp.params.page, pageSize: tp.params.pageSize });
  const meta = useWebhookMeta();
  const remove = useWebhookMutation(webhookApi.remove);
  const rotate = useWebhookMutation(webhookApi.rotate);
  const test = useWebhookMutation(webhookApi.test);
  const toggle = useWebhookMutation(webhookApi.update);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<WebhookEndpoint | null>(null);
  const [rotating, setRotating] = useState<WebhookEndpoint | null>(null);
  const [logFor, setLogFor] = useState<WebhookEndpoint | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const sendTest = async (w: WebhookEndpoint) => {
    setTestingId(w.id);
    try {
      const r = await test.mutateAsync(w.id);
      if (r.success) toast.success(t('Test delivered (HTTP {code}) in {ms} ms', { code: r.statusCode ?? '', ms: r.durationMs }));
      else toast.error(r.error ?? t('Test delivery failed'));
    } catch (err) {
      toast.error(errMsg(err, t('Could not send the test event')));
    } finally {
      setTestingId(null);
    }
  };

  const columns: Column<WebhookEndpoint>[] = [
    {
      key: 'url',
      header: t('Endpoint'),
      primary: true,
      render: (w) => (
        <div className="min-w-0">
          <p className="font-mono text-sm break-all text-slate-900 dark:text-slate-100">{w.url}</p>
          <p className="font-mono text-xs text-slate-500">{w.secretMasked}</p>
        </div>
      ),
      exportValue: (w) => w.url,
    },
    {
      key: 'events',
      header: t('Events'),
      sortable: false,
      render: (w) => (
        <div className="flex flex-wrap gap-1">
          {w.events.map((e) => (
            <Badge key={e} variant="neutral">
              {e}
            </Badge>
          ))}
        </div>
      ),
      exportValue: (w) => w.events.join(' '),
    },
    {
      key: 'isActive',
      header: t('Status'),
      render: (w) => (w.isActive ? <Badge variant="success">{t('Active')}</Badge> : <Badge variant="neutral">{t('Paused')}</Badge>),
      exportValue: (w) => (w.isActive ? 'Active' : 'Paused'),
    },
    {
      key: 'lastDelivery',
      header: t('Last delivery'),
      hideOnMobile: true,
      render: (w) =>
        w.lastDelivery ? (
          <span className="text-sm">
            {w.lastDelivery.success ? <Badge variant="success">{w.lastDelivery.statusCode}</Badge> : <Badge variant="danger">{w.lastDelivery.statusCode ?? t('Failed')}</Badge>}
            <span className="block text-xs text-slate-500 mt-0.5">{formatDate(w.lastDelivery.createdAt, true)}</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      exportValue: (w) => (w.lastDelivery ? `${w.lastDelivery.statusCode ?? ''} ${w.lastDelivery.createdAt}` : ''),
    },
    {
      key: 'more',
      header: '',
      sortable: false,
      align: 'right',
      render: (w) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="xs" variant="outline" isLoading={testingId === w.id} onClick={() => sendTest(w)}>
            {t('Send test')}
          </Button>
          <Dropdown
            trigger={(props) => (
              <Button {...props} size="xs" variant="ghost" aria-label={t('More actions')}>
                •••
              </Button>
            )}
            sections={[
              {
                items: [
                  { id: 'log', label: t('Delivery log'), onSelect: () => setLogFor(w) },
                  { id: 'edit', label: t('Edit'), onSelect: () => { setEditing(w); setFormOpen(true); } },
                  {
                    id: 'toggle',
                    label: w.isActive ? t('Pause') : t('Resume'),
                    onSelect: async () => {
                      try {
                        await toggle.mutateAsync({ id: w.id, isActive: !w.isActive });
                        toast.success(w.isActive ? t('Webhook paused') : t('Webhook resumed'));
                      } catch (err) {
                        toast.error(errMsg(err, t('Could not update the webhook')));
                      }
                    },
                  },
                  { id: 'rotate', label: t('Rotate secret'), onSelect: () => setRotating(w) },
                  { id: 'delete', label: t('Delete'), danger: true, onSelect: () => setDeleting(w) },
                ],
              },
            ]}
          />
        </div>
      ),
    },
  ];

  if (query.isError && !query.data) return <ErrorState message={errMsg(query.error, t('Could not load webhooks.'))} onRetry={() => query.refetch()} />;

  const addButton = (
    <Button size="sm" variant="gradient" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); setFormOpen(true); }}>
      {t('Add endpoint')}
    </Button>
  );

  return (
    <>
      {meta.data && (
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
          {t('Each delivery is signed:')} <code className="font-mono text-xs">{meta.data.signatureHeader}: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>{' '}
          {t('— HMAC-SHA256 of "t.body" with the endpoint secret. Failed deliveries are retried up to {n} times with backoff.', { n: meta.data.maxAttempts })}
        </p>
      )}
      <DataTable
        data={query.data?.items ?? []}
        columns={columns}
        isLoading={query.isLoading}
        serverPagination
        totalCount={query.data?.meta.total ?? 0}
        page={tp.params.page}
        pageSize={tp.params.pageSize}
        onPageChange={tp.setPage}
        onPageSizeChange={tp.setPageSize}
        onRowClick={setLogFor}
        toolbar={addButton}
        emptyTitle={t('No webhook endpoints')}
        emptyDescription={t('Get an HTTPS POST when a student is admitted or a payment is recorded.')}
        emptyAction={addButton}
      />

      <WebhookFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} editing={editing} onCreated={setSecret} />
      <WebhookDeliveriesDrawer endpoint={logFor} onClose={() => setLogFor(null)} />
      <SecretRevealModal isOpen={!!secret} onClose={() => setSecret(null)} title={t('Signing secret')} label={t('Webhook signing secret')} secret={secret} />

      <ConfirmModal
        isOpen={!!rotating}
        title={t('Rotate signing secret?')}
        message={t('The old secret stops working immediately. Update your receiver with the new one.')}
        confirmLabel={t('Rotate')}
        variant="warning"
        isLoading={rotate.isPending}
        onCancel={() => setRotating(null)}
        onConfirm={async () => {
          if (!rotating) return;
          try {
            const r = await rotate.mutateAsync(rotating.id);
            setRotating(null);
            if (r.secret) setSecret(r.secret);
          } catch (err) {
            toast.error(errMsg(err, t('Could not rotate the secret')));
          }
        }}
      />

      <ConfirmModal
        isOpen={!!deleting}
        title={t('Delete webhook endpoint?')}
        message={t('The endpoint and its delivery log will be removed.')}
        confirmLabel={t('Delete')}
        variant="danger"
        isLoading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t('Webhook deleted'));
            setDeleting(null);
          } catch (err) {
            toast.error(errMsg(err, t('Could not delete the webhook')));
          }
        }}
      />
    </>
  );
};
