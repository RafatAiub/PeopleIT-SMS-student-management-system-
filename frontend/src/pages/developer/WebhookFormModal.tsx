import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Checkbox, ErrorState, Input, Modal } from '@/components/ui';
import { useT } from '@/i18n';
import { errMsg, useWebhookMeta, useWebhookMutation, webhookApi, type WebhookEndpoint } from './developer.api';

/** Client-side mirror of the backend URL policy (the server re-validates). */
function urlError(value: string, t: (k: string) => string): string | undefined {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return t('Enter a valid URL');
  }
  if (url.protocol !== 'https:') return t('Webhook URLs must use https://');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return t('Internal host names are not allowed');
  }
  return undefined;
}

export const WebhookFormModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  editing: WebhookEndpoint | null;
  onCreated: (secret: string) => void;
}> = ({ isOpen, onClose, editing, onCreated }) => {
  const t = useT();
  const meta = useWebhookMeta();
  const create = useWebhookMutation(webhookApi.create);
  const update = useWebhookMutation(webhookApi.update);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<{ url?: string; events?: string }>({});

  useEffect(() => {
    if (!isOpen) return;
    setUrl(editing?.url ?? '');
    setEvents(editing?.events ?? []);
    setIsActive(editing?.isActive ?? true);
    setErrors({});
  }, [isOpen, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = { url: urlError(url, t), events: events.length ? undefined : t('Subscribe to at least one event') };
    setErrors(next);
    if (next.url || next.events) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, url: url.trim(), events, isActive });
        toast.success(t('Webhook updated'));
        onClose();
      } else {
        const created = await create.mutateAsync({ url: url.trim(), events, isActive });
        onClose();
        if (created.secret) onCreated(created.secret);
      }
    } catch (err) {
      toast.error(errMsg(err, t('Could not save the webhook')));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? t('Edit webhook') : t('Add webhook endpoint')} size="lg">
      <form onSubmit={submit} className="space-y-4" id="webhook-form">
        <Input
          label={t('Endpoint URL')}
          placeholder="https://example.com/webhooks/peoplenit"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={errors.url}
          helperText={t('HTTPS only. Private, loopback and internal addresses are refused.')}
          required
        />
        <fieldset>
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('Events')}</legend>
          {meta.isError ? (
            <ErrorState compact message={t('Could not load events.')} onRetry={() => meta.refetch()} />
          ) : (
            <div className="space-y-2">
              {(meta.data?.events ?? []).map((ev) => (
                <Checkbox
                  key={ev.event}
                  label={<span className="font-mono text-sm">{ev.event}</span>}
                  description={t(ev.label)}
                  checked={events.includes(ev.event)}
                  onChange={(e) => setEvents((prev) => (e.target.checked ? [...prev, ev.event] : prev.filter((x) => x !== ev.event)))}
                />
              ))}
            </div>
          )}
          {errors.events && <p className="mt-1 text-xs text-red-600">{errors.events}</p>}
        </fieldset>
        <Checkbox label={t('Active')} description={t('Inactive endpoints receive no events.')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" isLoading={create.isPending || update.isPending}>
            {editing ? t('Save changes') : t('Add endpoint')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
