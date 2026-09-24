import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Eye,
  EyeOff,
  Lock,
  Building2,
  AlertTriangle,
  AtSign,
  ShieldCheck,
  ArrowLeft,
  MailCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client';
import { REMEMBER_ME_KEY } from '../store/authStore';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { AuthShell, ButtonSpinner } from '../components/auth/AuthShell';
import { authApi, isTwoFactorChallenge, type TwoFactorChallenge } from '../api/auth.api';
import { describeIdentifier, isValidIdentifier } from '../utils/identifier';

// Remembers the last institution/portal actually chosen on this browser, so a
// returning user sees their own last selection preselected instead of the
// login form silently defaulting to an arbitrary, hardcoded school.
const LAST_PORTAL_STORAGE_KEY = 'sms_last_portal';

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [institutionCode, setInstitutionCode] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(
    () => localStorage.getItem(LAST_PORTAL_STORAGE_KEY) === 'global-admin'
  );
  const [showPassword, setShowPassword] = useState(false);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(REMEMBER_ME_KEY) === '1'
  );
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number | null>(null);

  // Second login step. Holding the challenge in state (rather than routing to
  // a separate page) keeps the half-finished login out of the URL and out of
  // history — a back-button press cannot resurrect it.
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState('');

  // Set when the backend reports EMAIL_NOT_VERIFIED, so we can offer a resend
  // to the exact address instead of asking the user to type it again.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const institutionSelectRef = useRef<HTMLSelectElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const identifierInvalid =
    identifierTouched && identifier.trim() !== '' && !isValidIdentifier(identifier);

  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  // Jump straight to the code box when the challenge appears — retyping is not
  // the point of this screen.
  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  useEffect(() => {
    let cancelled = false;

    const fetchInstitutions = async (attempt = 0) => {
      try {
        const response = await apiClient.get('/institution/public/list', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!cancelled) {
          const list = response.data.data || [];
          setInstitutions(list);

          // Preselect the last portal this browser actually used — but only
          // if it still exists in the freshly fetched list. Never fall back
          // to picking the first/any institution automatically.
          const remembered = localStorage.getItem(LAST_PORTAL_STORAGE_KEY);
          if (remembered && remembered !== 'global-admin' && list.some((inst: any) => inst.slug === remembered)) {
            setInstitutionCode(remembered);
          }
        }
      } catch (err) {
        console.error('Failed to load institutions list', err);
        // Transient failures (cold-starting backend, flaky connection, etc.)
        // used to leave the dropdown stuck on the single fallback entry until
        // the user manually reloaded — retry a couple of times instead.
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

  // Surface an account-lockout countdown pulled from the 423 response
  // (see backend/src/modules/auth/auth.service.ts) instead of just a toast,
  // so the user can see exactly when they can try again without re-submitting.
  useEffect(() => {
    const err: any = login.error;
    const retryAfterSeconds = err?.response?.data?.errors?.retryAfterSeconds;
    if (err?.response?.status === 423 && typeof retryAfterSeconds === 'number') {
      setLockoutSecondsLeft(retryAfterSeconds);
    }
  }, [login.error]);

  // A 403 carrying EMAIL_NOT_VERIFIED is recoverable in place — the response
  // includes the address, so the resend button needs no extra input.
  useEffect(() => {
    const err: any = login.error;
    const errors = err?.response?.data?.errors;
    if (err?.response?.status === 403 && errors?.code === 'EMAIL_NOT_VERIFIED') {
      setUnverifiedEmail(errors.email ?? null);
    }
  }, [login.error]);

  useEffect(() => {
    if (lockoutSecondsLeft === null) return;
    if (lockoutSecondsLeft <= 0) {
      setLockoutSecondsLeft(null);
      return;
    }
    const timer = setTimeout(() => setLockoutSecondsLeft((s) => (s ?? 0) - 1), 1000);
    return () => clearTimeout(timer);
  }, [lockoutSecondsLeft]);

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const goToDestination = () => {
    const from = location.state?.from?.pathname || '/';
    navigate(from, { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnverifiedEmail(null);

    if (!isValidIdentifier(identifier)) {
      setIdentifierTouched(true);
      toast.error('Enter a valid email address or mobile number');
      identifierRef.current?.focus();
      return;
    }

    localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? '1' : '0');

    try {
      const result = await login.mutateAsync({
        identifier: identifier.trim(),
        password: password.trim(),
        // Omitted entirely when the portal is left on auto-detect: email and
        // phone are globally unique, so the identifier alone finds the account.
        ...(isSuperAdmin || !institutionCode.trim()
          ? {}
          : { institutionCode: institutionCode.trim() }),
      });

      if (isTwoFactorChallenge(result)) {
        setChallenge(result);
        return;
      }

      goToDestination();
    } catch (err) {
      // Error handling is managed by hook toast notification; focus password
      // for a fast retry since that's the field a wrong-credentials error
      // almost always means the user needs to re-check.
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;

    try {
      await verifyTwoFactor.mutateAsync({
        challengeToken: challenge.challengeToken,
        code: code.trim(),
      });
      goToDestination();
    } catch {
      setCode('');
      codeRef.current?.focus();
    }
  };

  /** Abandon the challenge and return to the password form. */
  const cancelChallenge = () => {
    setChallenge(null);
    setCode('');
    setPassword('');
    passwordRef.current?.focus();
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      const { message } = await authApi.resendVerification(unverifiedEmail);
      toast.success(message);
    } catch {
      toast.error('Could not send the email. Please try again shortly.');
    } finally {
      setResending(false);
    }
  };

  const isLockedOut = lockoutSecondsLeft !== null && lockoutSecondsLeft > 0;
  const loginErrorMessage = (login.error as any)?.response?.data?.message as string | undefined;

  return (
    <AuthShell liveMessage={loginErrorMessage}>
      <>
          {challenge ? (
            /* ── Step two: two-step verification ──────────────────────────── */
            <>
              <div className="mb-8">
                <div className="w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Two-step verification
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 leading-relaxed">
                  {challenge.method === 'TOTP'
                    ? 'Open your authenticator app and enter the 6-digit code it shows.'
                    : `We sent a 6-digit code to ${challenge.sentTo ?? 'your email address'}.`}
                </p>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-5" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="login-code" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Verification code
                  </label>
                  <input
                    id="login-code"
                    ref={codeRef}
                    type="text"
                    inputMode="text"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="input-field py-3 text-center text-lg font-mono font-bold tracking-[0.4em]"
                    placeholder="000000"
                    maxLength={20}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 pl-1 pt-1">
                    Lost your device? Enter one of your backup codes instead.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={verifyTwoFactor.isPending || code.trim().length < 4}
                  className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {verifyTwoFactor.isPending ? <ButtonSpinner /> : 'Verify and sign in'}
                </button>

                <button
                  type="button"
                  onClick={cancelChallenge}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Use a different account
                </button>
              </form>
            </>
          ) : (
            /* ── Step one: identifier + password ──────────────────────────── */
            <>
              <div className="hidden lg:block mb-8">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Welcome back</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Sign in to your dashboard to continue.</p>
              </div>

              {isLockedOut && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3.5 text-amber-800 dark:text-amber-300"
                >
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-xs font-medium leading-relaxed">
                    Too many failed attempts. Please try again in{' '}
                    <span className="font-mono font-bold">{formatMmSs(lockoutSecondsLeft)}</span>.
                  </p>
                </div>
              )}

              {unverifiedEmail && (
                <div
                  role="alert"
                  className="mb-5 rounded-xl border border-blue-300/60 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30 p-3.5"
                >
                  <div className="flex items-start gap-2.5 text-blue-800 dark:text-blue-300">
                    <MailCheck className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="text-xs font-medium leading-relaxed">
                      Confirm your email address before signing in. We sent a link to{' '}
                      <span className="font-semibold break-all">{unverifiedEmail}</span>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="mt-2.5 ml-6.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-60"
                  >
                    {resending ? 'Sending…' : 'Send a new link'}
                  </button>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5" noValidate>

                {/* Institution Select Dropdown — optional now that email and
                    phone are globally unique. Left on auto-detect, no code is
                    sent and the identifier alone resolves the account. */}
                <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '50ms' }}>
                  <label htmlFor="institution-select" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Institution / Portal <span className="font-medium normal-case tracking-normal text-slate-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select
                      id="institution-select"
                      ref={institutionSelectRef}
                      value={isSuperAdmin ? 'global-admin' : institutionCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'global-admin') {
                          setIsSuperAdmin(true);
                          setInstitutionCode('');
                          localStorage.setItem(LAST_PORTAL_STORAGE_KEY, 'global-admin');
                        } else {
                          setIsSuperAdmin(false);
                          setInstitutionCode(val);
                          if (val) {
                            localStorage.setItem(LAST_PORTAL_STORAGE_KEY, val);
                          } else {
                            localStorage.removeItem(LAST_PORTAL_STORAGE_KEY);
                          }
                        }
                      }}
                      className="input-field pl-11 pr-10 py-3 text-sm font-medium appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                        {institutions.length === 0 ? 'Loading institutions…' : 'Detect from my account'}
                      </option>
                      {institutions.map((inst) => (
                        <option key={inst.slug} value={inst.slug} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                          {inst.name} ({inst.slug})
                        </option>
                      ))}
                      <option value="global-admin" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">Global Admin</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Email or phone */}
                <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '100ms' }}>
                  <label htmlFor="login-identifier" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Email or Mobile Number
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="login-identifier"
                      ref={identifierRef}
                      type="text"
                      autoComplete="username"
                      required
                      aria-invalid={identifierInvalid}
                      aria-describedby={identifierInvalid ? 'identifier-error' : undefined}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      onBlur={() => setIdentifierTouched(true)}
                      className={`input-field pl-11 py-3 text-sm font-medium ${identifierInvalid ? 'border-red-500 focus:ring-red-500' : ''}`}
                      placeholder="admin@peopleit.com or 01700000000"
                    />
                  </div>
                  {identifierInvalid && (
                    <p id="identifier-error" role="alert" className="text-xs text-red-500 font-medium pl-1">
                      {describeIdentifier(identifier)}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '150ms' }}>
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="login-password"
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
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
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                  {capsLockOn && (
                    <p role="status" className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium pl-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Caps Lock is on.
                    </p>
                  )}
                </div>

                {/* Remember me */}
                <div className="flex items-center gap-2">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                    Keep me signed in on this device
                  </label>
                </div>

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={login.isPending || isLockedOut}
                  className="btn-primary w-full justify-center py-3 text-sm animate-fadeIn disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ animationDelay: '200ms' }}
                >
                  {login.isPending ? (
                    <ButtonSpinner />
                  ) : isLockedOut ? (
                    `Try again in ${formatMmSs(lockoutSecondsLeft)}`
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                New here?{' '}
                <Link to="/register" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Create an account
                </Link>
              </p>

              {/* Demo Accounts — local development only, never rendered in a production build */}
              {import.meta.env.DEV && (
                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/5 space-y-3 animate-fadeIn" style={{ animationDelay: '250ms' }}>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Demo Accounts (Dev Only)</h4>
                  <div className="grid grid-cols-2 gap-2 text-left">
                    <div className="bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
                      <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 block">Super Admin (Global)</span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-1">Email: <span className="text-slate-700 dark:text-slate-300 font-mono">admin@peopleit.com</span></span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Pass: <span className="text-slate-700 dark:text-slate-300 font-mono">admin123</span></span>
                    </div>
                    <div className="bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
                      <span className="text-[10px] font-bold text-accent-600 dark:text-accent-400 block">Teacher (School-based)</span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-1">Email: <span className="text-slate-700 dark:text-slate-300 font-mono">teacher@peopleit.com</span></span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Pass: <span className="text-slate-700 dark:text-slate-300 font-mono">admin123</span></span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        <ForgotPasswordModal isOpen={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
      </>
    </AuthShell>
  );
};

/**
 * Requests a reset link. The response is deliberately the same whether or not
 * an account matched, so this modal always shows the same confirmation — do
 * not "helpfully" report an unknown address here.
 */
function ForgotPasswordModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const close = () => {
    onClose();
    // Reset after the closing animation so the content does not flicker.
    setTimeout(() => {
      setValue('');
      setSent(false);
    }, 200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidIdentifier(value)) {
      toast.error('Enter a valid email address or mobile number');
      return;
    }
    setSending(true);
    try {
      await authApi.forgotPassword(value.trim());
      setSent(true);
    } catch {
      toast.error('Something went wrong. Please try again shortly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} className="max-w-sm">
      {sent ? (
        <>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
            <MailCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Check your email</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
            If an account matches those details, we have sent a link to reset your password. It
            expires in one hour.
          </p>
          <Button variant="primary" onClick={close} className="w-full justify-center py-2.5 text-sm">
            Got it
          </Button>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Reset your password</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
            Enter the email address or mobile number on your account and we will send you a link to
            choose a new password.
          </p>
          <div className="relative mb-5">
            <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input-field pl-11 py-3 text-sm font-medium"
              placeholder="admin@peopleit.com or 01700000000"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={sending}
            className="w-full justify-center py-2.5 text-sm"
          >
            {sending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </Modal>
  );
}

export default Login;
