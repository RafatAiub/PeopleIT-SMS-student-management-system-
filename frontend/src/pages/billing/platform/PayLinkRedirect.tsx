import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { platformBillingApi } from '@/api/platformBilling.api';
import { Alert, Card, Skeleton } from '@/components/ui';
import { useT } from '@/i18n';

/**
 * P1: target of the pay link in reminder SMS/emails (/billing/pay/:token).
 * The route needs a signed-in school ADMIN (login comes first via
 * ProtectedRoute); the token is checked server-side against the school of the
 * session and only then opens that invoice on the Billing page.
 */
const PayLinkRedirect: React.FC = () => {
  const t = useT();
  const { token = '' } = useParams();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    platformBillingApi
      .resolvePayLink(token)
      .then((r) => alive && setTarget(`/billing?invoice=${encodeURIComponent(r.invoiceId)}`))
      .catch((err) => alive && setError(err?.response?.data?.message || t('This payment link is invalid or has expired — open Billing to pay')));
    return () => {
      alive = false;
    };
  }, [token, t]);

  if (target) return <Navigate to={target} replace />;
  return (
    <div className="max-w-md mx-auto pb-12">
      <Card className="p-6 space-y-4">
        {error ? (
          <>
            <Alert tone="warning" title={error} />
            <Link to="/billing" className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline">
              {t('Open Billing')}
            </Link>
          </>
        ) : (
          <Skeleton className="h-16" />
        )}
      </Card>
    </div>
  );
};

export default PayLinkRedirect;
