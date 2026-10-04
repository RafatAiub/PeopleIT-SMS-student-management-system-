import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Button, Checkbox, Input, Modal } from '../../components/ui';
import { useT } from '../../i18n';
import { useSaveScale, validateBandsClient, type GradeBand, type GradingScale } from './grading.queries';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Scale being edited; null = create. */
  scale: GradingScale | null;
}

type Row = { key: number; grade: string; minPercent: string; maxPercent: string; gradePoint: string; remark: string };

let keySeq = 0;
const toRow = (b?: GradeBand): Row => ({
  key: ++keySeq,
  grade: b?.grade ?? '',
  minPercent: b ? String(b.minPercent) : '',
  maxPercent: b ? String(b.maxPercent) : '',
  gradePoint: b ? String(b.gradePoint) : '',
  remark: b?.remark ?? '',
});

const toBand = (r: Row): GradeBand => ({
  grade: r.grade.trim(),
  minPercent: r.minPercent === '' ? NaN : Number(r.minPercent),
  maxPercent: r.maxPercent === '' ? NaN : Number(r.maxPercent),
  gradePoint: r.gradePoint === '' ? NaN : Number(r.gradePoint),
  remark: r.remark.trim() || null,
});

export const GradingScaleFormModal: React.FC<Props> = ({ isOpen, onClose, scale }) => {
  const t = useT();
  const save = useSaveScale();
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(scale?.name ?? '');
    setIsDefault(false);
    setRows(scale ? scale.bands.map(toRow) : [toRow()]);
    setSubmitted(false);
  }, [isOpen, scale]);

  const errors = useMemo(() => validateBandsClient(rows.map(toBand)), [rows]);
  const nameError = submitted && !name.trim() ? t('Scale name is required') : undefined;

  const update = (key: number, field: keyof Omit<Row, 'key'>, value: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || errors.length > 0) return;
    try {
      await save.mutateAsync({ id: scale?.id, payload: { name: name.trim(), isDefault, bands: rows.map(toBand) } });
      toast.success(scale ? t('Grading scale updated') : t('Grading scale created'));
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Failed to save grading scale'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={scale ? t('Edit grading scale') : t('New grading scale')}
      description={t('Bands must cover 0–100% without overlapping. A band with grade point 0 counts as a fail.')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form="grading-scale-form" isLoading={save.isPending}>
            {t('Save scale')}
          </Button>
        </>
      }
    >
      <form id="grading-scale-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label={t('Scale name')} value={name} onChange={(e) => setName(e.target.value)} error={nameError} required maxLength={100} />
        {!scale && (
          <Checkbox
            label={t('Make this the default scale')}
            description={t('Results, report cards and marksheets are graded with the default scale.')}
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
        )}

        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto] gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
            <span>{t('Grade')}</span>
            <span>{t('Min %')}</span>
            <span>{t('Max %')}</span>
            <span>{t('Grade point')}</span>
            <span>{t('Remark')}</span>
            <span className="w-8" />
          </div>
          {rows.map((r, i) => (
            <div
              key={r.key}
              className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto] gap-2 items-start rounded-lg border border-slate-200 dark:border-white/10 sm:border-0 p-2 sm:p-0"
            >
              <Input aria-label={t('Grade')} placeholder={t('Grade')} value={r.grade} onChange={(e) => update(r.key, 'grade', e.target.value)} maxLength={10} />
              <Input aria-label={t('Min %')} placeholder={t('Min %')} type="number" step="0.01" min={0} max={100} inputMode="decimal" value={r.minPercent} onChange={(e) => update(r.key, 'minPercent', e.target.value)} />
              <Input aria-label={t('Max %')} placeholder={t('Max %')} type="number" step="0.01" min={0} max={100} inputMode="decimal" value={r.maxPercent} onChange={(e) => update(r.key, 'maxPercent', e.target.value)} />
              <Input aria-label={t('Grade point')} placeholder={t('Grade point')} type="number" step="0.01" min={0} max={9.99} inputMode="decimal" value={r.gradePoint} onChange={(e) => update(r.key, 'gradePoint', e.target.value)} />
              <Input aria-label={t('Remark')} placeholder={t('Remark')} value={r.remark} onChange={(e) => update(r.key, 'remark', e.target.value)} maxLength={100} />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('Remove band {n}', { n: i + 1 })}
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                disabled={rows.length <= 1}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setRows((prev) => [...prev, toRow()])}>
            {t('Add band')}
          </Button>
        </div>

        {submitted && errors.length > 0 && (
          <Alert tone="danger" title={t('Fix the bands before saving')}>
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}
      </form>
    </Modal>
  );
};
