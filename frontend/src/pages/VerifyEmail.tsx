import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthShell } from '../components/auth/AuthShell';
import { authApi } from '../api/auth.api';

type State =
  | { kind: 'verifying' }
  | { kind: 'verified'; message: string; pendingApproval: boolean }
  | { kind: 'failed'; message: string };

/**
 * Landing page for the link in the confirmation email
 * (`/verify-email?token=…`). Verifies on mount — there is no button to press,
 * because clicking the link *is* the user's confirmation.
 */
const VerifyEmail = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [state, setState] = useState<State>({ kind: 'verifying' });
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);

  // React 18 StrictMode mounts effects twice in development. Without this
  // guard the token would be submitted twice and the second call would look
  // like a failure to anyone reading the network tab.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState({
        kind: 'failed',
        message: 'This confirmation link is incomplete. Please open the link from your email again.',
      });
      return;
    }

    authApi
      .verifyEmail(token)
      .then((result) =>
        setState({
          kind: 'verified',
          message: result.message,
          pendingApproval: result.pendingApproval,
        }),
      )
      .catch((err: any) =>
        setState({
          kind: 'failed',
          message:
            err?.response?.data?.message ||
            'We could not confirm your email address. The link may have expired.',
        }),
      );
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;

    setResending(true);
    try {
      const { message } = await authApi.resendVerification(resendEmail.trim());
      toast.success(message);
    } catch {
      toast.error('Could not send the email. Please try again shortly.');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell>
      <div className="text-center">
        {state.kind === 'verifying' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-5">
              <Loader2 className="w-7 h-7 text-slate-500 animate-spin" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
              Confirming your email
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">One moment…</p>
          </>
        )}

        {state.kind === 'verified' && (
          <>
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 ${
                state.pendingApproval
                  ? 'bg-amber-50 dark:bg-amber-500/10'
                  : 'bg-emerald-50 dark:bg-emerald-500/10'
              }`}
            >
              {state.pendingApproval ? (
                <Clock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              )}
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
              {state.pendingApproval ? 'Almost there' : 'Email confirmed'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-7">
              {state.message}
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="btn-primary w-full justify-center py-3 text-sm"
            >
              {state.pendingApproval ? 'Back to sign in' : 'Sign in'}
            </button>
          </>
        )}

        {state.kind === 'failed' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
              Link didn't work
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
              {state.message}
            </p>

            {/* Recovery in place: an expired link is the common case, and
                sending a fresh one should not need a trip back to sign-in. */}
            <form onSubmit={handleResend} className="text-left space-y-3">
              <label
                htmlFor="resend-email"
                className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
              >
                Send a new link
              </label>
              <input
                id="resend-email"
                type="email"
                autoComplete="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                className="input-field py-3 text-sm font-medium"
                placeholder="you@example.com"
              />
              <button
                type="submit"
                disabled={resending || !resendEmail.trim()}
                className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resending ? 'Sending…' : 'Send confirmation link'}
              </button>
            </form>

            <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
              <Link to="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
};

export default VerifyEmail;
