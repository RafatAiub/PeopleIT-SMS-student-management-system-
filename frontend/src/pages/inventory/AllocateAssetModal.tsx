import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Input, Select, Textarea } from '../../components/ui';
import { useT } from '../../i18n';
import { CONDITION_OPTIONS, errMsg, invApi, personName, useInvMutation, useStaffOptions, type Asset } from './inventory.api';

export const AllocateAssetModal: React.FC<{ asset: Asset | null; onClose: () => void }> = ({ asset, onClose }) => {
  const t = useT();
  const [target, setTarget] = useState<'user' | 'location'>('user');
  const [userId, setUserId] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const staff = useStaffOptions(!!asset);

  useEffect(() => {
    if (asset) { setTarget('user'); setUserId(''); setLocation(''); setNote(''); setError(''); }
  }, [asset]);

  const allocate = useInvMutation((body: Record<string, unknown>) => invApi.post(`/assets/${asset!.id}/allocate`, body));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (target === 'user' && !userId) return setError(t('Select a staff member'));
    if (target === 'location' && !location.trim()) return setError(t('Enter a location'));
    setError('');
    allocate.mutate(
      {
        allocatedToUserId: target === 'user' ? userId : null,
        allocatedToLocation: target === 'location' ? location.trim() : null,
        note: note.trim() || null,
      },
      {
        onSuccess: () => { toast.success(t('Asset allocated')); onClose(); },
        onError: (err) => toast.error(errMsg(err, t('Could not allocate asset'))),
      },
    );
  };

  return (
    <Modal
      isOpen={!!asset}
      onClose={onClose}
      title={t('Allocate asset')}
      description={asset ? `${asset.name} · ${asset.code}` : undefined}
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="allocate-form" variant="gradient" isLoading={allocate.isPending}>{t('Allocate')}</Button>
        </>
      }
    >
      <form id="allocate-form" onSubmit={submit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('Allocate to')}</legend>
          <div className="flex gap-2" role="radiogroup">
            {(['user', 'location'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={target === k}
                onClick={() => { setTarget(k); setError(''); }}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  target === k
                    ? 'border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                {k === 'user' ? t('Staff member') : t('Location')}
              </button>
            ))}
          </div>
        </fieldset>
        {target === 'user' ? (
          <Select
            label={t('Staff member')}
            required
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setError(''); }}
            error={error || (staff.isError ? t('Could not load staff list') : undefined)}
            placeholder={staff.isLoading ? t('Loading…') : t('Select a staff member')}
            options={(staff.data ?? []).map((u) => ({ value: u.id, label: `${personName(u)} (${u.role?.replace(/_/g, ' ').toLowerCase()})` }))}
          />
        ) : (
          <Input label={t('Location')} required value={location} onChange={(e) => { setLocation(e.target.value); setError(''); }} error={error} placeholder={t('e.g. Computer lab')} />
        )}
        <Textarea label={t('Note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Modal>
  );
};

export const ReturnAssetModal: React.FC<{ asset: Asset | null; onClose: () => void }> = ({ asset, onClose }) => {
  const t = useT();
  const [condition, setCondition] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (asset) { setCondition(asset.condition || ''); setNote(''); }
  }, [asset]);

  const ret = useInvMutation((body: Record<string, unknown>) => invApi.post(`/assets/${asset!.id}/return`, body));
  const holder = asset?.allocations?.[0];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    ret.mutate(
      { condition: condition || null, note: note.trim() || null },
      {
        onSuccess: () => { toast.success(t('Asset returned')); onClose(); },
        onError: (err) => toast.error(errMsg(err, t('Could not return asset'))),
      },
    );
  };

  return (
    <Modal
      isOpen={!!asset}
      onClose={onClose}
      title={t('Return asset')}
      description={
        asset
          ? `${asset.name} · ${holder ? (holder.allocatedToUser ? personName(holder.allocatedToUser) : holder.allocatedToLocation) : ''}`
          : undefined
      }
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" form="return-asset-form" variant="gradient" isLoading={ret.isPending}>{t('Mark returned')}</Button>
        </>
      }
    >
      <form id="return-asset-form" onSubmit={submit} className="space-y-4">
        <Select label={t('Condition on return')} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder={t('Unchanged')} options={CONDITION_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))} />
        <Textarea label={t('Note')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Modal>
  );
};
