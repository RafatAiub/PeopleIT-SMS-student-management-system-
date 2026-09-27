import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, SearchCheck } from 'lucide-react';
import apiClient from '@/api/client';
import { Alert, Badge, Button, DescriptionList, Input, Select } from '@/components/ui';
import { LogoMark } from '@/components/common/LogoMark';
import { LanguageToggle } from '@/pages/public/LanguageToggle';
import { formatDate, useT } from '@/i18n';
import { APPLICATION_STATE_VARIANT, type ApplicationStatusResult } from './enquiries.types';
import { queryParam, usePublicInstitutions, useSchoolFromQuery } from './publicAdmissions';

/**
 * PUBLIC — an applicant checks their online application with the reference
 * they received plus a phone number on file. The API returns only the status
 * and class; any mismatch is the same "not found" answer.
 */
export default function ApplicationStatusPage() {
  const t = useT();
  const [school, setSchool] = useSchoolFromQuery();
  const { institutions, loading: schoolsLoading, error: schoolsError } = usePublicInstitutions();
  const [reference, setReference] = useState(() => queryParam('ref'));
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApplicationStatusResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!school) next.school = t('Please select your school');
    if (!reference.trim()) next.reference = t('Enter your application reference');
    if (phone.replace(/\D/g, '').length < 6) next.phone = t('Enter the phone number given on the application');
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setFailure(null);
    setResult(null);
    try {
      const res = await apiClient.get('/admissions-public/application-status', {
        params: { institutionSlug: school, reference: reference.trim(), phone: phone.trim() },
      });
      setResult(res.data.data);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 429) setFailure(t('Too many checks from this device. Please try again in a few minutes.'));
      else if (status === 404) setFailure(t('No application matches that reference and phone number. Check both and try again.'));
      else setFailure(t('Could not check the status right now. Please try again later.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surface-900 flex items-center justify-center p-4">
      <LanguageToggle />
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <LogoMark className="w-14 h-14 mx-auto mb-4 shadow-lg" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
            {t('Check application status')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            {t('Use the application reference you received and the guardian phone number you applied with.')}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!queryParam('school') && (
              <Select
                label={t('School')}
                required
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder={schoolsLoading ? t('Loading schools…') : t('Select a school')}
                options={institutions.map((i) => ({ value: i.slug, label: i.name }))}
                error={errors.school || (schoolsError ? t('Could not load the school list.') : undefined)}
              />
            )}
            <Input
              label={t('Application reference')}
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. 2026-0042"
              maxLength={60}
              error={errors.reference}
              autoComplete="off"
            />
            <Input
              label={t('Phone number')}
              required
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              maxLength={20}
              error={errors.phone}
            />
            <Button type="submit" fullWidth isLoading={submitting} leftIcon={<SearchCheck className="w-4 h-4" />}>
              {t('Check status')}
            </Button>
          </form>

          {failure && (
            <Alert tone="warning">
              {failure}
            </Alert>
          )}

          {result && (
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-3" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{result.institutionName}</span>
                <Badge variant={APPLICATION_STATE_VARIANT[result.state]}>{t(result.label)}</Badge>
              </div>
              <DescriptionList
                columns={2}
                items={[
                  { label: t('Reference'), value: result.reference },
                  { label: t('Class applied for'), value: result.className || '—' },
                  { label: t('Submitted'), value: formatDate(result.submittedAt) },
                  { label: t('Last updated'), value: formatDate(result.lastUpdatedAt) },
                ]}
              />
            </div>
          )}

          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> {t('Back to Login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
