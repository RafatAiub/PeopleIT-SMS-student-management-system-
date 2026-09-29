import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, Save, RotateCcw } from 'lucide-react';
import { Button, Input, Textarea, Skeleton, ErrorState, Alert, Badge } from '@/components/ui';
import {
  useNotificationTemplates,
  useUpsertNotificationTemplate,
  NOTIFICATION_TYPE_GROUPS,
} from '../settings.queries';

// =============================================================================
// Per-school EMAIL template overrides. Only the EMAIL channel is shown here —
// IN_APP/SMS copy is edited on the Notifications tab's own future surface;
// this tab exists specifically for Track A (school-facing email wording).
// =============================================================================

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  NOTIFICATION_TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t.type, t.label])),
);

const EmailTemplatesTab: React.FC = () => {
  const { data, isLoading, isError, refetch } = useNotificationTemplates();
  const upsert = useUpsertNotificationTemplate();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const emailTemplates = useMemo(() => (data ?? []).filter((t) => t.channel === 'EMAIL'), [data]);
  const selected = emailTemplates.find((t) => t.key === selectedKey) ?? null;

  const select = (key: string) => {
    const row = emailTemplates.find((t) => t.key === key);
    if (!row) return;
    setSelectedKey(key);
    setSubject(row.subject ?? '');
    setBody(row.body);
  };

  const save = () => {
    if (!selectedKey) return;
    upsert.mutate(
      { key: selectedKey, channel: 'EMAIL', subject, body },
      {
        onSuccess: () => toast.success('Template saved — used for every future email of this type'),
        onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to save template'),
      },
    );
  };

  const resetToDefault = () => {
    if (!selected) return;
    setSubject('');
    toast('Clearing the subject/body and saving restores the platform wording on next edit — leave blank and save, or just avoid saving to keep your override.', { icon: 'ℹ️' });
  };

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) return <ErrorState title="Couldn't load email templates" onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        These control the EMAIL wording for automated notices (invoices, fee reminders, leave approvals, etc.) sent to
        your users. The layout, logo and colours are applied automatically — only the subject and message text are
        edited here. Use <code>{'{{studentName}}'}</code>-style placeholders as shown in the default text.
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-1 max-h-[480px] overflow-y-auto pr-1">
          {emailTemplates.map((t) => (
            <button
              key={t.key}
              onClick={() => select(t.key)}
              className={`w-full text-left p-2.5 rounded-lg text-sm flex items-center justify-between gap-2 ${
                selectedKey === t.key ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <span className="truncate">{TYPE_LABELS[t.key] ?? t.key}</span>
              {t.source === 'tenant' ? <Badge variant="info">Custom</Badge> : <Badge variant="neutral">Default</Badge>}
            </button>
          ))}
        </div>

        <div className="md:col-span-2">
          {!selected ? (
            <p className="text-sm text-slate-500 flex items-center gap-2"><Mail className="w-4 h-4" /> Select a notification type to edit its email wording.</p>
          ) : (
            <div className="space-y-3">
              <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Leave blank to use the platform default" />
              <Textarea label="Message body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={save} isLoading={upsert.isPending}><Save className="w-4 h-4" /> Save</Button>
                <Button variant="secondary" onClick={resetToDefault}><RotateCcw className="w-4 h-4" /> Clear override</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailTemplatesTab;
