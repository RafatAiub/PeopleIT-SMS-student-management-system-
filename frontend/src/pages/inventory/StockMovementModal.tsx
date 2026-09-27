import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Textarea, Alert } from '../../components/ui';
import { useT, formatNumber } from '../../i18n';
import { errMsg, invApi, useInvMutation, type MovementType, type StockItem } from './inventory.api';

type Mode = MovementType | 'COUNT';

/**
 * Records one stock movement. The preview mirrors the server rule
 * (inventory.logic.ts computeStockChange): stock never goes negative; the
 * server re-checks atomically, so a concurrent change can still reject it.
 */
export const StockMovementModal: React.FC<{ item: StockItem | null; onClose: () => void }> = ({ item, onClose }) => {
  const t = useT();
  const [mode, setMode] = useState<Mode>('IN');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (item) { setMode('IN'); setQty(''); setUnitCost(''); setReference(''); setNote(''); setError(''); }
  }, [item]);

  const current = item?.quantity ?? 0;
  const n = Number(qty);
  const valid = qty.trim() !== '' && Number.isInteger(n);

  const preview = useMemo(() => {
    if (!valid) return null;
    if (mode === 'IN') return n > 0 ? current + n : null;
    if (mode === 'OUT') return n > 0 ? current - n : null;
    if (mode === 'ADJUST') return n !== 0 ? current + n : null;
    return n >= 0 ? n : null;
  }, [mode, n, valid, current]);

  const move = useInvMutation((body: Record<string, unknown>) => invApi.post(`/stock/${item!.id}/movements`, body));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return setError(t('Enter a whole number'));
    if ((mode === 'IN' || mode === 'OUT') && n <= 0) return setError(t('Quantity must be at least 1'));
    if (mode === 'ADJUST' && n === 0) return setError(t('Adjustment cannot be zero'));
    if (mode === 'COUNT' && n < 0) return setError(t('Counted quantity cannot be negative'));
    if (mode === 'COUNT' && n === current) return setError(t('Counted quantity equals the current stock'));
    if (preview !== null && preview < 0) return setError(t('Only {n} in stock — stock cannot go negative', { n: current }));
    if (unitCost && (isNaN(Number(unitCost)) || Number(unitCost) < 0)) return setError(t('Enter a valid unit cost'));
    setError('');

    const body: Record<string, unknown> =
      mode === 'COUNT'
        ? { type: 'ADJUST', countedQuantity: n }
        : { type: mode, quantity: n, ...(mode === 'IN' && unitCost !== '' ? { unitCost: Number(unitCost) } : {}) };
    body.reference = reference.trim() || null;
    body.note = note.trim() || null;

    move.mutate(body, {
      onSuccess: () => { toast.success(t('Stock movement recorded')); onClose(); },
      onError: (err) => toast.error(errMsg(err, t('Could not record movement'))),
    });
  };

  const MODES: { id: Mode; label: string }[] = [
    { id: 'IN', label: t('Stock in') },
    { id: 'OUT', label: t('Stock out') },
    { id: 'ADJUST', label: t('Adjust ±') },
    { id: 'COUNT', label: t('Stock-take') },
  ];

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      title={t('Record stock movement')}
      description={item ? t('{name} — {n} {unit} in stock', { name: item.name, n: formatNumber(current), unit: item.unit }) : undefined}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="stock-move-form" variant="gradient" isLoading={move.isPending}>{t('Save movement')}</Button>
        </>
      }
    >
      <form id="stock-move-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label={t('Movement type')}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => { setMode(m.id); setError(''); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === m.id
                  ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                  : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={mode === 'COUNT' ? t('Counted quantity') : mode === 'ADJUST' ? t('Change (+/−)') : t('Quantity')}
            type="number"
            step={1}
            required
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(''); }}
            error={error}
            helperText={mode === 'ADJUST' ? t('Use a negative number for damaged or missing units') : undefined}
          />
          {mode === 'IN' && (
            <Input label={t('Unit cost (৳)')} type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} helperText={t('Optional — used for valuation')} />
          )}
        </div>
        {preview !== null && (
          <Alert tone={preview < 0 ? 'danger' : 'info'}>
            {preview < 0
              ? t('Only {n} in stock — stock cannot go negative', { n: current })
              : t('New quantity will be {n} {unit}', { n: formatNumber(preview), unit: item?.unit ?? '' })}
          </Alert>
        )}
        <Input label={t('Reference')} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('e.g. Issue slip #, class, requisition')} />
        <Textarea label={t('Note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Modal>
  );
};
