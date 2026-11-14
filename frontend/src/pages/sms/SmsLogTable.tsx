import React from 'react';
import { Badge, Button, Card, ErrorState, Input, Select, SkeletonText, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { formatDate, formatNumber } from '@/i18n';
import { useSmsT } from './sms.i18n';
import { useSmsLog, type LogFilters } from './sms.api';
import { isInsufficient, PROVIDER_LABEL, purposeLabel, STATUS_LABEL, STATUS_VARIANT, type SmsStatus } from './sms.logic';

// Shared SMS log (school ADMIN: own school with message text; super-admin:
// every school, masked numbers, no text).

export const SmsLogTable: React.FC<{ filters: LogFilters; onChange: (f: LogFilters) => void; admin?: boolean }> = ({ filters, onChange, admin = false }) => {
  const t = useSmsT();
  const q = useSmsLog(filters, admin);
  const set = (patch: Partial<LogFilters>) => onChange({ ...filters, ...patch, page: patch.page ?? 1 });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.meta.total / q.data.meta.pageSize)) : 1;
  const page = filters.page ?? 1;

  return (
    <Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Select
          label={t('Status')}
          value={filters.status ?? ''}
          onChange={(e) => set({ status: e.target.value || undefined })}
          options={[{ value: '', label: t('All') }, ...(Object.keys(STATUS_LABEL) as SmsStatus[]).map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))]}
        />
        <Select
          label={t('Type')}
          value={filters.purpose ?? ''}
          onChange={(e) => set({ purpose: e.target.value || undefined })}
          options={[{ value: '', label: t('All') }, ...['FEE_REMINDER', 'ABSENCE_ALERT', 'CAMPAIGN', 'DEFAULTER', 'DONATION_REMINDER', ...(admin ? ['PLATFORM_BILLING'] : [])].map((p) => ({ value: p, label: t(purposeLabel(p)) }))]}
        />
        <Input label={t('Phone contains')} inputMode="numeric" value={filters.search ?? ''} onChange={(e) => set({ search: e.target.value || undefined })} />
        <Input type="date" label={t('From')} value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <Input type="date" label={t('To')} value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
      </div>

      {q.isLoading ? (
        <SkeletonText lines={6} className="mt-4" />
      ) : q.isError || !q.data ? (
        <ErrorState className="mt-4" title={t('Could not load the SMS log')} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{t('{n} messages', { n: formatNumber(q.data.meta.total) })}</p>
          <div className="overflow-x-auto mt-2">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>{t('Time')}</TableHeaderCell>
                  {admin && <TableHeaderCell>{t('School')}</TableHeaderCell>}
                  <TableHeaderCell>{t('To')}</TableHeaderCell>
                  <TableHeaderCell>{t('Type')}</TableHeaderCell>
                  <TableHeaderCell>{t('Status')}</TableHeaderCell>
                  <TableHeaderCell className="text-right">{t('Credits')}</TableHeaderCell>
                  <TableHeaderCell>{t('Provider')}</TableHeaderCell>
                  <TableHeaderCell>{admin ? t('Reason') : t('Message')}</TableHeaderCell>
                </tr>
              </TableHead>
              <tbody>
                {q.data.data.length === 0 ? (
                  <tr><TableCell colSpan={admin ? 8 : 7} className="text-center text-slate-500">{t('No messages match these filters')}</TableCell></tr>
                ) : q.data.data.map((r, i) => (
                  <TableRow key={r.id} index={i}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.createdAt, true)}</TableCell>
                    {admin && <TableCell>{r.institutionName ?? <span className="text-slate-500">{t('PeopleNIT')}</span>}</TableCell>}
                    <TableCell className="tabular-nums whitespace-nowrap">{r.to}</TableCell>
                    <TableCell>{t(purposeLabel(r.purpose))}{r.billing === 'PLATFORM' && <span className="block text-xs text-slate-500 dark:text-slate-400">{t('Not charged')}</span>}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]} dot>{isInsufficient(r.error) ? t('No credits') : t(STATUS_LABEL[r.status])}</Badge>
                      {r.refundedAt && <span className="block text-xs text-slate-500 dark:text-slate-400">{t('Refunded')}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.costUnits)}{r.freeUnits ? <span className="block text-xs text-slate-500 dark:text-slate-400">+{formatNumber(r.freeUnits)} {t('free')}</span> : null}<span className="block text-xs text-slate-500 dark:text-slate-400">{t('{n} part(s)', { n: formatNumber(r.segments) })}</span></TableCell>
                    <TableCell>{r.provider ? PROVIDER_LABEL[r.provider] : '—'}{r.senderId && <span className="block text-xs text-slate-500 dark:text-slate-400">{r.senderId}</span>}</TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-300 min-w-56 max-w-md">
                      {!admin && r.body && <span className="block break-words">{r.body}</span>}
                      {r.error && r.status !== 'SENT' && r.status !== 'DELIVERED' && <span className="block text-xs text-red-700 dark:text-red-300 break-words">{r.error}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-3">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange({ ...filters, page: page - 1 })}>{t('Previous')}</Button>
              <span className="text-sm tabular-nums">{page} / {pages}</span>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange({ ...filters, page: page + 1 })}>{t('Next')}</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
