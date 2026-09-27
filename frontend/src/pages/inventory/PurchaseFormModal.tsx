import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Textarea, Checkbox } from '../../components/ui';
import { useT, formatCurrency } from '../../i18n';
import { errMsg, invApi, todayKey, useInvMutation, useStockItems } from './inventory.api';

interface Line {
  key: number;
  name: string;
  stockItemId: string;
  quantity: string;
  unitCost: string;
}

let seq = 0;
const newLine = (): Line => ({ key: ++seq, name: '', stockItemId: '', quantity: '1', unitCost: '' });

export const PurchaseFormModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const t = useT();
  const stock = useStockItems({ page: 1, pageSize: 100 });
  const [vendor, setVendor] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(todayKey());
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [override, setOverride] = useState('');
  const [note, setNote] = useState('');
  const [addToStock, setAddToStock] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setVendor(''); setInvoiceNo(''); setDate(todayKey()); setLines([newLine()]); setOverride(''); setNote(''); setAddToStock(true); setErrors({});
  }, [isOpen]);

  const computed = useMemo(
    () => lines.reduce((s, l) => s + Math.round((Number(l.unitCost) || 0) * 100) * (parseInt(l.quantity, 10) || 0), 0) / 100,
    [lines],
  );
  const linked = lines.filter((l) => l.stockItemId).length;

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useInvMutation((body: Record<string, unknown>) => invApi.post('/purchases', body));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!vendor.trim()) next.vendor = t('Vendor is required');
    if (!date) next.date = t('Date is required');
    lines.forEach((l) => {
      if (!l.name.trim()) next[`name-${l.key}`] = t('Required');
      if (!/^\d+$/.test(l.quantity) || parseInt(l.quantity, 10) < 1) next[`qty-${l.key}`] = t('Min 1');
      if (l.unitCost === '' || isNaN(Number(l.unitCost)) || Number(l.unitCost) < 0) next[`cost-${l.key}`] = t('Required');
    });
    if (override && (isNaN(Number(override)) || Number(override) < 0)) next.override = t('Enter a valid amount');
    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate(
      {
        vendor: vendor.trim(),
        invoiceNo: invoiceNo.trim() || null,
        date,
        items: lines.map((l) => ({ name: l.name.trim(), stockItemId: l.stockItemId || null, quantity: parseInt(l.quantity, 10), unitCost: Number(l.unitCost) })),
        totalAmount: override === '' ? null : Number(override),
        note: note.trim() || null,
        createStockMovements: addToStock && linked > 0,
      },
      {
        onSuccess: () => { toast.success(t('Purchase recorded')); onClose(); },
        onError: (err) => toast.error(errMsg(err, t('Could not record purchase'))),
      },
    );
  };

  const stockOptions = (stock.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.unit})` }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Record purchase')}
      size="xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="purchase-form" variant="gradient" isLoading={save.isPending}>{t('Save purchase')}</Button>
        </>
      }
    >
      <form id="purchase-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label={t('Vendor')} required value={vendor} onChange={(e) => setVendor(e.target.value)} error={errors.vendor} />
          <Input label={t('Invoice no.')} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          <Input label={t('Date')} type="date" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('Items')}</legend>
          {lines.map((l, idx) => (
            <div key={l.key} className="rounded-lg border border-slate-200 dark:border-white/10 p-3 grid grid-cols-2 sm:grid-cols-12 gap-2 items-start">
              <Input containerClassName="col-span-2 sm:col-span-4" label={t('Item')} required value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} error={errors[`name-${l.key}`]} />
              <Select
                containerClassName="col-span-2 sm:col-span-3"
                label={t('Link to stock')}
                value={l.stockItemId}
                onChange={(e) => {
                  const id = e.target.value;
                  const s = stock.data?.items.find((x) => x.id === id);
                  setLine(l.key, { stockItemId: id, ...(s && !l.name.trim() ? { name: s.name } : {}) });
                }}
                placeholder={t('Not linked')}
                options={stockOptions}
              />
              <Input containerClassName="sm:col-span-2" label={t('Qty')} type="number" min={1} step={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} error={errors[`qty-${l.key}`]} />
              <Input containerClassName="sm:col-span-2" label={t('Unit cost (৳)')} type="number" min={0} step="0.01" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: e.target.value })} error={errors[`cost-${l.key}`]} />
              <div className="col-span-2 sm:col-span-1 flex sm:justify-center sm:pt-6">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('Remove item {n}', { n: idx + 1 })}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setLines((ls) => [...ls, newLine()])} disabled={lines.length >= 200}>
            {t('Add item')}
          </Button>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="rounded-lg bg-slate-50 dark:bg-white/5 p-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('Items total')}</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{formatCurrency(computed)}</p>
          </div>
          <Input label={t('Invoice total (৳)')} type="number" min={0} step="0.01" value={override} onChange={(e) => setOverride(e.target.value)} error={errors.override} helperText={t('Optional — if it differs (VAT, delivery). Defaults to the items total.')} />
        </div>

        <Checkbox
          label={t('Add linked items to stock')}
          description={linked > 0 ? t('{n} linked line(s) will be recorded as stock IN movements.', { n: linked }) : t('Link a line to a stock item to add it to stock.')}
          checked={addToStock}
          disabled={linked === 0}
          onChange={(e) => setAddToStock(e.target.checked)}
        />
        <Textarea label={t('Note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Modal>
  );
};
