import React, { useEffect, useState } from 'react';
import { Building } from 'lucide-react';
import toast from 'react-hot-toast';
import { Alert, Button, Card, CardHeader, ErrorState, Select, SkeletonText } from '@/components/ui';
import { useLocaleStore, useT, type DateFormat, type Lang, type Numerals } from '@/i18n';
import {
  apiErrorMessage,
  useInstitutionSettings,
  useUpdateInstitutionSettings,
  type InstitutionSettings,
} from '@/components/saas/saas.api';
import { CURRENCY_OPTIONS, DATE_FORMATS, LANGUAGE_OPTIONS, NUMERAL_OPTIONS, TIME_ZONES } from './localeOptions';

type Draft = Omit<InstitutionSettings, 'persisted'>;

/**
 * Institution-wide locale defaults (SUPER_ADMIN / ADMIN). Backend:
 * GET/PUT /institution/settings. Users without their own preference follow
 * these; currency applies to everyone.
 */
export const InstitutionDefaultsCard: React.FC<{ onSaved?: () => void }> = ({ onSaved }) => {
  const t = useT();
  const { data, isLoading, isError, refetch } = useInstitutionSettings();
  const update = useUpdateInstitutionSettings();
  const applyDefaults = useLocaleStore((s) => s.applyInstitutionDefaults);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (data) {
      setDraft({
        timezone: data.timezone,
        dateFormat: data.dateFormat,
        numeralSystem: data.numeralSystem,
        currency: data.currency,
        defaultLanguage: data.defaultLanguage,
      });
    }
  }, [data]);

  if (isLoading || (!draft && !isError)) {
    return (
      <Card>
        <SkeletonText lines={4} />
      </Card>
    );
  }
  if (isError || !data || !draft) {
    return (
      <Card>
        <ErrorState compact title={t('Could not load institution settings')} onRetry={() => refetch()} />
      </Card>
    );
  }

  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== data[k]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(draft, {
      onSuccess: (saved) => {
        toast.success(t('Institution defaults saved'));
        applyDefaults({
          lang: saved.defaultLanguage,
          numerals: saved.numeralSystem,
          timeZone: saved.timezone,
          dateFormat: saved.dateFormat,
          currency: saved.currency,
        });
        onSaved?.();
      },
      onError: (err) => toast.error(apiErrorMessage(err, t('Could not save institution settings.'))),
    });
  };

  return (
    <Card>
      <CardHeader
        icon={<Building className="w-5 h-5" />}
        title={t('Institution defaults')}
        description={t('Applied to everyone in your institution who hasn’t chosen their own language, numerals or date format. Currency applies to all users.')}
      />
      {!data.persisted && (
        <Alert tone="warning" className="mb-4">
          {t('Saving institution defaults becomes available after the latest database update is applied.')}
        </Alert>
      )}
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="inst-default-language"
            label={t('Default language')}
            value={draft.defaultLanguage}
            onChange={(e) => {
              const lang = e.target.value as Lang;
              // Mirror the personal setting: Bangla pairs with Bangla digits by default.
              setDraft({ ...draft, defaultLanguage: lang, numeralSystem: lang === 'bn' ? 'beng' : 'latn' });
            }}
            options={LANGUAGE_OPTIONS}
          />
          <Select
            id="inst-numerals"
            label={t('Numerals')}
            value={draft.numeralSystem}
            onChange={(e) => setDraft({ ...draft, numeralSystem: e.target.value as Numerals })}
            options={NUMERAL_OPTIONS}
          />
          <Select
            id="inst-date-format"
            label={t('Date format')}
            value={draft.dateFormat}
            onChange={(e) => setDraft({ ...draft, dateFormat: e.target.value as DateFormat })}
            options={DATE_FORMATS}
          />
          <Select
            id="inst-timezone"
            label={t('Time zone')}
            value={draft.timezone}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            options={
              TIME_ZONES.some((z) => z.value === draft.timezone)
                ? TIME_ZONES
                : [...TIME_ZONES, { value: draft.timezone, label: draft.timezone }]
            }
          />
          <Select
            id="inst-currency"
            label={t('Currency')}
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
            options={
              CURRENCY_OPTIONS.some((c) => c.value === draft.currency)
                ? CURRENCY_OPTIONS
                : [...CURRENCY_OPTIONS, { value: draft.currency, label: draft.currency }]
            }
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" isLoading={update.isPending} disabled={!dirty || !data.persisted}>
            {t('Save institution defaults')}
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default InstitutionDefaultsCard;
