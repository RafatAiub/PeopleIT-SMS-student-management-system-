import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Input, Modal, Select } from '@/components/ui';
import { formatNumber, useT } from '@/i18n';
import { useSaveStages, useStages } from './crm.api';
import { moveItem, removedWithEnquiries, stageSetProblem, type StageDraft } from './crm.logic';

const STATUS_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'VISITED', label: 'Visited' },
  { value: 'APPLIED', label: 'Applied' },
];

let seq = 0;
const newKey = () => `new-${Date.now()}-${seq++}`;

/** ADMIN editor for the school's pipeline: rename (EN/BN), colour, order, won/lost, add and remove stages. */
export default function PipelineSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useT();
  const { data: stages = [] } = useStages();
  const save = useSaveStages();
  const [original, setOriginal] = useState<StageDraft[]>([]);
  const [draft, setDraft] = useState<StageDraft[]>([]);
  const [reassign, setReassign] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const rows = stages.map((s) => ({ id: s.id, key: s.id, name: s.name, nameBn: s.nameBn ?? '', color: s.color, isWon: s.isWon, isLost: s.isLost, status: s.status, enquiryCount: s.enquiryCount }));
    setOriginal(rows);
    setDraft(rows);
    setReassign({});
  }, [isOpen, stages]);

  const update = (i: number, patch: Partial<StageDraft>) => setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const problem = stageSetProblem(draft);
  const removed = removedWithEnquiries(original, draft);
  const keptWithId = draft.filter((d) => d.id);
  const missingTarget = removed.some((r) => !reassign[r.id!]);

  const submit = () => {
    if (problem || missingTarget) return;
    save.mutate(
      {
        stages: draft.map((s) => ({
          ...(s.id ? { id: s.id } : {}),
          name: s.name.trim(),
          nameBn: s.nameBn.trim() || null,
          color: s.color,
          isWon: s.isWon,
          isLost: s.isLost,
          ...(!s.isWon && !s.isLost && s.status && ['NEW', 'CONTACTED', 'VISITED', 'APPLIED'].includes(s.status) ? { status: s.status } : {}),
        })),
        reassign: Object.keys(reassign).length ? reassign : undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Pipeline stages')}
      description={t('Rename, reorder, colour and add stages. Mark which stage means admitted (won) and which means lost.')}
      size="2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" isLoading={save.isPending} disabled={!!problem || missingTarget} onClick={submit}>
            {t('Save pipeline')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {problem && <Alert tone="warning">{t(problem)}</Alert>}
        <ol className="space-y-3">
          {draft.map((s, i) => (
            <li key={s.key} className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-2 border-l-4" style={{ borderLeftColor: s.color }}>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <Input label={t('Name (English)')} value={s.name} maxLength={60} onChange={(e) => update(i, { name: e.target.value })} />
                <Input label={t('Name (Bangla)')} value={s.nameBn} maxLength={60} lang="bn" onChange={(e) => update(i, { nameBn: e.target.value })} />
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('Colour')}
                  <input type="color" value={s.color} onChange={(e) => update(i, { color: e.target.value })} className="block mt-1 h-9 w-14 rounded-md border border-slate-300 dark:border-white/12 bg-transparent" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="w-4 h-4 accent-primary-600" checked={s.isWon} onChange={(e) => update(i, { isWon: e.target.checked, isLost: e.target.checked ? false : s.isLost })} />
                  {t('Admitted (won)')}
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="w-4 h-4 accent-primary-600" checked={s.isLost} onChange={(e) => update(i, { isLost: e.target.checked, isWon: e.target.checked ? false : s.isWon })} />
                  {t('Lost')}
                </label>
                {!s.isWon && !s.isLost && (
                  <Select
                    aria-label={t('Counts as (for older reports)')}
                    value={s.status && STATUS_OPTIONS.some((o) => o.value === s.status) ? s.status : ''}
                    onChange={(e) => update(i, { status: e.target.value || undefined })}
                    containerClassName="w-44"
                    placeholder={t('Counts as: automatic')}
                    options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: `${t('Counts as')}: ${t(o.label)}` }))}
                  />
                )}
                <span className="text-xs text-slate-600 dark:text-slate-400">{t('{n} enquiries', { n: formatNumber(s.enquiryCount) })}</span>
                <span className="ml-auto flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={t('Move up')} disabled={i === 0} onClick={() => setDraft((d) => moveItem(d, i, i - 1))}>
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t('Move down')} disabled={i === draft.length - 1} onClick={() => setDraft((d) => moveItem(d, i, i + 1))}>
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={t('Remove stage')} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => {
            const firstClosed = draft.findIndex((d) => d.isWon || d.isLost);
            const at = firstClosed < 0 ? draft.length : firstClosed;
            const row: StageDraft = { key: newKey(), name: '', nameBn: '', color: '#0d9488', isWon: false, isLost: false, enquiryCount: 0 };
            setDraft((d) => [...d.slice(0, at), row, ...d.slice(at)]);
          }}
        >
          {t('Add stage')}
        </Button>

        {removed.length > 0 && (
          <Alert tone="warning" title={t('Where should their enquiries go?')}>
            <div className="space-y-2 mt-1">
              {removed.map((r) => (
                <Select
                  key={r.id}
                  label={t('{n} enquiries in "{stage}" move to', { n: formatNumber(r.enquiryCount), stage: r.name })}
                  value={reassign[r.id!] ?? ''}
                  onChange={(e) => setReassign((m) => ({ ...m, [r.id!]: e.target.value }))}
                  placeholder={t('Choose a stage')}
                  options={keptWithId.map((k) => ({ value: k.id!, label: k.name }))}
                />
              ))}
            </div>
          </Alert>
        )}
      </div>
    </Modal>
  );
}
