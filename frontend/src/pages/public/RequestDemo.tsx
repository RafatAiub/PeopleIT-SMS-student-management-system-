import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { User, Phone, Mail, Building2, MessageSquare, CheckCircle2, ArrowLeft, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { leadApi } from '../../api/lead.api';
import { LogoMark } from '../../components/common/LogoMark';
import { LanguageToggle } from './LanguageToggle';
import { useT } from '@/i18n';

const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;

const RequestDemo = () => {
  const t = useT();
  const [searchParams] = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    institutionName: '',
    institutionType: '',
    message: '',
    website: '', // honeypot — left blank and hidden from real users
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.phone.trim() || !PHONE_PATTERN.test(formData.phone.trim())) {
      errs.phone = 'Enter a valid phone number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateLimitMessage(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const utmSource = searchParams.get('utm_source');
      const utmCampaign = searchParams.get('utm_campaign');
      const source =
        utmSource || utmCampaign
          ? [utmSource, utmCampaign].filter(Boolean).join(' / ')
          : undefined;

      await leadApi.submit({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        institutionName: formData.institutionName.trim() || undefined,
        institutionType: formData.institutionType.trim() || undefined,
        message: formData.message.trim() || undefined,
        source,
        website: formData.website,
      });
      setSubmitted(true);
    } catch (err: any) {
      if (err.response?.status === 429) {
        // The rate limiter's own message is already a friendly, specific
        // sentence (see backend/src/app.ts leadCaptureLimiter) — keep it
        // visible inline rather than letting it disappear as a toast.
        setRateLimitMessage(err.response?.data?.message || 'Too many requests submitted. Please try again later.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to submit your request. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surface-900 flex items-center justify-center p-4 transition-colors duration-300">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-500/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <LanguageToggle />

      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center mb-8">
          <LogoMark className="w-14 h-14 mx-auto mb-4 shadow-lg" />
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
            {t('Request a Demo')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
            {t('Tell us how to reach you — our team will call you back shortly')}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 relative overflow-hidden animate-fadeIn">
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('Thank You!')}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                {t("We've received your request. Our team will reach out to")}{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formData.phone}</span>{' '}
                {t('shortly.')}
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline mt-2"
              >
                <ArrowLeft className="w-4 h-4" /> {t('Back to Login')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {rateLimitMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3.5 text-amber-800 dark:text-amber-300"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-xs font-medium leading-relaxed">{rateLimitMessage}</p>
                </div>
              )}

              {/* Honeypot — hidden from real users via CSS, a bot's autofill trips it */}
              <input
                type="text"
                name="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
                className="absolute -left-[9999px] w-px h-px opacity-0"
              />

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Your Name')} *</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('Your full name')}
                    className={`input-field pl-10 ${errors.name ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.name && <span className="text-xs text-red-500 mt-1 block">{t(errors.name)}</span>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Phone Number')} *</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+880..."
                    className={`input-field pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.phone && <span className="text-xs text-red-500 mt-1 block">{t(errors.phone)}</span>}
                <p className="text-[11px] text-slate-500 mt-1">{t("We'll call or text you here — no email needed.")}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Email (optional)')}</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="you@school.edu.bd"
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Institution Name (optional)')}</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.institutionName}
                    onChange={(e) => setFormData({ ...formData, institutionName: e.target.value })}
                    placeholder={t('e.g. Government Science College')}
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Institution Type (optional)')}</label>
                <input
                  type="text"
                  value={formData.institutionType}
                  onChange={(e) => setFormData({ ...formData, institutionType: e.target.value })}
                  placeholder={t('e.g. School, College, Coaching Center')}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Message (optional)')}</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder={t("Anything you'd like us to know?")}
                    rows={3}
                    className="input-field pl-10 resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? t('Submitting…') : t('Request a Callback')}
              </button>

              <p className="text-center">
                <Link to="/login" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  {t('Already have an account? Sign in')}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestDemo;
