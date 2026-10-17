import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Alert, Badge, Button, Input, Modal, PageHeader, Select } from '@/components/ui';
import { DataTable, type Column, type RowAction } from '@/components/DataTable/DataTable';
import { formatDate, formatNumber, useT } from '@/i18n';
import { useTrashAction, useTrashList, useTrashSummary, type TrashItem } from './trash.api';
import { TYPE_LABELS, TYPE_SINGULAR, daysLeftTone, summarizeBulk, typesWithItems, type TrashType } from './trash.logic';

/** Settings → Trash: everything deleted in the last 30 days. Restore, or delete permanently (ADMIN). */
export function TrashPanel() {
  const t = useT();
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [purgeIds, setPurgeIds] = useState<string[] | null>(null);
  const [typed, setTyped] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const summary = useTrashSummary();
  const list = useTrashList({ type: type || undefined, search: debounced || undefined, page, pageSize });
  const action = useTrashAction();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => setPage(1), [type, debounced]);

  const run = (kind: 'restore' | 'purge', ids: string[], after?: () => void) =>
    action.mutate(
      { action: kind, ids },
      {
        onSuccess: (results) => {
          const s = summarizeBulk(results);
          if (s.done) toast.success(kind === 'restore' ? t('Restored {n}', { n: formatNumber(s.done) }) : t('Deleted {n} permanently', { n: formatNumber(s.done) }));
          setProblems(s.reasons);
          if (s.failed && !s.reasons.length) toast.error(t('Some items could not be processed'));
          after?.();
        },
      },
    );

  const counts = summary.data?.counts ?? {};
  const typeOptions = typesWithItems(counts).map((k) => ({ value: k, label: `${t(TYPE_LABELS[k])} (${formatNumber(counts[k] ?? 0)})` }));

  const columns: Column<TrashItem>[] = [
    {
      key: 'label',
      header: t('Item'),
      primary: true,
      render: (r) => (
        <span className="flex flex-col">
          <span className="font-semibold text-slate-900 dark:text-slate-50 wrap-break-word">{r.label}</span>
          <span className="text-xs text-slate-600 dark:text-slate-400">{t(TYPE_SINGULAR[r.type as TrashType] ?? r.type)}</span>
        </span>
      ),
    },
    { key: 'deletedByName', header: t('Deleted by'), render: (r) => r.deletedByName ?? '—', hideOnMobile: true },
    { key: 'deletedAt', header: t('Deleted'), render: (r) => formatDate(r.deletedAt, true) },
    {
      key: 'daysLeft',
      header: t('Days left'),
      render: (r) =>
        r.purgeError ? (
          <span className="flex flex-col gap-0.5">
            <Badge variant="info">{t('Kept')}</Badge>
            <span className="text-xs text-slate-600 dark:text-slate-400">{r.purgeError}</span>
          </span>
        ) : (
          <Badge variant={daysLeftTone(r.daysLeft)}>{t('{n} days', { n: formatNumber(r.daysLeft) })}</Badge>
        ),
    },
  ];

  const actions: RowAction<TrashItem>[] = [
    { label: t('Restore'), icon: 'view', onClick: (r) => run('restore', [r.id]) },
    { label: t('Delete permanently'), icon: 'delete', variant: 'danger', onClick: (r) => setPurgeIds([r.id]) },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {t('Deleted items stay here for {days} days, then they are deleted permanently. Paid invoices and other money records are never deleted.', {
          days: formatNumber(summary.data?.retentionDays ?? 30),
        })}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Select
          aria-label={t('Filter by type')}
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-auto min-w-44"
          placeholder={`${t('Everything')} (${formatNumber(summary.data?.total ?? 0)})`}
          options={typeOptions}
        />
        <input type="search" aria-label={t('Search the trash')} placeholder={t('Search by name…')} value={search} onChange={(e) => setSearch(e.target.value)} className="input-field flex-1 min-w-40 max-w-xs" />
      </div>
      {problems.length > 0 && (
        <Alert tone="warning" title={t('Some items were not processed')}>
          <ul className="list-disc pl-4 space-y-0.5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      <DataTable
        data={list.data?.items ?? []}
        columns={columns}
        actions={actions}
        isLoading={list.isLoading}
        selectable
        bulkActions={(selected, clear) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} isLoading={action.isPending} onClick={() => run('restore', selected.map((s) => s.id), clear)}>
              {t('Restore {n}', { n: formatNumber(selected.length) })}
            </Button>
            <Button size="sm" variant="danger" leftIcon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setPurgeIds(selected.map((s) => s.id))}>
              {t('Delete {n} permanently', { n: formatNumber(selected.length) })}
            </Button>
          </div>
        )}
        serverPagination
        totalCount={list.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        emptyTitle={t('The trash is empty')}
        emptyDescription={t('Deleted students, staff, invoices, notices and more appear here for 30 days.')}
        caption={t('Trash')}
      />

      <Modal
        isOpen={!!purgeIds}
        onClose={() => setPurgeIds(null)}
        title={t('Delete permanently?')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPurgeIds(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={typed.trim() !== 'DELETE'}
              isLoading={action.isPending}
              onClick={() => {
                const ids = purgeIds ?? [];
                run('purge', ids, () => {
                  setPurgeIds(null);
                  setTyped('');
                });
              }}
            >
              {t('Delete permanently')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t('{n} items will be deleted for good. This cannot be undone. Items linked to fee or payroll records are kept.', { n: formatNumber(purgeIds?.length ?? 0) })}
          </p>
          <Input label={t('Type DELETE to confirm')} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
        </div>
      </Modal>
    </div>
  );
}

export default function TrashPage() {
  const t = useT();
  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title={t('Trash')} description={t('Restore deleted records within 30 days, or delete them permanently.')} />
      <div className="glass-card p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-white/5">
        <TrashPanel />
      </div>
    </div>
  );
}
