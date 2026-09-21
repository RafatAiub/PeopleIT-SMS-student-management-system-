import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  Building2,
  AlertTriangle,
  AtSign,
  Phone,
  User,
  MailCheck,
  Check,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client';
import { AuthShell, ButtonSpinner } from '../components/auth/AuthShell';
import { authApi } from '../api/auth.api';
import {
  isValidEmail,
  describeBdMobile,
  isValidBdMobile,
  checkPassword,
  isValidPassword,
} from '../utils/identifier';

type Role = 'STUDENT' | 'GUARDIAN' | 'TEACHER';

const ROLES: { value: Role; label: string }[] = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'GUARDIAN', label: 'Parent / Guardian' },
  { value: 'TEACHER', label: 'Teacher' },
];

const NAME_PATTERN = /^[a-zA-Z\s\-']+$/;

const Register = () => {
  const [institutionCode, setInstitutionCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('STUDENT');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Which fields the user has left, so errors appear on blur rather than
  // scolding them mid-typing.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  // Set once the account is created — the form is replaced by a "check your
  // email" panel rather than redirecting, because the next step is in their
  // inbox, not in the app.
  const [submitted, setSubmitted] = useState(false);

  const navigate = useNavigate();
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchInstitutions = async (attempt = 0) => {
      try {
        const response = await apiClient.get('/institution/public/list', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!cancelled) setInstitutions(response.data.data || []);
      } catch (err) {
        console.error('Failed to load institutions list', err);
        if (!cancelled && attempt < 2) {
          setTimeout(() => fetchInstitutions(attempt + 1), 1000 * (attempt + 1));
        }
      }
    };
    fetchInstitutions();

    return () => {
      cancelled = true;
    };
  }, []);

  const passwordChecks = checkPassword(password);
  const phoneError = phone.trim() ? describeBdMobile(phone) : null;

  const nameError = (value: string, label: string): string | null => {
    if (!value.trim()) return `${label} is required.`;
    if (!NAME_PATTERN.test(value.trim())) {
      return `${label} should only contain letters, spaces, hyphens, and apostrophes.`;
    }
    return null;
  };

  const firstNameError = touched.firstName ? nameError(firstName, 'First name') : null;
  const lastNameError = touched.lastName ? nameError(lastName, 'Last name') : null;
  const emailError =
    touched.email && email.trim() && !isValidEmail(email)
      ? 'Please enter a valid email address.'
      : null;
  const phoneFieldError = touched.phone && phone.trim() ? phoneError : null;

  const formValid =
    institutionCode.trim() !== '' &&
    !nameError(firstName, 'First name') &&
    !nameError(lastName, 'Last name') &&
    isValidEmail(email) &&
    isValidBdMobile(phone) &&
    isValidPassword(password);

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Reveal every outstanding problem at once rather than one per submit.
    setTouched({ firstName: true, lastName: true, email: true, phone: true, password: true });

    if (!formValid) {
      if (!institutionCode.trim()) toast.error('Please select your institution');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.register({
        institutionCode: institutionCode.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
      });
      setSubmitted(true);
    } catch (err: any) {
      // Without `response` the request never reached the server — the API
      // client's interceptor already explained that, so adding a second,
      // wronger message here would only confuse.
      if (!err?.response) return;
      const message = err.response.data?.message || 'We could not create your account. Please try again.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
            <MailCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Check your email
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
            We sent a confirmation link to <span className="font-semibold break-all">{email.trim()}</span>.
            Open it to confirm your address.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-7">
            After that, an administrator at your institution reviews your request. You will get an
            email once your account is approved.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-primary w-full justify-center py-3 text-sm"
          >
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell liveMessage={errorMessage ?? undefined}>
      <div className="hidden lg:block mb-8">
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Create your account
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Join your institution on PeopleNIT SMS.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>

        {/* Institution */}
        <Field label="Institution / Portal" htmlFor="reg-institution">
          <div className="relative">
            <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              id="reg-institution"
              ref={firstFieldRef}
              required
              value={institutionCode}
              onChange={(e) => setInstitutionCode(e.target.value)}
              className="input-field pl-11 pr-10 py-3 text-sm font-medium appearance-none cursor-pointer"
            >
              <option value="" disabled className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                {institutions.length === 0 ? 'Loading institutions…' : 'Select your institution…'}
              </option>
              {institutions.map((inst) => (
                <option key={inst.slug} value={inst.slug} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                  {inst.name} ({inst.slug})
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </Field>

        {/* Name */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="reg-first" error={firstNameError}>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="reg-first"
                type="text"
                autoComplete="given-name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={() => touch('firstName')}
                aria-invalid={Boolean(firstNameError)}
                className={`input-field pl-11 py-3 text-sm font-medium ${firstNameError ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Habibur"
              />
            </div>
          </Field>

          <Field label="Last name" htmlFor="reg-last" error={lastNameError}>
            <input
              id="reg-last"
              type="text"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onBlur={() => touch('lastName')}
              aria-invalid={Boolean(lastNameError)}
              className={`input-field py-3 text-sm font-medium ${lastNameError ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="Rahman"
            />
          </Field>
        </div>

        {/* Email */}
        <Field label="Email address" htmlFor="reg-email" error={emailError}>
          <div className="relative">
            <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => touch('email')}
              aria-invalid={Boolean(emailError)}
              className={`input-field pl-11 py-3 text-sm font-medium ${emailError ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="you@example.com"
            />
          </div>
          {!emailError && (
            <p className="text-xs text-slate-500 dark:text-slate-400 pl-1 pt-1">
              You will need to confirm this address before you can sign in.
            </p>
          )}
        </Field>

        {/* Phone */}
        <Field label="Mobile number" htmlFor="reg-phone" error={phoneFieldError}>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="reg-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => touch('phone')}
              aria-invalid={Boolean(phoneFieldError)}
              className={`input-field pl-11 py-3 text-sm font-medium ${phoneFieldError ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="01700000000"
            />
          </div>
          {!phoneFieldError && (
            <p className="text-xs text-slate-500 dark:text-slate-400 pl-1 pt-1">
              You can sign in with this number or your email address.
            </p>
          )}
        </Field>

        {/* Role */}
        <Field label="I am a" htmlFor="reg-role">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Account type">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={role === r.value}
                onClick={() => setRole(r.value)}
                className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                  role === r.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 pl-1 pt-1">
            An administrator confirms this when approving your account.
          </p>
        </Field>

        {/* Password */}
        <Field label="Password" htmlFor="reg-password">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => touch('password')}
              onKeyUp={handlePasswordKeyEvent}
              onKeyDown={handlePasswordKeyEvent}
              className="input-field pl-11 pr-12 py-3 text-sm font-medium"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>

          {capsLockOn && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium pl-1 pt-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Caps Lock is on.
            </p>
          )}

          {/* Live requirements, shown once they start typing. Ticking items off
              as they go beats rejecting the whole thing on submit. */}
          {password.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 pl-1">
              {passwordChecks.map((check) => (
                <li
                  key={check.label}
                  className={`flex items-center gap-1.5 text-xs ${
                    check.met
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {check.met ? (
                    <Check className="w-3 h-3 shrink-0" />
                  ) : (
                    <X className="w-3 h-3 shrink-0 opacity-50" />
                  )}
                  {check.label}
                </li>
              ))}
            </ul>
          )}
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? <ButtonSpinner /> : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Sign in
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
        Registering an institution instead?{' '}
        <Link to="/apply" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Apply here
        </Link>
      </p>
    </AuthShell>
  );
};

/** Label + control + error, matching the sign-in page's field rhythm. */
function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
      >
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-red-500 font-medium pl-1">
          {error}
        </p>
      )}
    </div>
  );
}

export default Register;
