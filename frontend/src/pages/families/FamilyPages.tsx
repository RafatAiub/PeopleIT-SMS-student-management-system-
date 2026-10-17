import React from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Search, Users, XCircle } from 'lucide-react';
import { Alert, Button, Card, ErrorState, Input, PageHeader, SkeletonText } from '@/components/ui';
import { EmptyState } from '@/components/common/EmptyState';
import { formatCurrency, formatNumber, useT } from '@/i18n';
import {
  apiErrorMessage, useDemoConfirm, useFamilies, useFamily, useFamilyPayment, useMyFamily,
} from './families.api';
import { FamilyProfileView } from './FamilyProfileView';
import { paymentBanner } from './family.logic';

// =============================================================================
// T3 family pages: /families (staff list), /families/:id (profile),
// /family/mine (guardian "My family"), /family/pay/demo (demo checkout).
// =============================================================================

/** /families/:id — staff, teachers (read-only) and the family's own guardians. */
export const FamilyPage: React.FC = () => {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const q = useFamily(id);
  return (
    <div className="space-y-6">
      <PageHeader title={t('Family profile')} breadcrumbs={[{ label: t('Families'), to: '/families' }, { label: q.data?.family.name ?? '…' }]} />
      {q.isLoading ? <SkeletonText lines={8} /> : q.isError || !q.data ? <ErrorState title={t('Could not load this family')} onRetry={() => q.refetch()} /> : <FamilyProfileView profile={q.data} />}
    </div>
  );
};

/** /families — staff list with search. */
export const FamiliesList: React.FC = () => {
  const t = useT();
  const [q, setQ] = React.useState('');
  const [term, setTerm] = React.useState('');
  const [page, setPage] = React.useState(1);
  React.useEffect(() => {
    const h = setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(h);
  }, [q]);
  const list = useFamilies({ q: term, page, pageSize: 24 });
  return (
    <div className="space-y-6">
      <PageHeader title={t('Families')} description={t('Siblings, guardians, combined fees and notes for each household.')} />
      <Input aria-label={t('Search families')} leftIcon={<Search className="w-4 h-4" />} placeholder={t('Search by guardian, phone, child or family name')} value={q} onChange={(e) => setQ(e.target.value)} />
      {list.isLoading ? <SkeletonText lines={6} /> : list.isError ? <ErrorState title={t('Could not load families')} onRetry={() => list.refetch()} /> : (list.data?.items ?? []).length === 0 ? (
        <EmptyState title={t('No families found')} description={t('Families are created automatically from guardian links.')} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {list.data!.items.map((f) => (
              <Link key={f.id} to={`/families/${f.id}`} className="block">
                <Card interactive className="h-full space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary-700 dark:text-primary-400" aria-hidden />
                    <h2 className="font-bold text-slate-900 dark:text-white truncate">{f.name}</h2>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{f.guardians.map((g) => `${g.guardian.firstName} ${g.guardian.lastName}`).join(', ') || t('No guardian')}</p>
                  <ul className="text-xs text-slate-500 space-y-0.5">
                    {f.students.map((s) => <li key={s.student.id} className="truncate">{s.student.firstName} {s.student.lastName} · {[s.student.class?.name, s.student.section?.name].filter(Boolean).join(' ')}</li>)}
                  </ul>
                  <p className="text-xs text-slate-500">{t('{n} children', { n: formatNumber(f._count.students) })}</p>
                </Card>
              </Link>
            ))}
          </div>
          {list.data!.total > 24 && (
            <div className="flex justify-between items-center text-sm">
              <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>{t('Previous')}</Button>
              <span>{formatNumber(page)} / {formatNumber(Math.ceil(list.data!.total / 24))}</span>
              <Button size="sm" variant="secondary" disabled={page * 24 >= list.data!.total} onClick={() => setPage((p) => p + 1)}>{t('Next')}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** /family/mine — guardian portal. Shows the gateway return result banner. */
export const MyFamily: React.FC = () => {
  const t = useT();
  const location = useLocation();
  const q = useMyFamily();
  const banner = paymentBanner(location.search);
  return (
    <div className="space-y-6">
      <PageHeader title={t('My family')} description={t('All your children, their attendance and fees — pay everything at once.')} />
      {banner === 'success' && <Alert tone="success" title={t('Payment received — thank you. Receipts are in each child’s fee history.')} />}
      {(banner === 'failed' || banner === 'cancelled') && <Alert tone="danger" title={t('The payment did not go through. No money was taken for unpaid invoices.')} />}
      {banner === 'pending' && <Alert tone="info" title={t('We are waiting for the payment gateway to confirm. Refresh in a minute.')} />}
      {q.isLoading ? <SkeletonText lines={8} /> : q.isError ? <ErrorState title={t('Could not load your family')} onRetry={() => q.refetch()} /> : !q.data ? (
        <EmptyState title={t('No family linked yet')} description={t('Ask the school office to link your children to your guardian account.')} />
      ) : <FamilyProfileView profile={q.data} />}
    </div>
  );
};

/** /family/pay/demo?payment=… — demo checkout (only when no real gateway is configured). */
export const FamilyDemoCheckout: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get('payment') ?? undefined;
  const q = useFamilyPayment(id);
  const confirm = useDemoConfirm();
  const act = (outcome: 'success' | 'failure') =>
    confirm.mutate({ paymentId: id as string, outcome }, {
      onSuccess: (r) => navigate(`/family/mine?payment=${r.status === 'SUCCESS' ? 'success' : 'failed'}`),
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not complete the demo payment'))),
    });
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <PageHeader title={t('Demo checkout')} />
      <Alert tone="warning" title={t('Demo mode: no real money will be charged. A real gateway is not configured yet.')} />
      {q.isLoading ? <SkeletonText lines={4} /> : q.isError || !q.data ? <ErrorState title={t('Payment not found')} /> : (
        <Card className="space-y-4">
          <p className="text-sm text-slate-500">{q.data.method} · {t('{n} invoices', { n: formatNumber(q.data.allocations.length) })}</p>
          <ul className="divide-y divide-slate-100 dark:divide-white/6 text-sm">
            {q.data.allocations.map((a) => <li key={a.invoiceId} className="flex justify-between py-2"><span>{a.studentName} · {a.invoiceNo}</span><span className="tabular-nums">{formatCurrency(a.amount)}</span></li>)}
          </ul>
          <p className="text-xl font-bold text-right tabular-nums">{formatCurrency(q.data.amount)}</p>
          {q.data.status === 'SUCCESS' ? <Button onClick={() => navigate('/family/mine?payment=success')}>{t('Back to my family')}</Button> : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => act('failure')} isLoading={confirm.isPending}>{t('Simulate failure')}</Button>
              <Button leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={() => act('success')} isLoading={confirm.isPending}>{t('Simulate success')}</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default FamilyPage;
