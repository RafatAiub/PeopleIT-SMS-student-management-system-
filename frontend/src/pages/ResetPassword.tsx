import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, CheckCircle2, XCircle, AlertTriangle, Check, X } from 'lucide-react';
import { AuthShell, ButtonSpinner } from '../components/auth/AuthShell';
import { authApi } from '../api/auth.api';
import { checkPassword, isValidPassword } from '../utils/identifier';

/**
 * Landing page for the link in the password-reset email
 * (`/reset-password?token=…`). Replaces the previous dead flow, where a token
 * was minted but no endpoint ever consumed it.
 */
const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const checks = checkPassword(password);
  const mismatch = touched && confirm.length > 0 && password !== confirm;
  const canSubmit = isValidPassword(password) && password === confirm && !submitting;

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setErrorMessage(null);
    if (!token || !canSubmit) return;

    setSubmitting(true);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
    } catch (err: any) {
      if (!err?.response) return;
      setErrorMessage(
        err.response.data?.message || 'We could not reset your password. The link may have expired.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // A missing token means the URL was truncated or hand-typed — there is
  // nothing to submit, so do not render a form that cannot work.
  if (!token) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Link didn't work
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-7">
            This reset link is incomplete. Open the link from your email again, or request a new one
            from the sign-in page.
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

  if (done) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
            Password changed
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-7">
            You have been signed out everywhere else. Sign in with your new password to continue.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="btn-primary w-full justify-center py-3 text-sm"
          >
            Sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell liveMessage={errorMessage ?? undefined}>
      <div className="mb-8">
        <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center mb-4">
          <Lock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Choose a new password
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Pick something you haven't used here before.
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-300/60 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 p-3.5 text-red-800 dark:text-red-300"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs font-medium leading-relaxed">{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <label
            htmlFor="new-password"
            className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
          >
            New password
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="new-password"
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            >
              {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>

          {capsLockOn && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium pl-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Caps Lock is on.
            </p>
          )}

          {password.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 pl-1">
              {checks.map((check) => (
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
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirm-password"
            className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
          >
            Confirm password
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={mismatch}
              className={`input-field pl-11 py-3 text-sm font-medium ${mismatch ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="••••••••"
            />
          </div>
          {mismatch && (
            <p role="alert" className="text-xs text-red-500 font-medium pl-1">
              Passwords do not match.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? <ButtonSpinner /> : 'Change password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        <Link to="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
};

export default ResetPassword;
