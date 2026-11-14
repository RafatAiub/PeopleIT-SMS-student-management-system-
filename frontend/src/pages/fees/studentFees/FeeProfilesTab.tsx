import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import apiClient from '../../../api/client';
import { Badge, Button, Card, Checkbox, Input, Modal, Select, Skeleton } from '../../../components/ui';
import { formatCurrency, useLocale, useT } from '../../../i18n';
import { useClassOptions, useSectionOptions } from '../feeExtras.queries';
import { useFeeProfileList, type FeeProfile } from './studentFees.api';
import { FeeProfileForm } from './FeeProfileForm';
import { monthLabel } from './studentFees.logic';

/** Fees → Custom fees: every student with a custom rate, plus bulk set. */
export const FeeProfilesTab: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const t = useT();
  const { lang } = useLocale();
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { data: classes } = useClassOptions(true);
  const { data, isLoading } = useFeeProfileList({ page, pageSize: 20, search: search.trim() || undefined, classId: classId || undefined });
  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  const amount = (p: FeeProfile) =>
    p.kind === 'YEARLY' ? `${formatCurrency(p.yearlyAmount)} / ${t('year')}` : `${formatCurrency(p.monthlyAmount)} / ${t('month')}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <Input label={t('Search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('Name or student ID')} containerClassName="sm:w-64" />
        <Select
          label={t('Class')}
          value={classId}
          onChange={(e) => { setClassId(e.target.value); setPage(1); }}
          options={[{ value: '', label: t('All classes') }, ...(classes ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          containerClassName="sm:w-48"
        />
        {canEdit && (
          <Button className="sm:ml-auto" leftIcon={<Users className="w-4 h-4" />} onClick={() => setBulkOpen(true)}>
            {t('Bulk set custom fee')}
          </Button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <Skeleton className="h-40 m-4" />
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{t('No student has a custom fee yet. Set one from the student profile (Fees tab) or with Bulk set.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {items.map((p) => (
              <li key={p.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {p.student ? `${p.student.firstName} ${p.student.lastName}` : '—'}{' '}
                    <span className="text-xs text-slate-500">
                      {p.student?.studentId} · {p.student?.className ?? '—'}{p.student?.sectionName ? ` (${p.student.sectionName})` : ''}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.categoryName ?? t('Whole monthly fee')} · {amount(p)} · {monthLabel(p.effectiveFrom, lang)} → {p.effectiveTo ? monthLabel(p.effectiveTo, lang) : t('no end')} · {p.reason}
                  </p>
                </div>
                <Badge variant={p.status === 'ACTIVE' ? 'success' : 'info'}>{t(p.status === 'ACTIVE' ? 'Active' : 'Upcoming')}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {total > 20 && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</Button>
          <Button size="sm" variant="secondary" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>{t('Next')}</Button>
        </div>
      )}
      {canEdit && <BulkSetModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} />}
    </div>
  );
};

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  rollNumber?: string | null;
}

/** Pick a class/section, tick students, then set one rate for all of them. */
const BulkSetModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const t = useT();
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const { data: classes } = useClassOptions(isOpen);
  const { data: sections } = useSectionOptions(classId || null);
  const { data: students, isLoading } = useQuery({
    queryKey: ['p2-bulk-students', classId, sectionId],
    queryFn: async (): Promise<StudentRow[]> => {
      const { data } = await apiClient.get('/students', { params: { classId, ...(sectionId ? { sectionId } : {}), status: 'ACTIVE', pageSize: 500, page: 1 } });
      return data.data || [];
    },
    enabled: isOpen && !!classId,
  });
  useEffect(() => setSelected(new Set((students ?? []).map((s) => s.id))), [students]);
  const ids = useMemo(() => [...selected], [selected]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <Modal
        isOpen={isOpen && !formOpen}
        onClose={onClose}
        title={t('Bulk set custom fee')}
        size="lg"
        footer={
          <div className="flex justify-between items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">{t('{n} selected', { n: ids.length })}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
              <Button disabled={ids.length === 0} onClick={() => setFormOpen(true)}>{t('Next')}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label={t('Class')} value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }} options={[{ value: '', label: t('Choose a class') }, ...(classes ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            <Select label={t('Section')} value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId} options={[{ value: '', label: t('All sections') }, ...(sections ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
          </div>
          {classId && (
            isLoading ? <Skeleton className="h-32" /> : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
                <div className="px-3 py-2 flex gap-3 text-xs">
                  <button type="button" className="text-primary-700 dark:text-primary-300 hover:underline" onClick={() => setSelected(new Set((students ?? []).map((s) => s.id)))}>{t('Select all')}</button>
                  <button type="button" className="text-primary-700 dark:text-primary-300 hover:underline" onClick={() => setSelected(new Set())}>{t('Clear')}</button>
                </div>
                {(students ?? []).map((s) => (
                  <Checkbox key={s.id} className="px-3 py-2" checked={selected.has(s.id)} onChange={() => toggle(s.id)} label={`${s.rollNumber ? `${s.rollNumber}. ` : ''}${s.firstName} ${s.lastName} · ${s.studentId}`} />
                ))}
                {(students ?? []).length === 0 && <p className="px-3 py-2 text-sm text-slate-500">{t('No active students here.')}</p>}
              </div>
            )
          )}
        </div>
      </Modal>
      <FeeProfileForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        studentIds={ids}
        title={t('Custom fee for {n} student(s)', { n: ids.length })}
        onSaved={onClose}
      />
    </>
  );
};
