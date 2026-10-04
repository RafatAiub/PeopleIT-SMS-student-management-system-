import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Save, Sparkles } from 'lucide-react';
import apiClient from '../../../api/client';
import { Alert, Button, Card, CardHeader, Input, Select, Textarea, AiGeneratedNotice } from '../../../components/ui';
import { useT } from '../../../i18n';
import { DemoAlert, ModeChip } from '../aiShared';
import { errorMessage, type AiMode } from '../aiUtils';

type Channel = 'SMS' | 'EMAIL' | 'NOTICE';

interface DraftResult extends AiMode {
  draft: { id: string };
  channel: Channel;
  subject: string | null;
  body: string;
  sms: { note: string } | null;
}

/** Client mirror of the backend SMS maths so the counter updates while editing. */
function smsCount(text: string) {
  // eslint-disable-next-line no-control-regex
  const gsm = /^[\u0000-\u007F£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà€]*$/.test(text);
  const len = text.length;
  if (gsm) return { len, enc: 'GSM-7', segments: len === 0 ? 0 : len <= 160 ? 1 : Math.ceil(len / 153) };
  return { len, enc: 'UCS-2', segments: len === 0 ? 0 : len <= 70 ? 1 : Math.ceil(len / 67) };
}

export default function ComposeTab() {
  const t = useT();
  const [channel, setChannel] = useState<Channel>('SMS');
  const [purpose, setPurpose] = useState('');
  const [audience, setAudience] = useState('Guardians');
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [tone, setTone] = useState<'formal' | 'friendly' | 'urgent'>('formal');
  const [details, setDetails] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const generate = useMutation({
    mutationFn: async (): Promise<DraftResult> =>
      (await apiClient.post('/ai/draft-message', { channel, purpose, audience, language, tone, details: details || undefined })).data.data,
    onError: (e) => toast.error(errorMessage(e, t('Could not draft the message.'))),
  });

  useEffect(() => {
    if (generate.data) {
      setSubject(generate.data.subject ?? '');
      setBody(generate.data.body);
    }
  }, [generate.data]);

  const save = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/ai/drafts/${generate.data!.draft.id}`, { content: generate.data!.channel !== 'SMS' && subject ? `Subject: ${subject}\n\n${body}` : body }),
    onSuccess: () => toast.success(t('Draft updated')),
    onError: (e) => toast.error(errorMessage(e, t('Could not save the draft.'))),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(subject && generate.data?.channel !== 'SMS' ? `${subject}\n\n${body}` : body);
      toast.success(t('Copied'));
    } catch {
      toast.error(t('Copy failed'));
    }
  };

  const count = smsCount(body);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader title={t('Message composer')} description={t('Describe what you need; the draft is saved to the review queue, never sent automatically.')} />
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            generate.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('Channel')} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}
              options={[{ value: 'SMS', label: 'SMS' }, { value: 'EMAIL', label: t('Email') }, { value: 'NOTICE', label: t('Notice') }]} />
            <Select label={t('Language')} value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'bn')}
              options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
          </div>
          <Input label={t('Purpose')} required minLength={3} maxLength={300} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('e.g. School closed on Thursday for Eid')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('Audience')} required minLength={2} maxLength={100} value={audience} onChange={(e) => setAudience(e.target.value)} />
            <Select label={t('Tone')} value={tone} onChange={(e) => setTone(e.target.value as 'formal' | 'friendly' | 'urgent')}
              options={[{ value: 'formal', label: t('Formal') }, { value: 'friendly', label: t('Friendly') }, { value: 'urgent', label: t('Urgent') }]} />
          </div>
          <Textarea label={t('Details (optional)')} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} helperText={t('Dates, times, amounts — only facts you type here will be used.')} />
          <Button type="submit" leftIcon={<Sparkles className="w-4 h-4" />} isLoading={generate.isPending} disabled={purpose.trim().length < 3}>
            {t('Generate draft')}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {!generate.data ? (
          <Card className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 min-h-40">
            {t('Your draft will appear here.')}
          </Card>
        ) : (
          <>
            <DemoAlert mode={generate.data} />
            <AiGeneratedNotice>
              <div className="space-y-3">
                {generate.data.channel !== 'SMS' && <Input label={t('Subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />}
                <Textarea label={t('Message')} rows={generate.data.channel === 'SMS' ? 4 : 10} value={body} onChange={(e) => setBody(e.target.value)} />
                {generate.data.channel === 'SMS' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('{n} characters · {enc} · {s} SMS segment(s)', { n: count.len, enc: count.enc, s: count.segments })} — {t('160 characters per SMS in English (153 when split), 70 in Bangla (67 when split).')}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" leftIcon={<Save className="w-4 h-4" />} isLoading={save.isPending} onClick={() => save.mutate()} disabled={!body.trim()}>
                    {t('Save edits to draft')}
                  </Button>
                  <Button size="sm" variant="ghost" leftIcon={<Copy className="w-4 h-4" />} onClick={copy}>{t('Copy')}</Button>
                  <ModeChip mode={generate.data} />
                </div>
              </div>
            </AiGeneratedNotice>
            <Alert tone="info">
              {t('Saved as a draft in the review queue. Approve it there, then send it with the Communication tools.')}{' '}
              <Link to="/ai/review" className="font-semibold underline">{t('Open review queue')}</Link>
            </Alert>
          </>
        )}
      </div>
    </div>
  );
}
