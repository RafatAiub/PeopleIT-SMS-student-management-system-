/** `/account` (login / register / orders / overview / forgot / reset-password). */
import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { LogOut, PackageCheck } from 'lucide-react';
import { useSiteAccount } from '../account';
import { SiteApiError } from '../api';
import { SiteLink, SkeletonRows } from '../blocks/shared';
import { useSiteRuntime, useSiteText } from '../runtime';
import { formatSiteDate, formatSiteMoney } from '../strings';
import { useSiteSeo } from './seo';

type AccountSub = 'login' | 'register' | 'orders' | 'forgot' | 'reset-password' | undefined;

function LoginForm() {
  const { s } = useSiteText();
  const account = useSiteAccount();
  const uid = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await account.login({ email: email.trim(), password });
    } catch {
      setError(s('Invalid email or password'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3">
      <h1 className="site-h2 text-center">{s('Sign in')}</h1>
      <div><label className="site-label" htmlFor={`${uid}-email`}>{s('Email')}</label><input id={`${uid}-email`} type="email" required className="site-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      <div><label className="site-label" htmlFor={`${uid}-pass`}>{s('Password')}</label><input id={`${uid}-pass`} type="password" required className="site-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
      {error && <p className="site-error" role="alert">{error}</p>}
      <button type="submit" className="site-btn site-btn-primary" disabled={busy}>{s('Sign in')}</button>
      <SiteLink href="/account/forgot" className="text-center text-sm">{s('Forgot password?')}</SiteLink>
      <SiteLink href="/account/register" className="text-center text-sm">{s('New here? Create an account')}</SiteLink>
    </form>
  );
}

function ForgotPasswordForm() {
  const { siteId, api } = useSiteRuntime();
  const { s } = useSiteText();
  const uid = useId();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteId) return;
    setBusy(true);
    setError(null);
    try {
      await api.accountForgot(siteId, email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof SiteApiError ? err.message : s('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <div className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3 text-center">
        <h1 className="site-h2">{s('Forgot password?')}</h1>
        <p className="site-alert site-alert-success">{s('If that account exists, we’ve sent a reset link to it.')}</p>
        <SiteLink href="/account/login" className="text-center text-sm">{s('Already have an account? Sign in')}</SiteLink>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3">
      <h1 className="site-h2 text-center">{s('Forgot password?')}</h1>
      <p className="site-muted text-sm">{s('Enter your account email and we’ll send you a link to reset your password.')}</p>
      <div><label className="site-label" htmlFor={`${uid}-email`}>{s('Email')}</label><input id={`${uid}-email`} type="email" required className="site-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      {error && <p className="site-error" role="alert">{error}</p>}
      <button type="submit" className="site-btn site-btn-primary" disabled={busy || !email.trim()}>{s('Send reset link')}</button>
      <SiteLink href="/account/login" className="text-center text-sm">{s('Already have an account? Sign in')}</SiteLink>
    </form>
  );
}

function ResetPasswordForm() {
  const { siteId, api } = useSiteRuntime();
  const { s } = useSiteText();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const uid = useId();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteId) return;
    setBusy(true);
    setError(null);
    try {
      await api.accountReset(siteId, token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof SiteApiError ? err.message : s('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };
  if (!token) {
    return (
      <div className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3 text-center">
        <h1 className="site-h2">{s('Reset password')}</h1>
        <p className="site-error" role="alert">{s('This reset link is invalid or has expired.')}</p>
        <SiteLink href="/account/forgot" className="text-center text-sm">{s('Forgot password?')}</SiteLink>
      </div>
    );
  }
  if (done) {
    return (
      <div className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3 text-center">
        <h1 className="site-h2">{s('Reset password')}</h1>
        <p className="site-alert site-alert-success">{s('Your password has been reset. You can now sign in.')}</p>
        <SiteLink href="/account/login" className="site-btn site-btn-primary">{s('Sign in')}</SiteLink>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3">
      <h1 className="site-h2 text-center">{s('Reset password')}</h1>
      <div><label className="site-label" htmlFor={`${uid}-pass`}>{s('New password')}</label><input id={`${uid}-pass`} type="password" minLength={8} required className="site-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
      {error && <p className="site-error" role="alert">{error}</p>}
      <button type="submit" className="site-btn site-btn-primary" disabled={busy || password.length < 8}>{s('Reset password')}</button>
    </form>
  );
}

function RegisterForm() {
  const { s } = useSiteText();
  const account = useSiteAccount();
  const uid = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await account.register({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password });
    } catch (err) {
      setError(err instanceof SiteApiError ? err.message : s('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="site-card site-card-pad mx-auto flex w-full max-w-sm flex-col gap-3">
      <h1 className="site-h2 text-center">{s('Create account')}</h1>
      <div><label className="site-label" htmlFor={`${uid}-name`}>{s('Full name')}</label><input id={`${uid}-name`} required className="site-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
      <div><label className="site-label" htmlFor={`${uid}-email`}>{s('Email')}</label><input id={`${uid}-email`} type="email" required className="site-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      <div><label className="site-label" htmlFor={`${uid}-phone`}>{s('Mobile number')}</label><input id={`${uid}-phone`} className="site-input" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></div>
      <div><label className="site-label" htmlFor={`${uid}-pass`}>{s('Password')}</label><input id={`${uid}-pass`} type="password" minLength={8} required className="site-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
      {error && <p className="site-error" role="alert">{error}</p>}
      <button type="submit" className="site-btn site-btn-primary" disabled={busy}>{s('Create account')}</button>
      <SiteLink href="/account/login" className="text-center text-sm">{s('Already have an account? Sign in')}</SiteLink>
    </form>
  );
}

function OrdersList() {
  const { siteId, api, lang } = useSiteRuntime();
  const { s } = useSiteText();
  const account = useSiteAccount();
  const q = useQuery({
    queryKey: ['site-account-orders', siteId, account.token],
    queryFn: () => api.accountOrders(siteId!, account.token!),
    enabled: Boolean(siteId && account.token),
  });
  if (q.isLoading) return <SkeletonRows rows={2} className="h-20" />;
  if (!q.data?.length) return <p className="site-empty"><span className="site-empty-title">{s('You haven’t placed any orders yet.')}</span></p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {q.data.map((o) => (
        <li key={o.orderNo}>
          <SiteLink href={`/order/${o.orderNo}?email=${encodeURIComponent(o.email)}`} className="site-card site-card-pad flex items-center justify-between gap-3 no-underline">
            <div className="min-w-0">
              <p className="font-semibold">{o.orderNo}</p>
              <p className="site-muted text-sm">{formatSiteDate(o.createdAt, lang)}</p>
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="site-badge site-badge-accent">{s(o.status)}</span>
              <span className="font-bold">{formatSiteMoney(o.total, o.currency, lang)}</span>
            </div>
          </SiteLink>
        </li>
      ))}
    </ul>
  );
}

function AccountOverview() {
  const { s } = useSiteText();
  const account = useSiteAccount();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="site-card site-card-pad flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{account.customer?.name}</p>
          <p className="site-muted text-sm">{account.customer?.email}</p>
        </div>
        <button type="button" className="site-btn site-btn-outline site-btn-sm" onClick={account.logout}><LogOut size={16} className="mr-1 inline" aria-hidden />{s('Log out')}</button>
      </div>
      <div className="flex flex-wrap gap-3">
        <SiteLink href="/account/orders" className="site-btn site-btn-outline"><PackageCheck size={16} className="mr-1 inline" aria-hidden />{s('My orders')}</SiteLink>
        <SiteLink href="/learn" className="site-btn site-btn-outline">{s('My courses')}</SiteLink>
      </div>
    </div>
  );
}

export function AccountView({ sub }: { sub: AccountSub }) {
  const { lang, settings } = useSiteRuntime();
  const { s } = useSiteText();
  const account = useSiteAccount();
  useSiteSeo({ title: `${s('Account')} | ${settings.siteName}`, lang, siteName: settings.siteName, noindex: true });

  if (sub === 'forgot') return <section className="site-pad-lg"><div className="site-container"><ForgotPasswordForm /></div></section>;
  if (sub === 'reset-password') return <section className="site-pad-lg"><div className="site-container"><ResetPasswordForm /></div></section>;

  if (!account.token) {
    return <section className="site-pad-lg"><div className="site-container">{sub === 'register' ? <RegisterForm /> : <LoginForm />}</div></section>;
  }

  if (sub === 'orders') {
    return (
      <section className="site-pad-md">
        <div className="site-container site-w-narrow">
          <h1 className="site-h1 mb-6">{s('My orders')}</h1>
          <OrdersList />
        </div>
      </section>
    );
  }

  return <section className="site-pad-md"><div className="site-container"><AccountOverview /></div></section>;
}
