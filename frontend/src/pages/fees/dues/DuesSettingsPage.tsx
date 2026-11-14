import React from 'react';
import toast from 'react-hot-toast';
import { Alert, Button, Card, CardHeader, Checkbox, ErrorState, Input, PageHeader, SkeletonText, Textarea } from '@/components/ui';
import { useT } from '@/i18n';
import { countSmsSegments } from '@/pages/communication/campaigns/smsSegments';
import { apiErrorMessage, useDuesSettings, useSaveDuesSettings, type DuesSettings } from './dues.api';
import { PLACEHOLDERS, sampleRender, unknownPlaceholders } from './dues.logic';

// =============================================================================
// Settings → Fees → Dues restrictions (route /fees/dues/settings). Exported as
// a panel too, so it can be embedded in a Settings → Fees tab.
// =============================================================================

interface Form {
  restrictionsEnabled: boolean;
  minMonthsDue: string;
  minAmountDue: string;
  overdueDays: string;
  blockResults: boolean;
  blockAdmitCard: boolean;
  blockIdCard: boolean;
  blockPortalLogin: boolean;
  blockOnlineExam: boolean;
  restrictionMessage: string;
  smsTemplate: string;
  emailSubject: string;
  emailTemplate: string;
}

const toForm = (s: DuesSettings): Form => ({
  restrictionsEnabled: s.restrictionsEnabled,
  minMonthsDue: s.minMonthsDue?.toString() ?? '',
  minAmountDue: s.minAmountDueTaka?.toString() ?? '',
  overdueDays: s.overdueDays?.toString() ?? '',
  blockResults: s.blockResults,
  blockAdmitCard: s.blockAdmitCard,
  blockIdCard: s.blockIdCard,
  blockPortalLogin: s.blockPortalLogin,
  blockOnlineExam: s.blockOnlineExam,
  restrictionMessage: s.restrictionMessage ?? '',
  smsTemplate: s.smsTemplate,
  emailSubject: s.emailSubject,
  emailTemplate: s.emailTemplate,
});

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export const DuesSettingsPanel: React.FC = () => {
  const t = useT();
  const q = useDuesSettings();
  const save = useSaveDuesSettings();
  const [f, setF] = React.useState<Form | null>(null);
  React.useEffect(() => {
    if (q.data && !f) setF(toForm(q.data));
  }, [q.data, f]);

  if (q.isLoading || (!f && !q.isError)) return <SkeletonText lines={8} />;
  if (q.isError || !f) return <ErrorState title={t('Could not load settings')} onRetry={() => q.refetch()} />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const noThreshold = f.restrictionsEnabled && !num(f.minMonthsDue) && !num(f.minAmountDue) && !num(f.overdueDays);
  const seg = countSmsSegments(sampleRender(f.smsTemplate, 'School'));
  const unknown = unknownPlaceholders(`${f.smsTemplate} ${f.emailSubject} ${f.emailTemplate}`);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await save.mutateAsync({
        restrictionsEnabled: f.restrictionsEnabled,
        minMonthsDue: num(f.minMonthsDue),
        minAmountDue: num(f.minAmountDue),
        overdueDays: num(f.overdueDays),
        blockResults: f.blockResults,
        blockAdmitCard: f.blockAdmitCard,
        blockIdCard: f.blockIdCard,
        blockPortalLogin: f.blockPortalLogin,
        blockOnlineExam: f.blockOnlineExam,
        restrictionMessage: f.restrictionMessage.trim() || null,
        smsTemplate: f.smsTemplate.trim() || null,
        emailSubject: f.emailSubject.trim() || null,
        emailTemplate: f.emailTemplate.trim() || null,
      });
      setF(toForm(saved));
      toast.success(t('Saved'));
    } catch (err) {
      toast.error(apiErrorMessage(err, t('Could not save')));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader title={t('Restrict students who have not paid')} description={t('Staff are never restricted. Each student can be blocked, unblocked or exempted by hand from Fees → Dues.')} />
        <div className="space-y-4">
          <Checkbox label={t('Turn on automatic restrictions')} description={t('A student is restricted when ANY of the limits below is reached.')} checked={f.restrictionsEnabled} onChange={(e) => set('restrictionsEnabled', e.target.checked)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input id="dr-months" type="number" min={1} max={60} inputMode="numeric" label={t('Dues in at least (months)')} value={f.minMonthsDue} onChange={(e) => set('minMonthsDue', e.target.value)} />
            <Input id="dr-amount" type="number" min={1} inputMode="decimal" label={t('Dues of at least (৳)')} value={f.minAmountDue} onChange={(e) => set('minAmountDue', e.target.value)} />
            <Input id="dr-days" type="number" min={1} max={3650} inputMode="numeric" label={t('An invoice overdue by more than (days)')} value={f.overdueDays} onChange={(e) => set('overdueDays', e.target.value)} />
          </div>
          {noThreshold && <Alert tone="warning">{t('Set at least one limit — with none, nobody is restricted automatically.')}</Alert>}
          <fieldset className="space-y-2">
            <legend className="font-semibold text-sm mb-1">{t('What a restricted student cannot do')}</legend>
            <Checkbox label={t('View or download results and report cards')} checked={f.blockResults} onChange={(e) => set('blockResults', e.target.checked)} />
            <Checkbox label={t('Download the admit card')} checked={f.blockAdmitCard} onChange={(e) => set('blockAdmitCard', e.target.checked)} />
            <Checkbox label={t('View or download the ID card')} checked={f.blockIdCard} onChange={(e) => set('blockIdCard', e.target.checked)} />
            <Checkbox label={t('Online exams')} checked={f.blockOnlineExam} onChange={(e) => set('blockOnlineExam', e.target.checked)} />
            <Checkbox
              label={t('Sign in to the student / guardian portal')}
              description={t('Guardians cannot pay online while signed out. A guardian is blocked only when every child is restricted.')}
              checked={f.blockPortalLogin}
              onChange={(e) => set('blockPortalLogin', e.target.checked)}
            />
          </fieldset>
          <Input id="dr-msg" label={t('Extra note on the “Fees due” screen (optional)')} placeholder={t('e.g. Office open Sat–Thu, 9am–2pm')} maxLength={300} value={f.restrictionMessage} onChange={(e) => set('restrictionMessage', e.target.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader title={t('Default reminder message')} description={`${t('Placeholders')}: ${PLACEHOLDERS.join(' ')}`} />
        <div className="space-y-3">
          <Textarea id="dr-sms" label={t('SMS text')} rows={3} maxLength={1000} value={f.smsTemplate} onChange={(e) => set('smsTemplate', e.target.value)}
            helperText={t('About {n} characters · {s} SMS per guardian', { n: seg.length, s: seg.segments })} />
          <Input id="dr-subj" label={t('Email subject')} maxLength={200} value={f.emailSubject} onChange={(e) => set('emailSubject', e.target.value)} />
          <Textarea id="dr-email" label={t('Email text')} rows={6} maxLength={5000} value={f.emailTemplate} onChange={(e) => set('emailTemplate', e.target.value)} />
          {unknown.length > 0 && <Alert tone="warning">{t('Unknown placeholders will be sent as typed: {list}', { list: unknown.join(', ') })}</Alert>}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" isLoading={save.isPending}>{t('Save')}</Button>
      </div>
    </form>
  );
};

const DuesSettingsPage: React.FC = () => {
  const t = useT();
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader title={t('Dues restrictions')} breadcrumbs={[{ label: t('Fees'), to: '/fees' }, { label: t('Dues'), to: '/fees/dues' }, { label: t('Settings') }]} />
      <DuesSettingsPanel />
    </div>
  );
};

export default DuesSettingsPage;
