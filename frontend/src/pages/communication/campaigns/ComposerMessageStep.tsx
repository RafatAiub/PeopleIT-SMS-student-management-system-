import React from 'react';
import { Alert, Input, Textarea } from '@/components/ui';
import { useT, formatNumber } from '@/i18n';
import { countSmsSegments } from './smsSegments';
import type { CampaignChannel, CampaignConfig } from './campaigns.types';

interface ComposerMessageStepProps {
  channel: CampaignChannel;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  config?: CampaignConfig;
  subjectError?: string;
  bodyError?: string;
}

export default function ComposerMessageStep({
  channel,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  config,
  subjectError,
  bodyError,
}: ComposerMessageStepProps) {
  const t = useT();
  const sms = channel === 'SMS' ? countSmsSegments(body) : null;
  const isDemo = !!config?.demo[channel];

  return (
    <div className="space-y-4 max-w-2xl">
      {isDemo && (
        <Alert tone="warning" title={t('Demo mode')}>
          {t('SMS/Email provider not configured — recipients will be counted but nothing will really be sent.')}
        </Alert>
      )}

      {channel === 'EMAIL' && (
        <Input
          label={t('Subject')}
          required
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          error={subjectError}
          maxLength={200}
          placeholder={t('e.g. Mid-term exam schedule')}
        />
      )}

      <Textarea
        label={t('Message')}
        required
        rows={8}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        error={bodyError}
        maxLength={5000}
        placeholder={t('Write the message body…')}
        helperText={t('You can use {{name}} and {{institution}} — they are replaced per recipient when the message is sent.')}
      />

      {channel === 'SMS' && sms && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {t('{length} chars · {segments} SMS · {encodingNote}', {
            length: formatNumber(sms.length),
            segments: formatNumber(sms.segments),
            encodingNote:
              sms.encoding === 'UNICODE'
                ? t('Bangla/Unicode: 70 per SMS')
                : t('GSM: 160 per SMS'),
          })}
        </p>
      )}
    </div>
  );
}
