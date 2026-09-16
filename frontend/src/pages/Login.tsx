import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Eye, EyeOff, Mail, Lock, Building2, AlertTriangle, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../api/client';
import { REMEMBER_ME_KEY } from '../store/authStore';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { LogoMark } from '../components/common/LogoMark';

// Remembers the last institution/portal actually chosen on this browser, so a
// returning user sees their own last selection preselected instead of the
// login form silently defaulting to an arbitrary, hardcoded school.
const LAST_PORTAL_STORAGE_KEY = 'sms_last_portal';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [institutionCode, setInstitutionCode] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(
    () => localStorage.getItem(LAST_PORTAL_STORAGE_KEY) === 'global-admin'
  );
  const [showPassword, setShowPassword] = useState(false);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institutionTouched, setInstitutionTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(REMEMBER_ME_KEY) === '1'
  );
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const institutionSelectRef = useRef<HTMLSelectElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const emailInvalid = emailTouched && email.trim() !== '' && !EMAIL_PATTERN.test(email.trim());

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSuperAdmin && !institutionCode.trim()) {
      setInstitutionTouched(true);
      toast.error('Please select your institution / portal');
      institutionSelectRef.current?.focus();
      return;
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailTouched(true);
      toast.error('Please enter a valid email address');
      emailRef.current?.focus();
      return;
    }

    localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? '1' : '0');

    try {
      await login.mutateAsync({
        email: email.trim(),
        password: password.trim(),
        institutionCode: isSuperAdmin ? '' : institutionCode.trim()
      });
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err) {
      // Error handling is managed by hook toast notification; focus password
      // for a fast retry since that's the field a wrong-credentials error
      // almost always means the user needs to re-check.
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }
  };

  const isLockedOut = lockoutSecondsLeft !== null && lockoutSecondsLeft > 0;
  const loginErrorMessage = (login.error as any)?.response?.data?.message as string | undefined;

  const features = [
    'Attendance & academic records',
    'Fees, invoices & online payments',
    'Timetables, exams & staff management',
  ];

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 dark:bg-surface-950 p-4 sm:p-6 lg:p-10 transition-colors duration-300">
      {/* Screen-reader-only live region: announces the current error even
          though the toast itself isn't reliably read by all screen readers. */}
      <div role="alert" aria-live="assertive" className="sr-only">
        {loginErrorMessage}
      </div>

      {/* The whole login UI is one bounded, centered card — not a full-bleed
          50/50 split — so it stays visually balanced instead of floating in a
          sea of empty space on wide/ultrawide screens. */}
      <div className="w-full max-w-5xl bg-white dark:bg-surface-900 rounded-3xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden grid lg:grid-cols-2 animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Illustration panel — brand story, hidden on small screens */}
        <div className="hidden lg:flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 p-10 xl:p-12">
          <div className="absolute inset-0 opacity-[0.08]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }} />
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-accent-400/10 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full bg-primary-300/10 blur-3xl" />

          <div className="relative z-10 flex items-center gap-3">
            <LogoMark className="w-10 h-10 shadow-lg" />
            <span className="text-white font-bold text-lg tracking-tight">PeopleNIT SMS</span>
          </div>

          <div className="relative z-10">
            <svg viewBox="0 0 200 160" className="w-40 xl:w-48 h-auto mb-8 text-white/25" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M30 130 L30 70 L70 70 L70 130 M40 90 h20 M40 105 h20" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M100 40 L140 55 L100 70 L60 55 Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M75 60 v22 c0 8 12 14 25 14 s25 -6 25 -14 v-22" />
              <circle cx="140" cy="55" r="2" fill="currentColor" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M140 55 v18" />
              <rect x="150" y="95" width="30" height="24" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M156 95 v-6 a9 9 0 0 1 18 0 v6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 40 l6 6 m0 -6 l-6 6" />
              <circle cx="170" cy="30" r="4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M95 130 h50 m-50 8 h35" />
            </svg>
            <h1 className="text-2xl xl:text-3xl font-black text-white tracking-tight leading-tight mb-3">
              Run your entire institution from one dashboard
            </h1>
            <p className="text-primary-100/80 text-sm leading-relaxed mb-6">
              PeopleNIT SMS brings every academic workflow into a single, reliable
              platform for administrators, teachers, students and guardians alike.
            </p>
            <ul className="space-y-2.5">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-2.5 text-sm text-primary-50/90">
                  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 text-primary-200/50 text-xs">© {new Date().getFullYear()} PeopleNIT SMS. All rights reserved.</p>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="relative z-10 w-full max-w-sm">
          <div className="text-center mb-8 lg:hidden">
            <LogoMark className="w-14 h-14 mx-auto mb-4 shadow-lg" />
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
              PeopleNIT <span className="text-accent-500">SMS</span>
            </h1>
          </div>
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

          <form onSubmit={handleLogin} className="space-y-5" noValidate>

            {/* Institution Select Dropdown */}
            <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '50ms' }}>
              <label htmlFor="institution-select" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Select Institution / Portal
              </label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  id="institution-select"
                  ref={institutionSelectRef}
                  required
                  aria-invalid={institutionTouched && !isSuperAdmin && !institutionCode.trim()}
                  aria-describedby={institutionTouched && !isSuperAdmin && !institutionCode.trim() ? 'institution-error' : undefined}
                  value={isSuperAdmin ? 'global-admin' : institutionCode}
                  onBlur={() => setInstitutionTouched(true)}
                  onChange={(e) => {
                    setInstitutionTouched(true);
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
                  className={`input-field pl-11 pr-10 py-3 text-sm font-medium appearance-none cursor-pointer ${
                    institutionTouched && !isSuperAdmin && !institutionCode.trim() ? 'border-red-500 focus:ring-red-500' : ''
                  }`}
                >
                  <option value="" disabled className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                    {institutions.length === 0 ? 'Loading institutions…' : 'Select your institution…'}
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
              {institutionTouched && !isSuperAdmin && !institutionCode.trim() && (
                <p id="institution-error" role="alert" className="text-xs text-red-500 font-medium pl-1">
                  Please select your institution.
                </p>
              )}
            </div>

            {/* Email Address */}
            <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '100ms' }}>
              <label htmlFor="login-email" className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="login-email"
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  required
                  aria-invalid={emailInvalid}
                  aria-describedby={emailInvalid ? 'email-error' : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  className={`input-field pl-11 py-3 text-sm font-medium ${emailInvalid ? 'border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="admin@peopleit.com"
                />
              </div>
              {emailInvalid && (
                <p id="email-error" role="alert" className="text-xs text-red-500 font-medium pl-1">
                  Please enter a valid email address.
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
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : isLockedOut ? (
                `Try again in ${formatMmSs(lockoutSecondsLeft)}`
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo Accounts — local development only, never rendered in a production build */}
          {import.meta.env.DEV && (
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/5 space-y-3 animate-fadeIn" style={{ animationDelay: '250ms' }}>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Demo Accounts (Dev Only)</h4>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div className="bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
                  <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 block">Super Admin (Global)</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-1">Email: <span className="text-slate-700 dark:text-slate-300 font-mono">admin@peopleit.com</span></span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Pass: <span className="text-slate-700 dark:text-slate-300 font-mono">admin123</span></span>
                  <span className="text-[9px] text-slate-500 block mt-1 italic">*Select 'Global Admin'</span>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
                  <span className="text-[10px] font-bold text-accent-600 dark:text-accent-400 block">Teacher (School-based)</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-1">Email: <span className="text-slate-700 dark:text-slate-300 font-mono">teacher@peopleit.com</span></span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Pass: <span className="text-slate-700 dark:text-slate-300 font-mono">admin123</span></span>
                  <span className="text-[9px] text-slate-500 block mt-1 italic">*Select school from dropdown</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      </div>

      <Modal isOpen={showForgotPassword} onClose={() => setShowForgotPassword(false)} className="max-w-sm">
        <h2 id="forgot-password-title" className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
          Reset your password
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
          Self-service password reset isn't available yet. Please contact your institution's admin
          (or the super admin, for global-admin accounts) to have your password reset.
        </p>
        <Button variant="primary" onClick={() => setShowForgotPassword(false)} className="w-full justify-center py-2.5 text-sm">
          Got it
        </Button>
      </Modal>
    </div>
  );
};

export default Login;
