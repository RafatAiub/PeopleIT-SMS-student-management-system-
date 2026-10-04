import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, User, Mail, Phone, CheckCircle2, ArrowLeft, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { studentApplicationApi } from '../../api/studentApplication.api';
import { LogoMark } from '../../components/common/LogoMark';
import { LanguageToggle } from './LanguageToggle';
import { useT } from '@/i18n';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateName = (name: string, fieldName: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return `${fieldName} is required`;
  if (trimmed.length > 100) return `${fieldName} must not exceed 100 characters`;
  if (!/^[a-zA-Z\s\-']*$/.test(trimmed)) {
    return `${fieldName} should only contain letters, spaces, hyphens, and apostrophes`;
  }
  return null;
};

const StudentRegistration = () => {
  const t = useT();
  const [institutions, setInstitutions] = useState<{ name: string; slug: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    institutionSlug: '',
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'MALE',
    classId: '',
    guardianFirstName: '',
    guardianLastName: '',
    guardianEmail: '',
    guardianPhone: '',
  });

  useEffect(() => {
    apiClient
      .get('/institution/public/list')
      .then((res) => setInstitutions(res.data.data || []))
      .catch((err) => console.error('Failed to load institutions', err));
  }, []);

  useEffect(() => {
    if (!formData.institutionSlug) {
      setClasses([]);
      return;
    }
    studentApplicationApi
      .listPublicClasses(formData.institutionSlug)
      .then(setClasses)
      .catch((err) => console.error('Failed to load classes', err));
  }, [formData.institutionSlug]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.institutionSlug) errs.institutionSlug = 'Please select a school';

    const firstNameError = validateName(formData.firstName, 'First name');
    if (firstNameError) errs.firstName = firstNameError;

    const lastNameError = validateName(formData.lastName, 'Last name');
    if (lastNameError) errs.lastName = lastNameError;

    const guardianFirstNameError = validateName(formData.guardianFirstName, 'Guardian first name');
    if (guardianFirstNameError) errs.guardianFirstName = guardianFirstNameError;

    const guardianLastNameError = validateName(formData.guardianLastName, 'Guardian last name');
    if (guardianLastNameError) errs.guardianLastName = guardianLastNameError;

    if (!formData.guardianEmail.trim() || !EMAIL_PATTERN.test(formData.guardianEmail.trim())) {
      errs.guardianEmail = 'Please enter a valid email address';
    }
    if (!formData.guardianPhone.trim()) {
      errs.guardianPhone = 'Guardian mobile is required';
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
      await studentApplicationApi.submit({
        institutionSlug: formData.institutionSlug,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender as 'MALE' | 'FEMALE' | 'OTHER',
        classId: formData.classId || undefined,
        guardianFirstName: formData.guardianFirstName.trim(),
        guardianLastName: formData.guardianLastName.trim(),
        guardianEmail: formData.guardianEmail.trim().toLowerCase(),
        guardianPhone: formData.guardianPhone.trim(),
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error('Failed to submit application', err);
      if (err.response?.status === 429) {
        // The rate limiter's own message is already a friendly, specific
        // sentence (see backend/src/app.ts studentApplicationLimiter) — keep
        // it visible inline rather than letting it disappear as a toast.
        setRateLimitMessage(err.response?.data?.message || 'Too many applications submitted. Please try again later.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to submit application');
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

      <div className="relative z-10 w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center mb-8">
          <LogoMark className="w-14 h-14 mx-auto mb-4 shadow-lg" />
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
            {t('Online Student Registration')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
            {t('Apply for admission — the school will review your application')}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 relative overflow-hidden animate-fadeIn">
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('Application Submitted!')}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                {t('Thank you. The school will review the application and contact')}{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formData.guardianEmail}</span>{' '}
                {t("with login details once it's approved.")}
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

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('School')} *</label>
                <div className="relative">
                  <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    value={formData.institutionSlug}
                    onChange={(e) => setFormData({ ...formData, institutionSlug: e.target.value, classId: '' })}
                    className={`input-field pl-10 ${errors.institutionSlug ? 'border-red-500' : ''}`}
                  >
                    <option value="">{t('Select a school')}</option>
                    {institutions.map((inst) => (
                      <option key={inst.slug} value={inst.slug}>{inst.name}</option>
                    ))}
                  </select>
                </div>
                {errors.institutionSlug && <span className="text-xs text-red-500 mt-1 block">{t(errors.institutionSlug)}</span>}
              </div>

              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">
                {t('Student Details')}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('First Name')} *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder={t('First Name')}
                      className={`input-field pl-10 ${errors.firstName ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.firstName && <span className="text-xs text-red-500 mt-1 block">{t(errors.firstName)}</span>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Last Name')} *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder={t('Last Name')}
                    className={`input-field ${errors.lastName ? 'border-red-500' : ''}`}
                  />
                  {errors.lastName && <span className="text-xs text-red-500 mt-1 block">{t(errors.lastName)}</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Date of Birth')}</label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Gender')}</label>
                  <div className="flex items-center gap-4 h-10">
                    {(['MALE', 'FEMALE'] as const).map((g) => (
                      <label key={g} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          checked={formData.gender === g}
                          onChange={() => setFormData({ ...formData, gender: g })}
                          className="w-4 h-4 accent-primary-500 cursor-pointer"
                        />
                        {t(g.charAt(0) + g.slice(1).toLowerCase())}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Applying for Class')}</label>
                <select
                  value={formData.classId}
                  onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                  disabled={!formData.institutionSlug}
                  className="input-field disabled:opacity-50"
                >
                  <option value="">{t('-- Select Class --')}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">
                {t('Guardian Details')}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Guardian First Name')} *</label>
                  <input
                    type="text"
                    value={formData.guardianFirstName}
                    onChange={(e) => setFormData({ ...formData, guardianFirstName: e.target.value })}
                    placeholder={t('Guardian First Name')}
                    className={`input-field ${errors.guardianFirstName ? 'border-red-500' : ''}`}
                  />
                  {errors.guardianFirstName && <span className="text-xs text-red-500 mt-1 block">{t(errors.guardianFirstName)}</span>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Guardian Last Name')} *</label>
                  <input
                    type="text"
                    value={formData.guardianLastName}
                    onChange={(e) => setFormData({ ...formData, guardianLastName: e.target.value })}
                    placeholder={t('Guardian Last Name')}
                    className={`input-field ${errors.guardianLastName ? 'border-red-500' : ''}`}
                  />
                  {errors.guardianLastName && <span className="text-xs text-red-500 mt-1 block">{t(errors.guardianLastName)}</span>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Guardian Email')} *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={formData.guardianEmail}
                    onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                    placeholder="you@example.com"
                    className={`input-field pl-10 ${errors.guardianEmail ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.guardianEmail && <span className="text-xs text-red-500 mt-1 block">{t(errors.guardianEmail)}</span>}
                <p className="text-[11px] text-slate-500 mt-1">
                  {t('The school will contact you here once the application is reviewed.')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('Guardian Mobile')} *</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.guardianPhone}
                    onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                    placeholder="01700000000"
                    className={`input-field pl-10 ${errors.guardianPhone ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.guardianPhone && <span className="text-xs text-red-500 mt-1 block">{t(errors.guardianPhone)}</span>}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? t('Submitting…') : t('Submit Application')}
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

export default StudentRegistration;
