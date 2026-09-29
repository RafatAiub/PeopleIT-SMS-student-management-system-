import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Mail,
  KeyRound,
  Copy,
  Download,
  AlertTriangle,
  Check,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { authApi, type TwoFactorStatus, type TotpSetup } from '../../api/auth.api';

// =============================================================================
// Settings → Security (per-user, not per-institution)
// =============================================================================
// TOTP enrolment is two-phase on purpose: the QR is shown, then the user must
// prove their app produces a matching code before 2FA actually switches on.
// Enabling on an unverified secret is the classic way to lock someone out of
// their own account.

type Flow =
  | { kind: 'idle' }
  | { kind: 'totp-setup'; setup: TotpSetup }
  | { kind: 'backup-codes'; codes: string[]; heading: string };

const SecuritySettings = () => {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [flow, setFlow] = useState<Flow>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  const [confirmCode, setConfirmCode] = useState('');
  const [passwordPrompt, setPasswordPrompt] = useState<null | 'disable' | 'regenerate'>(null);
  const [password, setPassword] = useState('');

  const refresh = async () => {
    try {
      setStatus(await authApi.getTwoFactorStatus());
    } catch {
      toast.error('Could not load your security settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const startTotp = async () => {
    setBusy(true);
    try {
      const setup = await authApi.beginTotpSetup();
      setConfirmCode('');
      setFlow({ kind: 'totp-setup', setup });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not start setup. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { backupCodes } = await authApi.confirmTotpSetup(confirmCode.trim());
      setFlow({ kind: 'backup-codes', codes: backupCodes, heading: 'Two-step verification is on' });
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'That code did not match. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const enableEmail = async () => {
    setBusy(true);
    try {
      const { backupCodes } = await authApi.enableEmailTwoFactor();
      setFlow({ kind: 'backup-codes', codes: backupCodes, heading: 'Two-step verification is on' });
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not turn this on. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (passwordPrompt === 'disable') {
        const { message } = await authApi.disableTwoFactor(password);
        toast.success(message);
        setFlow({ kind: 'idle' });
      } else {
        const { backupCodes } = await authApi.regenerateBackupCodes(password);
        setFlow({ kind: 'backup-codes', codes: backupCodes, heading: 'New backup codes' });
      }
      setPasswordPrompt(null);
      setPassword('');
      await refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400 py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading your security settings…
      </div>
    );
  }

  const enabled = status?.enabled ?? false;

  return (
    <>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        Two-Step Verification
      </h3>

      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed -mt-2">
        Add a second check when you sign in, so a stolen password is not enough on its own.
      </p>

      {/* Current state */}
      <div
        className={`flex items-start gap-3 rounded-xl border p-4 ${
          enabled
            ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10'
            : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5'
        }`}
      >
        {enabled ? (
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
        ) : (
          <ShieldOff className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {enabled ? 'Turned on' : 'Turned off'}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
            {enabled
              ? status?.method === 'TOTP'
                ? 'You use an authenticator app to sign in.'
                : 'We email you a code when you sign in.'
              : 'Your password is the only thing protecting your account.'}
          </p>
          {enabled && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              {status?.backupCodesRemaining ?? 0} backup code
              {status?.backupCodesRemaining === 1 ? '' : 's'} remaining
              {(status?.backupCodesRemaining ?? 0) <= 2 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium"> — running low</span>
              )}
            </p>
          )}
        </div>
      </div>

      {enabled ? (
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            onClick={() => setPasswordPrompt('regenerate')}
            className="text-sm py-2.5"
          >
            <KeyRound className="w-4 h-4 mr-1.5" />
            New backup codes
          </Button>
          <Button
            variant="danger"
            onClick={() => setPasswordPrompt('disable')}
            className="text-sm py-2.5"
          >
            <ShieldOff className="w-4 h-4 mr-1.5" />
            Turn off
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <MethodCard
            icon={<Smartphone className="w-5 h-5" />}
            title="Authenticator app"
            description="Use Google Authenticator or any similar app. Works without a network connection."
            recommended
            actionLabel="Set up"
            busy={busy}
            onClick={startTotp}
          />
          <MethodCard
            icon={<Mail className="w-5 h-5" />}
            title="Email code"
            description="We send a 6-digit code to your confirmed email address each time you sign in."
            actionLabel="Turn on"
            busy={busy}
            onClick={enableEmail}
          />
        </div>
      )}

      {/* ── TOTP setup: QR + confirmation ───────────────────────────────────── */}
      <Modal
        isOpen={flow.kind === 'totp-setup'}
        onClose={() => setFlow({ kind: 'idle' })}
        className="max-w-md"
      >
        {flow.kind === 'totp-setup' && (
          <form onSubmit={confirmTotp}>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
              Set up your authenticator app
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
              Scan this with Google Authenticator, then enter the 6-digit code it shows to confirm.
            </p>

            <div className="flex justify-center mb-4">
              <img
                src={flow.setup.qrCodeDataUrl}
                alt="QR code for setting up two-step verification"
                className="w-44 h-44 rounded-xl border border-slate-200 dark:border-white/10 bg-white p-2"
              />
            </div>

            {/* Manual entry matters: QR scanning fails on desktop-only setups
                and for anyone using a screen reader. */}
            <div className="mb-5">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Can't scan? Enter this key
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(flow.setup.manualEntryKey);
                  toast.success('Key copied');
                }}
                className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2.5 text-left transition-colors hover:border-slate-300 dark:hover:border-white/20"
              >
                <code className="text-xs font-mono break-all text-slate-700 dark:text-slate-300">
                  {flow.setup.manualEntryKey}
                </code>
                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            </div>

            <div className="space-y-1.5 mb-5">
              <label
                htmlFor="totp-confirm"
                className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
              >
                6-digit code
              </label>
              <input
                id="totp-confirm"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={10}
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className="input-field py-3 text-center text-lg font-mono font-bold tracking-[0.4em]"
                placeholder="000000"
              />
            </div>

            <div className="flex gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFlow({ kind: 'idle' })}
                className="flex-1 justify-center py-2.5 text-sm"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={busy || confirmCode.trim().length < 6}
                className="flex-1 justify-center py-2.5 text-sm"
              >
                {busy ? 'Checking…' : 'Confirm'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Backup codes: shown exactly once ────────────────────────────────── */}
      <Modal
        isOpen={flow.kind === 'backup-codes'}
        onClose={() => setFlow({ kind: 'idle' })}
        className="max-w-md"
      >
        {flow.kind === 'backup-codes' && (
          <BackupCodesPanel
            heading={flow.heading}
            codes={flow.codes}
            onDone={() => setFlow({ kind: 'idle' })}
          />
        )}
      </Modal>

      {/* ── Password confirmation ───────────────────────────────────────────── */}
      <Modal
        isOpen={passwordPrompt !== null}
        onClose={() => {
          setPasswordPrompt(null);
          setPassword('');
        }}
        className="max-w-sm"
      >
        <form onSubmit={submitPassword}>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
            {passwordPrompt === 'disable' ? 'Turn off two-step verification?' : 'Confirm your password'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
            {passwordPrompt === 'disable'
              ? 'Your account will be protected by your password alone. Enter your password to confirm.'
              : 'Your existing backup codes will stop working and be replaced with a new set.'}
          </p>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field py-3 text-sm font-medium mb-5"
            placeholder="Your password"
          />
          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPasswordPrompt(null);
                setPassword('');
              }}
              className="flex-1 justify-center py-2.5 text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={passwordPrompt === 'disable' ? 'danger' : 'primary'}
              disabled={busy || !password}
              className="flex-1 justify-center py-2.5 text-sm"
            >
              {busy ? 'Working…' : passwordPrompt === 'disable' ? 'Turn off' : 'Generate'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

function MethodCard({
  icon,
  title,
  description,
  actionLabel,
  recommended,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  recommended?: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 dark:border-white/10 p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="text-primary-600 dark:text-primary-400">{icon}</span>
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h4>
        {recommended && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300">
            Recommended
          </span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4 flex-1">
        {description}
      </p>
      <Button
        variant="secondary"
        onClick={onClick}
        disabled={busy}
        className="w-full justify-center py-2 text-sm"
      >
        {actionLabel}
      </Button>
    </div>
  );
}

/**
 * These codes exist only in this render — the server keeps hashes. The confirm
 * checkbox is there because "I'll save them later" is how people end up locked
 * out after losing a phone.
 */
function BackupCodesPanel({
  heading,
  codes,
  onDone,
}: {
  heading: string;
  codes: string[];
  onDone: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  const copyAll = () => {
    navigator.clipboard?.writeText(codes.join('\n'));
    toast.success('Backup codes copied');
  };

  const download = () => {
    const body = [
      'PeopleNIT SMS — backup codes',
      `Generated ${new Date().toLocaleString()}`,
      '',
      'Each code can be used once to sign in if you lose your device.',
      '',
      ...codes,
      '',
    ].join('\n');

    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'peoplenit-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-4">
        <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">{heading}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
        Save these somewhere safe. Each one signs you in once if you lose access to your device.
      </p>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3 mb-4">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
          This is the only time these codes are shown. We cannot show them again.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 mb-4">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-2.5 py-2 text-center font-mono text-sm font-semibold text-slate-800 dark:text-slate-200"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="flex gap-2.5 mb-5">
        <Button variant="secondary" onClick={copyAll} className="flex-1 justify-center py-2 text-sm">
          <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
        </Button>
        <Button variant="secondary" onClick={download} className="flex-1 justify-center py-2 text-sm">
          <Download className="w-3.5 h-3.5 mr-1.5" /> Download
        </Button>
      </div>

      <label className="flex items-start gap-2.5 mb-5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="w-4 h-4 mt-0.5 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
        <span className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          I have saved these codes somewhere safe.
        </span>
      </label>

      <Button
        variant="primary"
        onClick={onDone}
        disabled={!acknowledged}
        className="w-full justify-center py-2.5 text-sm"
      >
        Done
      </Button>
    </>
  );
}

export default SecuritySettings;
