import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import apiClient from '@/api/client';
import { Alert, Button, Input, Select, Textarea } from '@/components/ui';
import { LogoMark } from '@/components/common/LogoMark';
import { LanguageToggle } from '@/pages/public/LanguageToggle';
import { useT } from '@/i18n';
import { queryParam, usePublicInstitutions, useSchoolFromQuery } from './publicAdmissions';

interface FormState {
  studentName: string;
  guardianName: string;
  phone: string;
  email: string;
  classInterested: string;
  message: string;
  /** Honeypot — hidden from people, bots fill it. Must stay empty. */
  website: string;
}

const EMPTY: FormState = { studentName: '', guardianName: '', phone: '', email: '', classInterested: '', message: '', website: '' };

/** PUBLIC — website admission enquiry form (lands as NEW in the school's enquiry CRM). */
export default function PublicEnquiryPage() {
  const t = useT();
  const [school, setSchool] = useSchoolFromQuery();
  const schoolFixed = !!queryParam('school');
  const { institutions, loading: schoolsLoading, error: schoolsError } = usePublicInstitutions();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setClasses([]);
    if (!school) return;
    apiClient
      .get('/student-applications/classes', { params: { institutionSlug: school } })
      .then((res) => setClasses(res.data.data || []))
      .catch(() => setClasses([]));
  }, [school]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!school) next.school = t('Please select a school');
    if (!form.studentName.trim()) next.studentName = t('Student name is required');
    if (!/^[+\d][\d\s-]{5,19}$/.test(form.phone.trim())) next.phone = t('Enter a valid phone number');
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = t('Enter a valid email address');
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    setFailure(null);
    try {
      await apiClient.post('/admissions-public/enquiries', {
        institutionSlug: school,
        studentName: form.studentName.trim(),
        guardianName: form.guardianName.trim() || undefined,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        classInterested: form.classInterested || undefined,
        message: form.message.trim() || undefined,
        website: form.website || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      if (err.response?.status === 429) setFailure(t('Too many enquiries from this device. Please try again later.'));
      else setFailure(err.response?.data?.message || t('Could not send your enquiry. Please try again.'));
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
            {t('Admission enquiry')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            {t('Leave your details and the school will contact you about admission.')}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8">
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" aria-hidden />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('Thank you!')}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('Your enquiry has been received. The school will contact you soon.')}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(EMPTY);
                  setSubmitted(false);
                }}
              >
                {t('Send another enquiry')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {failure && (
                <Alert tone="warning">
                  {failure}
                </Alert>
              )}
              {!schoolFixed && (
                <Select
                  label={t('School')}
                  required
                  value={school}
                  onChange={(e) => {
                    setSchool(e.target.value);
                    setForm((p) => ({ ...p, classInterested: '' }));
                  }}
                  placeholder={schoolsLoading ? t('Loading schools…') : t('Select a school')}
                  options={institutions.map((i) => ({ value: i.slug, label: i.name }))}
                  error={errors.school || (schoolsError ? t('Could not load the school list.') : undefined)}
                />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label={t('Student name')} required maxLength={150} value={form.studentName} onChange={set('studentName')} error={errors.studentName} />
                <Input label={t('Guardian name')} maxLength={150} value={form.guardianName} onChange={set('guardianName')} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={t('Phone')}
                  required
                  type="tel"
                  inputMode="tel"
                  maxLength={20}
                  placeholder="01XXXXXXXXX"
                  value={form.phone}
                  onChange={set('phone')}
                  error={errors.phone}
                />
                <Input label={t('Email')} type="email" maxLength={200} value={form.email} onChange={set('email')} error={errors.email} />
              </div>
              <Select
                label={t('Class interested in')}
                value={form.classInterested}
                onChange={set('classInterested')}
                disabled={!school}
                placeholder={t('-- Select Class --')}
                options={classes.map((c) => ({ value: c.name, label: c.name }))}
              />
              <Textarea label={t('Message (optional)')} rows={3} maxLength={1000} value={form.message} onChange={set('message')} />
              {/* Honeypot: visually hidden and skipped by keyboard/screen readers. */}
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label>
                  Website
                  <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </label>
              </div>
              <Button type="submit" fullWidth isLoading={submitting} leftIcon={<Send className="w-4 h-4" />}>
                {t('Send enquiry')}
              </Button>
            </form>
          )}
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline mt-5"
          >
            <ArrowLeft className="w-4 h-4" /> {t('Back to Login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
