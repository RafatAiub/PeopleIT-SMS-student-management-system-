import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu, Bell, Sun, Moon, Monitor, Info, CheckCircle2, AlertTriangle, AlertCircle,
  Search, Languages, Settings as SettingsIcon, LogOut, Keyboard, Building2, CreditCard as IdCard,
} from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../../hooks/useNotifications';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { useLocaleStore, useT } from '../../i18n';
import { LogoMark } from '../common/LogoMark';
import { Dropdown } from '../ui/Dropdown';
import { Avatar, Kbd } from '../ui/Display';
import { cn } from '../../lib/cn';
import { getPageLabel, ROLE_LABEL } from './Sidebar';
import { openCommandPalette } from './CommandPalette';

// The server sends the business event type; the header maps it to a severity
// purely for iconography. Unknown/new types degrade to 'info' rather than
// rendering nothing.
const severityForType = (type: string): 'info' | 'success' | 'warning' | 'error' => {
  switch (type) {
    case 'PAYMENT_RECEIVED':
    case 'SUBSCRIPTION_ACTIVATED':
    case 'SUBSCRIPTION_REFUNDED':
      return 'success';
    case 'FEE_REMINDER':
    case 'SUBSCRIPTION_TRIAL_ENDING':
    case 'SUBSCRIPTION_PAYMENT_REQUESTED':
    case 'SUBSCRIPTION_REFUND_INITIATED':
      return 'warning';
    case 'ABSENCE_ALERT':
    case 'SUBSCRIPTION_PAYMENT_FAILED':
    case 'SUBSCRIPTION_TRIAL_EXPIRED':
    case 'SUBSCRIPTION_GRACE':
    case 'SUBSCRIPTION_SUSPENDED':
      return 'error';
    default:
      return 'info';
  }
};

const notificationIcon = (type: 'info' | 'success' | 'warning' | 'error') => {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-300 shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-300 shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-blue-600 dark:text-blue-300 shrink-0" />;
  }
};

// Platform subscription-billing notifications hard-code `data.link = '/billing'`,
// but that route is ADMIN-only. Super admins receive the same notifications and
// their billing portal lives under `/super-admin/billing` (receipts included),
// so rewrite the prefix for that role only. Non-super-admins are unaffected.
const resolveNotificationLink = (link: string | undefined, role: string | undefined): string => {
  if (!link) return '/notices';
  if (role === 'SUPER_ADMIN' && link.startsWith('/billing')) {
    return `/super-admin${link}`;
  }
  return link;
};

const iconBtn =
  'relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/8 transition-colors';

export const Header: React.FC = () => {
  const { toggleMobileMenu, theme, setTheme, institutionLogo, institutionName } = useUiStore();
  const { user, supportSession } = useAuthStore();
  const { logout } = useAuth();
  const { lang, setLang } = useLocaleStore();
  const t = useT();
  // See Sidebar.tsx — a bare Super Admin shouldn't show any institution's logo.
  const showInstitutionBranding = user?.role !== 'SUPER_ADMIN' || !!supportSession;
  const navigate = useNavigate();
  const location = useLocation();
  const pageLabel = t(getPageLabel(location.pathname, user?.role));
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const notificationsRef = React.useRef<HTMLDivElement>(null);
  const { data: notificationData } = useNotifications({ page: 1, pageSize: 20 });
  const notifications = notificationData?.notifications ?? [];
  const unreadCount = notificationData?.unreadCount ?? 0;
  const markNotificationRead = useMarkNotificationRead();
  const markAllNotificationsRead = useMarkAllNotificationsRead();

  React.useEffect(() => {
    if (!notificationsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNotificationsOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notificationsOpen]);

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return t('Just now');
    if (mins < 60) return t('{n}m ago', { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('{n}h ago', { n: hours });
    return t('{n}d ago', { n: Math.floor(hours / 24) });
  };

  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  // Settings is reachable by every role except MANAGEMENT (App.tsx route guard).
  const canSeeSettings = user?.role !== 'MANAGEMENT';
  // My ID card route guard: TEACHER, ACCOUNTANT, LIBRARIAN, TRANSPORT_OFFICER, STUDENT, MANAGEMENT (sidebar)
  const canSeeIdCard = !!user && ['TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_OFFICER', 'STUDENT', 'MANAGEMENT'].includes(user.role);

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 h-16 px-3 sm:px-6 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-200 dark:border-white/8">
      {/* Mobile menu */}
      <button id="mobile-menu-toggle" type="button" onClick={toggleMobileMenu} className={cn(iconBtn, 'md:hidden -ml-1')} aria-label={t('Open menu')}>
        <Menu className="w-5 h-5" />
      </button>

      {/* Brand (mobile) / page title (desktop) */}
      <div className="flex items-center gap-2.5 min-w-0 md:hidden">
        {showInstitutionBranding && institutionLogo ? (
          <img src={institutionLogo} alt="" className="w-7 h-7 rounded-md object-contain bg-white border border-slate-200" />
        ) : (
          <LogoMark className="w-7 h-7 shrink-0" />
        )}
        <span className="font-semibold text-slate-900 dark:text-white truncate">{pageLabel}</span>
      </div>
      <div className="hidden md:flex items-center gap-3 min-w-0">
        <span className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">{pageLabel}</span>
        {showInstitutionBranding && (institutionName || user?.institutionName) && (
          // Branch/campus switcher slot. The API exposes no branch endpoints yet,
          // so this shows the institution only (no switching) until approved.
          <span className="hidden lg:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-slate-100 dark:bg-white/6 text-xs font-medium text-slate-600 dark:text-slate-300 max-w-56" title="Institution">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{institutionName || user?.institutionName}</span>
          </span>
        )}
      </div>

      <div className="flex-1" />

      {/* Global search → command palette */}
      <button
        type="button"
        onClick={openCommandPalette}
        className="hidden sm:inline-flex items-center gap-2 h-9 w-56 lg:w-72 px-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/4 text-sm text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20 transition-colors"
        aria-label={t('Search or jump to…')}
      >
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left truncate">{t('Search or jump to…')}</span>
        <span className="flex gap-0.5"><Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd><Kbd>K</Kbd></span>
      </button>
      <button type="button" onClick={openCommandPalette} className={cn(iconBtn, 'sm:hidden')} aria-label={t('Search')}>
        <Search className="w-5 h-5" />
      </button>

      {/* Language */}
      <button
        type="button"
        onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
        className={cn(iconBtn, 'w-auto px-2.5 gap-1.5 text-xs font-semibold')}
        aria-label={`${t('Language')}: ${lang === 'en' ? 'English' : 'বাংলা'}`}
        title={t('Language')}
      >
        <Languages className="w-4 h-4" />
        <span className="hidden sm:inline">{lang === 'en' ? 'বাংলা' : 'EN'}</span>
      </button>

      {/* Theme */}
      <Dropdown
        width="w-40"
        trigger={(p) => (
          <button {...p} type="button" className={cn(iconBtn, 'hidden sm:inline-flex')} aria-label={`${t('Theme')}: ${t(theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System')}`}>
            <ThemeIcon className="w-4.5 h-4.5" />
          </button>
        )}
        sections={[
          {
            label: t('Theme'),
            items: [
              { id: 'light', label: t('Light'), icon: <Sun />, selected: theme === 'light', onSelect: () => setTheme('light') },
              { id: 'dark', label: t('Dark'), icon: <Moon />, selected: theme === 'dark', onSelect: () => setTheme('dark') },
              { id: 'system', label: t('System'), icon: <Monitor />, selected: theme === 'system', onSelect: () => setTheme('system') },
            ],
          },
        ]}
      />

      {/* Notifications */}
      <div className="relative" ref={notificationsRef}>
        <button
          type="button"
          onClick={() => setNotificationsOpen(!notificationsOpen)}
          aria-label={`${t('Notifications')}${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          aria-expanded={notificationsOpen}
          className={iconBtn}
        >
          <Bell className="w-4.5 h-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-primary-600 text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-slate-950">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <AnimatePresence>
          {notificationsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-auto mt-0 sm:mt-2 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg z-50 origin-top-right overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/6">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{t('Notifications')}</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllNotificationsRead.mutate()}
                    disabled={markAllNotificationsRead.isPending}
                    className="text-xs font-semibold text-primary-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  >
                    {t('Mark all read')}
                  </button>
                )}
              </div>
              <div className="max-h-[60vh] sm:max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">{t("You're all caught up.")}</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => {
                        if (!n.readAt) markNotificationRead.mutate(n.id);
                        setNotificationsOpen(false);
                        navigate(resolveNotificationLink(n.data?.link, user?.role));
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-slate-50 dark:hover:bg-white/5',
                        !n.readAt && 'bg-primary-50/50 dark:bg-primary-500/5'
                      )}
                    >
                      <span className="mt-0.5">{notificationIcon(severityForType(n.type))}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{n.title}</span>
                          {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" aria-label="unread" />}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  navigate('/notices');
                }}
                className="w-full px-4 py-2.5 text-center text-xs font-semibold text-primary-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-white/5 border-t border-slate-100 dark:border-white/6 transition-colors"
              >
                {t('View all notices')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Profile */}
      <Dropdown
        width="w-60"
        header={
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{fullName || 'User'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {user ? t(ROLE_LABEL[user.role]) : ''}
              {user?.email ? ` · ${user.email}` : ''}
            </p>
          </div>
        }
        trigger={(p) => (
          <button {...p} type="button" className="ml-1 rounded-full focus-visible:outline-2" aria-label={t('Profile')}>
            <Avatar name={fullName} src={user?.avatarUrl} size="sm" />
          </button>
        )}
        sections={[
          {
            items: [
              ...(canSeeSettings ? [{ id: 'settings', label: t('Settings'), icon: <SettingsIcon />, onSelect: () => navigate('/settings') }] : []),
              ...(canSeeIdCard ? [{ id: 'idcard', label: t('My ID Card'), icon: <IdCard />, onSelect: () => navigate('/id-cards/mine') }] : []),
              {
                id: 'lang',
                label: `${t('Language')}: ${lang === 'en' ? 'English' : 'বাংলা'}`,
                icon: <Languages />,
                onSelect: () => setLang(lang === 'en' ? 'bn' : 'en'),
              },
              {
                id: 'theme',
                label: `${t('Theme')}: ${t(theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System')}`,
                icon: <ThemeIcon />,
                onSelect: () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'),
              },
              {
                id: 'shortcuts',
                label: t('Keyboard shortcuts'),
                icon: <Keyboard />,
                hint: '?',
                onSelect: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true })),
              },
            ],
          },
          {
            items: [
              {
                id: 'signout',
                label: t('Sign out'),
                icon: <LogOut />,
                danger: true,
                onSelect: () => logout.mutate(undefined, { onSettled: () => navigate('/login') }),
              },
            ],
          },
        ]}
      />
    </header>
  );
};
