import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, Smartphone } from 'lucide-react';
import { Alert, Button, DescriptionList, Input, Modal, Tabs } from '@/components/ui';
import { useT, formatDate, formatNumber } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import {
  useCampaignConfig,
  useCreateCampaign,
  usePreviewAudience,
  useSendCampaign,
  useUpdateCampaign,
} from './campaigns.queries';
import ComposerMessageStep from './ComposerMessageStep';
import ComposerAudienceStep from './ComposerAudienceStep';
import { countSmsSegments } from './smsSegments';
import {
  CHANNEL_OPTIONS,
  EMPTY_AUDIENCE,
  type Audience,
  type CampaignChannel,
  type CampaignDetail,
  type GroupMemberUser,
} from './campaigns.types';

interface CampaignComposerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Present when editing an existing DRAFT/SCHEDULED campaign; absent when creating one. */
  campaign?: CampaignDetail | null;
}

type Step = 'channel' | 'message' | 'audience' | 'review';
const STEPS: Step[] = ['channel', 'message', 'audience', 'review'];

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignComposer({ isOpen, onClose, campaign }: CampaignComposerProps) {
  const t = useT();
  const { user } = useAuthStore();
  const isTeacher = user?.role === 'TEACHER';
  const isEditing = !!campaign;

  const { data: config } = useCampaignConfig();
  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign();
  const sendMutation = useSendCampaign();

  const [step, setStep] = useState<Step>('channel');
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [channel, setChannel] = useState<CampaignChannel>('SMS');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>(EMPTY_AUDIENCE);
  const [selectedUsers, setSelectedUsers] = useState<GroupMemberUser[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});

  useEffect(() => {
    if (!isOpen) return;
    setStep('channel');
    setErrors({});
    if (campaign) {
      setSavedId(campaign.id);
      setChannel(campaign.channel);
      setSubject(campaign.subject ?? '');
      setBody(campaign.body);
      setAudience(campaign.audience);
      // No endpoint resolves user names from a saved userId list — these stubs
      // keep the ids editable/removable without pretending we know their names.
      setSelectedUsers(campaign.audience.userIds.map((id) => ({ id, firstName: '', lastName: '', email: null, phone: null, role: '' })));
      setScheduledAt(isoToLocalInput(campaign.scheduledAt));
    } else {
      setSavedId(undefined);
      setChannel('SMS');
      setSubject('');
      setBody('');
      setAudience(EMPTY_AUDIENCE);
      setSelectedUsers([]);
      setScheduledAt('');
    }
  }, [isOpen, campaign]);

  const validate = () => {
    const next: { subject?: string; body?: string } = {};
    if (channel === 'EMAIL' && !subject.trim()) next.subject = t('Subject is required for email');
    if (!body.trim()) next.body = t('Message body is required');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const payload = useMemo(
    () => ({ channel, subject: channel === 'EMAIL' ? subject.trim() : null, body: body.trim(), audience }),
    [channel, subject, body, audience]
  );

  async function ensureSaved(): Promise<string> {
    if (savedId) {
      await updateMutation.mutateAsync({ id: savedId, data: payload });
      return savedId;
    }
    const created = await createMutation.mutateAsync(payload);
    setSavedId(created.id);
    return created.id;
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSending = sendMutation.isPending;

  const handleSaveDraft = async () => {
    if (!validate()) {
      setStep('message');
      return;
    }
    try {
      await ensureSaved();
      onClose();
    } catch {
      // Error toast already shown by the mutation.
    }
  };

  const handleSendNow = async () => {
    if (!validate()) {
      setStep('message');
      return;
    }
    try {
      const id = await ensureSaved();
      await sendMutation.mutateAsync({ id, scheduledAt: null });
      onClose();
    } catch {
      // Error toast already shown by the mutation.
    }
  };

  const handleSchedule = async () => {
    if (!validate()) {
      setStep('message');
      return;
    }
    if (!scheduledAt) return;
    try {
      const id = await ensureSaved();
      await sendMutation.mutateAsync({ id, scheduledAt: new Date(scheduledAt).toISOString() });
      onClose();
    } catch {
      // Error toast already shown by the mutation.
    }
  };

  const sms = channel === 'SMS' ? countSmsSegments(body) : null;
  const hasAnyAudience =
    audience.roles.length > 0 || audience.classIds.length > 0 || audience.sectionIds.length > 0 || audience.userIds.length > 0 || audience.groupIds.length > 0;
  const { data: reviewPreview } = usePreviewAudience({ channel, audience, body }, step === 'review' && hasAnyAudience);

  const tabs = STEPS.map((s) => ({
    id: s,
    label: { channel: t('Channel'), message: t('Message'), audience: t('Audience'), review: t('Review & send') }[s],
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? t('Edit campaign') : t('New campaign')}
      size="xl"
      footer={
        <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving || isSending}>
            {t('Cancel')}
          </Button>
          {step !== 'review' ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)])}
            >
              {t('Next')}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={handleSaveDraft} isLoading={isSaving && !isSending}>
                {t('Save draft')}
              </Button>
              <Button type="button" variant="gradient" leftIcon={<Send className="w-4 h-4" />} onClick={handleSendNow} isLoading={isSending || isSaving}>
                {t('Send now')}
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <Tabs tabs={tabs} value={step} onChange={(id) => setStep(id as Step)} label={t('Campaign composer steps')} />

        {step === 'channel' && (
          <div className="grid sm:grid-cols-3 gap-3">
            {CHANNEL_OPTIONS.map((opt) => {
              const selected = channel === opt.value;
              const demo = !!config?.demo[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChannel(opt.value)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    selected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                      : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                  }`}
                  aria-pressed={selected}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {opt.value === 'SMS' ? <Smartphone className="w-4 h-4" /> : opt.value === 'EMAIL' ? <MessageSquare className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    <span className="font-semibold text-sm text-slate-900 dark:text-slate-50">{opt.label}</span>
                    {demo && (
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 rounded">
                        {t('Demo')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{opt.helper}</p>
                </button>
              );
            })}
          </div>
        )}

        {step === 'message' && (
          <ComposerMessageStep
            channel={channel}
            subject={subject}
            body={body}
            onSubjectChange={setSubject}
            onBodyChange={setBody}
            config={config}
            subjectError={errors.subject}
            bodyError={errors.body}
          />
        )}

        {step === 'audience' && (
          <ComposerAudienceStep
            channel={channel}
            body={body}
            audience={audience}
            onChange={setAudience}
            isTeacher={isTeacher}
            selectedUsers={selectedUsers}
            onSelectedUsersChange={setSelectedUsers}
          />
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {config?.demo[channel] && (
              <Alert tone="warning" title={t('Demo mode')}>
                {t('SMS/Email provider not configured — recipients will be counted but nothing will really be sent.')}
              </Alert>
            )}
            <DescriptionList
              columns={2}
              items={[
                { label: t('Channel'), value: CHANNEL_OPTIONS.find((c) => c.value === channel)?.label },
                { label: t('Recipients'), value: formatNumber(reviewPreview?.total ?? 0) },
                ...(channel === 'EMAIL' ? [{ label: t('Subject'), value: subject || '—' }] : []),
                ...(sms ? [{ label: t('SMS segments'), value: `${formatNumber(sms.segments)} × ${formatNumber(reviewPreview?.total ?? 0)}` }] : []),
              ]}
            />
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('Message')}</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-white/8 p-3">
                {body || '—'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <Input
                type="datetime-local"
                label={t('Schedule for later (optional)')}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                helperText={t('Leave empty and use Send now to send immediately.')}
              />
              <Button type="button" variant="outline" onClick={handleSchedule} disabled={!scheduledAt} isLoading={isSending || isSaving}>
                {t('Schedule')}
              </Button>
            </div>
            {campaign?.scheduledAt && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('Currently scheduled for {date}', { date: formatDate(campaign.scheduledAt, true) })}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
