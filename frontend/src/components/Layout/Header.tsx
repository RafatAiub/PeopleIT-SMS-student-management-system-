import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Bell, Sun, Moon, Monitor, Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../../hooks/useNotifications';
import { useAuthStore } from '../../store/authStore';
import { LogoMark } from '../common/LogoMark';
import { getPageLabel } from './Sidebar';

// The server sends the business event type; the header maps it to a severity
// purely for iconography. Unknown/new types degrade to 'info' rather than
// rendering nothing.
const severityForType = (type: string): 'info' | 'success' | 'warning' | 'error' => {
  switch (type) {
    case 'PAYMENT_RECEIVED':
      return 'success';
    case 'FEE_REMINDER':
      return 'warning';
    case 'ABSENCE_ALERT':
      return 'error';
    default:
      return 'info';
  }
};

const notificationIcon = (type: 'info' | 'success' | 'warning' | 'error') => {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 flex-shrink-0" />;
    default:
      return <Info className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />;
  }
};

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const dropdownMotion = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.15, ease: 'easeOut' as const },
};

export const Header: React.FC = () => {
  const { toggleMobileMenu, theme, setTheme, institutionLogo } = useUiStore();
  const { user, supportSession } = useAuthStore();
  // See Sidebar.tsx — a bare Super Admin shouldn't show any institution's logo.
  const showInstitutionBranding = user?.role !== 'SUPER_ADMIN' || !!supportSession;
  const navigate = useNavigate();
  const location = useLocation();
  // Sidebar already carries the brand identity on desktop (expanded or
  // collapsed) — repeating it here too would just be visual noise. The
  // header's job on desktop is to say *where you are*; on mobile, where the
  // sidebar is hidden behind the hamburger drawer, it's the only brand
  // touchpoint, so it shows the logo there instead.
  const pageLabel = getPageLabel(location.pathname, user?.role);
  const [themeMenuOpen, setThemeMenuOpen] = React.useState(false);
  const themeMenuRef = React.useRef<HTMLDivElement>(null);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const notificationsRef = React.useRef<HTMLDivElement>(null);
  const { data: notificationData } = useNotifications({ page: 1, pageSize: 20 });
  const notifications = notificationData?.notifications ?? [];
  const unreadCount = notificationData?.unreadCount ?? 0;
  const markNotificationRead = useMarkNotificationRead();
  const markAllNotificationsRead = useMarkAllNotificationsRead();

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'U';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8 bg-white/80 dark:bg-surface-900/80 backdrop-blur-md shadow-xs border-b border-slate-200 dark:border-white/5 transition-colors duration-300">
      <div className="flex items-center">
        {/* Mobile Hamburger toggle */}
        <button
          id="mobile-menu-toggle"
          onClick={toggleMobileMenu}
          className="p-2 -ml-2 mr-2 text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl md:hidden transition-colors"
          title="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Brand — mobile only. The sidebar (always visible on desktop,
            expanded or collapsed) already owns the brand identity there. */}
        <div className="flex items-center gap-2.5 md:hidden">
          {showInstitutionBranding && institutionLogo ? (
            <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 p-0.5 flex items-center justify-center flex-shrink-0 shadow-xs overflow-hidden hidden sm:flex">
              <img src={institutionLogo} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <LogoMark className="w-7 h-7 flex-shrink-0 hidden sm:block" />
          )}
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-accent-600 dark:from-primary-400 dark:to-accent-400">
            PeopleIT SMS
          </h1>
        </div>

        {/* Page title — desktop only, replaces the brand repeat with
            something actually useful: where you are right now. */}
        <h2 className="hidden md:block text-lg font-bold text-slate-900 dark:text-white">
          {pageLabel}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        {/* Smart Theme Toggle Button */}
        <div className="relative" ref={themeMenuRef}>
          <button
            onClick={() => setThemeMenuOpen(!themeMenuOpen)}
            className="relative p-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all duration-300 active:scale-95 flex items-center justify-center border border-transparent hover:border-slate-200 dark:hover:border-white/10"
            title={`Theme: ${theme.toUpperCase()} (Click to change)`}
          >
            {theme === 'light' && <Sun className="w-4.5 h-4.5 text-amber-500 animate-spin-slow" />}
            {theme === 'dark' && <Moon className="w-4.5 h-4.5 text-primary-500 dark:text-primary-400" />}
            {theme === 'system' && <Monitor className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />}
          </button>

          <AnimatePresence>
            {themeMenuOpen && (
              <motion.div
                {...dropdownMotion}
                className="absolute right-0 mt-2.5 w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl py-1.5 shadow-xl z-50 origin-top-right"
              >
                <button
                  onClick={() => {
                    setTheme('light');
                    setThemeMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-all ${
                    theme === 'light'
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  Light
                </button>
                <button
                  onClick={() => {
                    setTheme('dark');
                    setThemeMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-all ${
                    theme === 'dark'
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Moon className="w-4 h-4 text-primary-500 dark:text-primary-400" />
                  Dark
                </button>
                <button
                  onClick={() => {
                    setTheme('system');
                    setThemeMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition-all ${
                    theme === 'system'
                      ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Monitor className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                  System
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            title="Notifications"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-surface-900">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                {...dropdownMotion}
                className="absolute right-0 mt-2.5 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl z-50 origin-top-right overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllNotificationsRead.mutate()}
                      disabled={markAllNotificationsRead.isPending}
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      You're all caught up.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          if (!n.readAt) markNotificationRead.mutate(n.id);
                          setNotificationsOpen(false);
                          navigate(n.data?.link ?? '/notices');
                        }}
                        className={`w-full text-left px-4 py-3 flex items-start gap-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${
                          !n.readAt ? 'bg-blue-50/50 dark:bg-blue-500/5' : ''
                        }`}
                      >
                        {notificationIcon(severityForType(n.type))}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{n.title}</span>
                            {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => {
                    setNotificationsOpen(false);
                    navigate('/notices');
                  }}
                  className="w-full px-4 py-2.5 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-white/5 border-t border-slate-100 dark:border-white/5 transition-colors"
                >
                  View all notices
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center text-xs font-bold text-white shadow-xs ring-2 ring-white dark:ring-white/10">
          {initials}
        </div>
      </div>
    </header>
  );
};
