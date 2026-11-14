import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Alert, Button, Card, CardHeader, ErrorState, PageHeader, SkeletonText } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/i18n';
import { useSmsT } from './sms.i18n';
import { errorMessage, useDemoConfirm, usePurchase } from './sms.api';

// P5 demo checkout — only reachable when the gateway has no keys and demo
// payments are allowed (never in production unless explicitly enabled).

const SmsDemoCheckout: React.FC = () => {
  const t = useSmsT();
  const [params] = useSearchParams();
  const id = params.get('purchase') ?? undefined;
  const navigate = useNavigate();
  const q = usePurchase(id);
  const confirm = useDemoConfirm();

  const run = (outcome: 'success' | 'failure') =>
    confirm.mutate(
      { id: id!, outcome },
      {
        onSuccess: (r) => navigate(`/sms?purchase=${r.status === 'SUCCESS' ? 'success' : 'failed'}&pid=${encodeURIComponent(id!)}`),
        onError: (e) => toast.error(errorMessage(e, t('Could not complete the demo payment'))),
      },
    );

  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader title={t('Demo checkout')} breadcrumbs={[{ label: t('SMS credits'), to: '/sms' }, { label: t('Demo checkout') }]} />
      {q.isLoading ? (
        <SkeletonText lines={4} />
      ) : q.isError || !q.data ? (
        <ErrorState title={t('Purchase not found')} />
      ) : (
        <Card>
          <CardHeader title={t('{n} SMS credits', { n: formatNumber(q.data.units) })} description={formatCurrency(q.data.amount)} />
          <Alert tone="warning" className="mt-4" title={t('Demo mode — no real money moves')}>{t('The payment gateway has no live keys on this server. Use this page to test the flow.')}</Alert>
          {q.data.status === 'SUCCESS' ? (
            <p className="mt-4 text-sm">{t('Already paid.')} <Link className="underline" to={`/sms/receipt/${q.data.id}`}>{t('View receipt')}</Link></p>
          ) : q.data.demoAllowed ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button isLoading={confirm.isPending && confirm.variables?.outcome === 'success'} onClick={() => run('success')}>{t('Simulate successful payment')}</Button>
              <Button variant="secondary" isLoading={confirm.isPending && confirm.variables?.outcome === 'failure'} onClick={() => run('failure')}>{t('Simulate failure')}</Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{t('Demo payments are disabled.')}</p>
          )}
        </Card>
      )}
    </div>
  );
};

export default SmsDemoCheckout;
