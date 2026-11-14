import React from 'react';
import toast from 'react-hot-toast';
import { Alert, Button, Checkbox, Input, Modal, Textarea } from '@/components/ui';
import { formatNumber, useT } from '@/i18n';
import { countSmsSegments } from '@/pages/communication/campaigns/smsSegments';
import { apiErrorMessage, getBatch, previewReminders, sendReminders, useDuesSettings, type DefaulterParams, type ReminderBody, type ReminderPreview } from './dues.api';
import { PLACEHOLDERS, sampleRender, unknownPlaceholders } from './dues.logic';

// =============================================================================
// Reminder composer: editable SMS/email template with placeholders, live SMS
// segment count, a server preview (recipients, segments, total messages) and
// send. Large sends run in the background; this dialog polls the batch.
// =============================================================================

export type ReminderTarget =
  | { kind: 'ids'; ids: string[]; label: string }
  | { kind: 'filter'; filter: Omit<DefaulterParams, 'page' | 'pageSize'>; label: string };

const BN_SMS = 'সম্মানিত অভিভাবক, {student}-এর {months} মাসের বকেয়া ফি {amount} টাকা। অনুগ্রহ করে দ্রুত পরিশোধ করুন। - {school}';

export const ReminderModal: React.FC<{ target: ReminderTarget; onClose: () => void; onDone: () => void }> = ({ target, onClose, onDone }) => {
  const t = useT();
  const settings = useDuesSettings();
  const [sms, setSms] = React.useState(true);
  const [email, setEmail] = React.useState(false);
  const [smsTemplate, setSmsTemplate] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailTemplate, setEmailTemplate] = React.useState('');
  const [preview, setPreview] = React.useState<ReminderPreview | null>(null);
  const [busy, setBusy] = React.useState<'preview' | 'send' | null>(null);
  const [progress, setProgress] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (settings.data && !smsTemplate) {
      setSmsTemplate(settings.data.smsTemplate);
      setEmailSubject(settings.data.emailSubject);
      setEmailTemplate(settings.data.emailTemplate);
    }
  }, [settings.data, smsTemplate]);

  const channels = [sms && 'SMS', email && 'EMAIL'].filter(Boolean) as Array<'SMS' | 'EMAIL'>;
  const body: ReminderBody = {
    ...(target.kind === 'ids' ? { studentIds: target.ids } : { filter: target.filter }),
    channels,
    smsTemplate,
    emailSubject,
    emailTemplate,
  };
  const seg = countSmsSegments(sampleRender(smsTemplate, 'School'));
  const unknown = unknownPlaceholders(`${smsTemplate} ${emailSubject} ${emailTemplate}`);

  // Any edit invalidates the preview.
  React.useEffect(() => setPreview(null), [sms, email, smsTemplate, emailSubject, emailTemplate]);

  const doPreview = async () => {
    setBusy('preview');
    try {
      setPreview(await previewReminders(body));
    } catch (e) {
      toast.error(apiErrorMessage(e, t('Could not build the preview')));
    } finally {
      setBusy(null);
    }
  };

  const doSend = async () => {
    if (!preview) return;
    setBusy('send');
    try {
      const res = await sendReminders(body);
      if (res.done) {
        report(res.sms, res.email);
        onDone();
        onClose();
        return;
      }
      const expected = (preview.sms?.messages ?? 0) + (preview.sms?.noPhone ?? 0) + (preview.email?.messages ?? 0) + (preview.email?.noEmail ?? 0);
      let last = -1;
      let still = 0;
      for (;;) {
        await new Promise((r) => setTimeout(r, 2000));
        const b = await getBatch(res.batchId);
        setProgress(t('{a} of {b} messages processed…', { a: formatNumber(b.attempted), b: formatNumber(expected) }));
        if (b.attempted >= expected) {
          report(b.sms, b.email);
          break;
        }
        still = b.attempted === last ? still + 1 : 0;
        last = b.attempted;
        if (still > 30) {
          toast(t('Still sending in the background — check “Last reminded” later.'));
          break;
        }
      }
      onDone();
      onClose();
    } catch (e) {
      toast.error(apiErrorMessage(e, t('Could not send reminders')));
    } finally {
      setBusy(null);
    }
  };

  const report = (s?: { sent: number; skipped: number; failed: number }, m?: { sent: number; skipped: number; failed: number }) => {
    const parts: string[] = [];
    if (sms && s) parts.push(t('SMS: {s} sent, {k} skipped, {f} failed', { s: s.sent, k: s.skipped, f: s.failed }));
    if (email && m) parts.push(t('Email: {s} sent, {k} skipped, {f} failed', { s: m.sent, k: m.skipped, f: m.failed }));
    const anyFailed = (s?.failed ?? 0) + (m?.failed ?? 0) > 0;
    const noneSent = (s?.sent ?? 0) + (m?.sent ?? 0) === 0;
    (anyFailed || noneSent ? toast : toast.success)(parts.join(' · '), { duration: 8000 });
  };

  return (
    <Modal
      isOpen
      onClose={busy === 'send' ? () => undefined : onClose}
      size="lg"
      title={t('Send fee reminder')}
      description={t('To the guardians of {who}', { who: target.label })}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy === 'send'}>{t('Cancel')}</Button>
          <Button variant="outline" onClick={doPreview} isLoading={busy === 'preview'} disabled={!channels.length || busy === 'send'}>{t('Preview')}</Button>
          <Button onClick={doSend} isLoading={busy === 'send'} disabled={!preview || preview.totalMessages === 0 || !!busy}>
            {preview ? t('Send {n} messages', { n: formatNumber(preview.totalMessages) }) : t('Send')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <fieldset className="flex flex-wrap gap-4">
          <legend className="sr-only">{t('Channels')}</legend>
          <Checkbox label={t('SMS to guardian')} checked={sms} onChange={(e) => setSms(e.target.checked)} />
          <Checkbox label={t('Email to guardian')} checked={email} onChange={(e) => setEmail(e.target.checked)} />
        </fieldset>
        <p className="text-xs text-slate-500">{t('Placeholders')}: {PLACEHOLDERS.join(' ')}</p>
        {sms && (
          <div>
            <Textarea id="rem-sms" label={t('SMS text')} rows={3} maxLength={1000} value={smsTemplate} onChange={(e) => setSmsTemplate(e.target.value)} />
            <div className="flex flex-wrap justify-between gap-2 mt-1 text-xs text-slate-600 dark:text-slate-300">
              <span>
                {t('About {n} characters · {s} SMS per guardian', { n: seg.length, s: seg.segments })} · {seg.encoding === 'UNICODE' ? t('Bangla/Unicode: 70 characters per SMS') : t('English: 160 characters per SMS')}
              </span>
              <span className="flex gap-2">
                <button type="button" className="underline" onClick={() => setSmsTemplate(BN_SMS)}>{t('Use Bangla text')}</button>
                {settings.data && <button type="button" className="underline" onClick={() => setSmsTemplate(settings.data!.smsTemplate)}>{t('Reset')}</button>}
              </span>
            </div>
          </div>
        )}
        {email && (
          <div className="space-y-2">
            <Input id="rem-subject" label={t('Email subject')} maxLength={200} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            <Textarea id="rem-email" label={t('Email text')} rows={5} maxLength={5000} value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)} />
          </div>
        )}
        {unknown.length > 0 && <Alert tone="warning">{t('Unknown placeholders will be sent as typed: {list}', { list: unknown.join(', ') })}</Alert>}

        {preview && (
          <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2" role="status">
            <p className="font-semibold">{t('{n} students with dues', { n: formatNumber(preview.students) })} · {t('{n} messages in total', { n: formatNumber(preview.totalMessages) })}</p>
            {preview.sms && (
              <p>
                {t('SMS: {m} messages, {s} segments (credits)', { m: formatNumber(preview.sms.messages), s: formatNumber(preview.sms.segments) })}
                {preview.sms.noPhone > 0 && <> · <span className="text-amber-700 dark:text-amber-300">{t('{n} without a valid mobile number', { n: preview.sms.noPhone })}</span></>}
              </p>
            )}
            {preview.email && (
              <p>
                {t('Email: {m} messages', { m: formatNumber(preview.email.messages) })}
                {preview.email.noEmail > 0 && <> · <span className="text-amber-700 dark:text-amber-300">{t('{n} without an email address', { n: preview.email.noEmail })}</span></>}
              </p>
            )}
            {preview.samples[0] && (
              <div className="text-xs bg-slate-50 dark:bg-white/5 rounded p-2 space-y-1">
                <div className="font-semibold">{t('Example')} — {preview.samples[0].student}{preview.samples[0].phone ? ` · ${preview.samples[0].phone}` : ''}</div>
                {sms && <p className="whitespace-pre-line">{preview.samples[0].sms}</p>}
                {email && <p className="whitespace-pre-line text-slate-600 dark:text-slate-300">{preview.samples[0].emailSubject}</p>}
              </div>
            )}
            {preview.totalMessages === 0 && <Alert tone="warning">{t('Nothing to send — no guardian contact details found.')}</Alert>}
          </div>
        )}
        {progress && <p role="status" className="text-xs">{progress}</p>}
        <p className="text-xs text-slate-500">{t('If SMS or email is not set up on the server, messages are logged as skipped — nothing is shown as sent unless the provider accepted it.')}</p>
      </div>
    </Modal>
  );
};
